/**
 * @module app/graze
 * graze.js — GRAZE: 弾幕サバイバル
 *
 * マウスで自機を操作し、四方から押し寄せる弾幕を避け続ける。
 * 弾をギリギリで避ける「グレイズ」でスコア倍率が跳ね上がる。
 *
 * ゲームデザインの核:
 *   リスク＝リターン: グレイズで高得点を狙うほど被弾リスクが上がる。
 *   フロー状態: ウェーブごとに段階的に難易度が上がり、
 *               プレイヤーの限界ギリギリを攻める。
 *   発見: 自機の見た目は 5×5 だが当たり判定は中心 1×1。
 *         「思ったより避けられる！」という気づきが快感になる。
 *
 * 操作:
 *   マウス移動 — 自機がカーソルを追従 (滑らかな慣性つき)
 *   左クリック — ボム発動 (画面上の全弾を消去。限定3発)
 *
 * 演出:
 *   - 残像 (移動軌跡)
 *   - グレイズ閃光 (ニアミス時に中心反転)
 *   - ボム爆発 (全画面反転 + 弾がパーティクル化)
 *   - 画面シェイク (被弾時)
 *   - フォーカスモード (弾が近いと当たり判定を可視化)
 *   - ウェーブ告知テキスト
 */

import * as GPU from "../core/gpu.js";
import { drawText, GLYPH_W, GLYPH_H } from "../core/font.js";
import * as GameUtils from "./game_utils.js";

const APP_NAME = "GRAZE";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const W = 280;
const H = 330;

/** HUD バー高さ (スコア・倍率・ボム表示) */
const HUD_HEIGHT = GLYPH_H + 7;

/** プレイエリア上端 Y (HUD の下) */
const PLAY_AREA_Y = HUD_HEIGHT;

/** プレイエリア高さ */
const PLAY_AREA_HEIGHT = H - HUD_HEIGHT;

// ── 自機 ──
/** 見た目サイズ (5×5 ダイヤモンド) */
const PLAYER_VISUAL_SIZE = 5;
/** 当たり判定サイズ (1×1 中心ピクセル) — 弾幕ゲームの伝統 */
const PLAYER_HIT_SIZE = 1;
/** グレイズ判定半径 (px) */
const GRAZE_RADIUS = 12;
/** カーソル追従の lerp 係数 (0–1, 大きいほど機敏) */
const PLAYER_LERP_FACTOR = 0.18;
/** 残像数 */
const AFTERIMAGE_COUNT = 5;

// ── 弾 ──
const BULLET_MAX = 250;
const BULLET_SIZE = 3;

// ── パーティクル ──
const PARTICLE_MAX = 100;
const PARTICLE_LIFE = 16;

// ── ウェーブ ──
const WAVE_DURATION = 680; // 1ウェーブの全長 (フレーム)
const WAVE_REST = 90; // ウェーブ冒頭の休憩 (フレーム)

// ── ボム ──
const BOMB_MAX = 3;
const BOMB_INVINCIBILITY = 40; // ボム後の無敵フレーム数

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @type {"ready"|"playing"|"dead"} */
let state = "ready";

let score = 0;
let hiScore = 0;
let wave = 1;
let waveFrame = 0;
let frame = 0;

// 倍率
let multiplier = 1;
let multiplierGraceTimer = 0; // グレイズ後の倍率維持猛予 (フレーム)
let bestMultiplier = 1;

// ボム
let bombs = BOMB_MAX;
let bombFlash = 0; // ボム閃光残りフレーム
let invincibilityTimer = 0; // 無敵残りフレーム

// シェイク
let shakeTimer = 0;

// ── 自機 ──
let playerX = W / 2;
let playerY = H - 40;
let targetX = playerX;
let targetY = playerY;

/** @type {{x:number, y:number}[]} */
let afterimages = [];

/** フォーカスモード: 弾が近い時 true */
let focusShow = false;
/** グレイズ閃光カウンタ */
let grazeFlash = 0;

// ── 弾 ──
/** @type {{x:number, y:number, dx:number, dy:number, grazed:boolean}[]} */
let bullets = [];

// ── パーティクル ──
/** @type {{x:number, y:number, dx:number, dy:number, life:number, maxLife:number}[]} */
let particles = [];

// ── スポナー ──
/** @type {{type:string, interval:number, timer:number, angle?:number}[]} */
let spawners = [];

// ── スパイラル用回転角 ──
let spiralAngle = 0;

/** ポーズ中フラグ */
let paused = false;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  サウンド
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let sfx = null;

function initSfx() {
  if (sfx) return;
  sfx = GameUtils.createSfxChannels({
    graze: { wave: "sq25", adsr: [1, 25, 0, 15], vol: 18 },
    bomb: { wave: "noise", adsr: [1, 250, 0, 150], vol: 30 },
    die: { wave: "noise", adsr: [1, 300, 0, 200], vol: 28 },
    wave: { wave: "sq50", adsr: [1, 100, 0, 60], vol: 20 },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ウェーブ / スポナー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 速度倍率 (ウェーブが進むほど弾が速くなる) */
function speedMultiplier() {
  return 1.0 + (wave - 1) * 0.07;
}

/**
 * ウェーブ番号に応じてスポナーを構成する。
 * 段階的に弾幕パターンを追加し、同時にインターバルを短縮する。
 */
function configureWave(w) {
  spawners = [];
  spiralAngle = 0;

  // 基本: 狙い撃ち (全ウェーブ)
  const aimedInt = Math.max(50 - w * 3, 18);
  spawners.push({ type: "aimed", interval: aimedInt, timer: 0 });
  if (w >= 2)
    spawners.push({ type: "aimed", interval: aimedInt + 10, timer: 15 });

  // Wave 2+: 雨 (上から降り注ぐ)
  if (w >= 2) {
    const rainInt = Math.max(14 - w, 5);
    spawners.push({ type: "rain", interval: rainInt, timer: 0 });
  }

  // Wave 3+: 螺旋
  if (w >= 3) {
    const spiralInt = Math.max(10 - ((w - 3) | 0), 4);
    spawners.push({ type: "spiral", interval: spiralInt, timer: 0 });
  }

  // Wave 4+: 扇状弾
  if (w >= 4) {
    const spreadInt = Math.max(70 - w * 4, 28);
    spawners.push({ type: "spread", interval: spreadInt, timer: 0 });
  }

  // Wave 5+: リングバースト
  if (w >= 5) {
    const ringInt = Math.max(100 - w * 5, 36);
    spawners.push({ type: "ring", interval: ringInt, timer: 0 });
  }

  // Wave 7+: 追加螺旋 (逆回転)
  if (w >= 7) {
    spawners.push({ type: "spiral_r", interval: 6, timer: 0 });
  }
}

function addBullet(x, y, dx, dy) {
  if (bullets.length >= BULLET_MAX) bullets.shift();
  bullets.push({ x, y, dx, dy, grazed: false });
}

// ── パターン生成関数 ──

function spawnAimed() {
  const spd = 1.2 * speedMultiplier();
  const edge = (Math.random() * 4) | 0;
  let sx, sy;
  switch (edge) {
    case 0:
      sx = Math.random() * W;
      sy = PLAY_AREA_Y;
      break;
    case 1:
      sx = W;
      sy = PLAY_AREA_Y + Math.random() * PLAY_AREA_HEIGHT;
      break;
    case 2:
      sx = Math.random() * W;
      sy = H;
      break;
    default:
      sx = 0;
      sy = PLAY_AREA_Y + Math.random() * PLAY_AREA_HEIGHT;
      break;
  }
  const dx = playerX - sx;
  const dy = playerY - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  addBullet(sx, sy, (dx / len) * spd, (dy / len) * spd);
}

function spawnRain() {
  const spd = 0.8 * speedMultiplier();
  const sx = Math.random() * (W - 10) + 5;
  addBullet(sx, PLAY_AREA_Y, (Math.random() - 0.5) * 0.15, spd);
}

function spawnSpiral(reverse) {
  const spd = 0.9 * speedMultiplier();
  // 発射元: 上辺を左右にゆらぐ
  const ox = W / 2 + Math.sin(frame * 0.008) * (W * 0.35);
  const a = reverse ? -spiralAngle : spiralAngle;
  addBullet(ox, PLAY_AREA_Y + 5, Math.cos(a) * spd, Math.sin(a) * spd);
  spiralAngle += 0.28;
}

function spawnSpread() {
  const spd = 1.2 * speedMultiplier();
  const edge = (Math.random() * 4) | 0;
  let sx, sy;
  switch (edge) {
    case 0:
      sx = Math.random() * W;
      sy = PLAY_AREA_Y;
      break;
    case 1:
      sx = W;
      sy = PLAY_AREA_Y + Math.random() * PLAY_AREA_HEIGHT;
      break;
    case 2:
      sx = Math.random() * W;
      sy = H;
      break;
    default:
      sx = 0;
      sy = PLAY_AREA_Y + Math.random() * PLAY_AREA_HEIGHT;
      break;
  }
  const dx = playerX - sx;
  const dy = playerY - sy;
  const base = Math.atan2(dy, dx);
  const count = 5;
  const arc = 0.6;
  for (let i = 0; i < count; i++) {
    const a = base + (i - (count - 1) / 2) * (arc / (count - 1));
    addBullet(sx, sy, Math.cos(a) * spd, Math.sin(a) * spd);
  }
}

function spawnRing() {
  const spd = 0.85 * speedMultiplier();
  const sx = 30 + Math.random() * (W - 60);
  const sy = PLAY_AREA_Y + 20 + Math.random() * (PLAY_AREA_HEIGHT * 0.4);
  const count = 12;
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + frame * 0.02;
    addBullet(sx, sy, Math.cos(a) * spd, Math.sin(a) * spd);
  }
}

function updateSpawners() {
  for (const sp of spawners) {
    sp.timer--;
    if (sp.timer <= 0) {
      sp.timer = sp.interval;
      switch (sp.type) {
        case "aimed":
          spawnAimed();
          break;
        case "rain":
          spawnRain();
          break;
        case "spiral":
          spawnSpiral(false);
          break;
        case "spiral_r":
          spawnSpiral(true);
          break;
        case "spread":
          spawnSpread();
          break;
        case "ring":
          spawnRing();
          break;
      }
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  パーティクル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function emitParticles(cx, cy, n) {
  for (let i = 0; i < n; i++) {
    if (particles.length >= PARTICLE_MAX) particles.shift();
    const a = Math.random() * Math.PI * 2;
    const s = 0.6 + Math.random() * 2.2;
    const life = PARTICLE_LIFE + ((Math.random() * 8) | 0);
    particles.push({
      x: cx,
      y: cy,
      dx: Math.cos(a) * s,
      dy: Math.sin(a) * s - 0.3,
      life,
      maxLife: life,
    });
  }
}

function updateParticles() {
  GameUtils.tickParticles(particles);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ボム
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function doBomb() {
  if (bombs <= 0) return;
  initSfx();
  bombs--;
  bombFlash = 10;
  invincibilityTimer = BOMB_INVINCIBILITY;

  // 全弾をパーティクル化 → スコア加算
  for (const b of bullets) {
    score += 5 * multiplier;
    emitParticles(b.x, b.y, 2);
  }
  bullets = [];
  GameUtils.playSfx(sfx?.bomb, 36);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  毎フレーム更新
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function tick() {
  // ── ポーズ判定 ──
  paused = app.isPaused();
  if (paused) return;

  frame++;
  if (state !== "playing") {
    // dead 状態でもパーティクルは更新し続ける
    updateParticles();
    return;
  }

  // ── タイマー減衰 ──
  if (shakeTimer > 0) shakeTimer--;
  if (bombFlash > 0) bombFlash--;
  if (invincibilityTimer > 0) invincibilityTimer--;
  if (grazeFlash > 0) grazeFlash--;

  // ── 倍率デケイ ──
  if (multiplierGraceTimer > 0) {
    multiplierGraceTimer--;
  } else if (multiplier > 1) {
    // ゆっくり減衰 (4フレームごとに1減少)
    if (frame % 4 === 0) multiplier = Math.max(1, multiplier - 1);
  }

  // ── ウェーブ進行 ──
  waveFrame++;
  if (waveFrame >= WAVE_DURATION) {
    wave++;
    waveFrame = 0;
    configureWave(wave);
    invincibilityTimer = Math.max(invincibilityTimer, 20); // ウェーブ転換時の短い無敵
    // Wave 5 ごとにボム +1
    if (wave % 5 === 1 && bombs < BOMB_MAX) bombs++;
    GameUtils.playSfx(sfx?.wave, 72);
  }

  // ── スポナー (休憩期間はスポーンしない) ──
  if (waveFrame >= WAVE_REST) {
    updateSpawners();
  }

  // ── 自機移動 (慣性つき追従) ──
  playerX += (targetX - playerX) * PLAYER_LERP_FACTOR;
  playerY += (targetY - playerY) * PLAYER_LERP_FACTOR;
  playerX = Math.max(3, Math.min(W - 3, playerX));
  playerY = Math.max(PLAY_AREA_Y + 3, Math.min(H - 3, playerY));

  // ── 残像記録 ──
  const prevImg =
    afterimages.length > 0 ? afterimages[afterimages.length - 1] : null;
  const moved =
    !prevImg ||
    Math.abs(playerX - prevImg.x) > 0.8 ||
    Math.abs(playerY - prevImg.y) > 0.8;
  if (moved) {
    afterimages.push({ x: playerX, y: playerY });
    if (afterimages.length > AFTERIMAGE_COUNT) afterimages.shift();
  }

  // ── 弾の移動 ──
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dx;
    b.y += b.dy;
    // 画面外除去
    if (b.x < -15 || b.x > W + 15 || b.y < PLAY_AREA_Y - 15 || b.y > H + 15) {
      bullets.splice(i, 1);
    }
  }

  // ── 衝突判定 ──
  focusShow = false;
  const hx = playerX; // 当たり判定の中心 X
  const hy = playerY; // 当たり判定の中心 Y

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const bcx = b.x + BULLET_SIZE / 2;
    const bcy = b.y + BULLET_SIZE / 2;
    const dx = bcx - hx;
    const dy = bcy - hy;
    const distSq = dx * dx + dy * dy;

    // グレイズ判定 (半径 GRAZE_RADIUS 以内)
    if (distSq < GRAZE_RADIUS * GRAZE_RADIUS) {
      focusShow = true; // 弾が近い → フォーカスモード ON

      // まだグレイズしていない弾なら加点
      if (!b.grazed) {
        b.grazed = true;
        multiplier = Math.min(multiplier + 1, 99);
        multiplierGraceTimer = 50; // グレイズ後 50f は倍率維持
        score += 10 * multiplier;
        grazeFlash = 3;
        // グレイズ火花パーティクル
        emitParticles(b.x, b.y, 1);
        GameUtils.playSfx(sfx?.graze, 84 + Math.min(multiplier, 12));
      }
    }

    // 被弾判定 (1×1 ヒットボックス)
    if (
      invincibilityTimer <= 0 &&
      bcx >= hx - 0.5 &&
      bcx <= hx + 0.5 &&
      bcy >= hy - 0.5 &&
      bcy <= hy + 0.5
    ) {
      // ── 死亡──
      state = "dead";
      if (score > hiScore) hiScore = score;
      if (multiplier > bestMultiplier) bestMultiplier = multiplier;
      shakeTimer = 12; // 短く (結果画面で揺れ続けないように)
      emitParticles(playerX, playerY, 30);
      // 全弾を小パーティクルに変換 (壮大な死亡エフェクト)
      for (const bb of bullets) emitParticles(bb.x, bb.y, 1);
      bullets = [];
      GameUtils.playSfx(sfx?.die, 30);
      return;
    }
  }

  // ── サバイバルスコア ──
  score += 1;

  // ── パーティクル更新 ──
  updateParticles();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 自機を描画する (5×5 ダイヤモンド)。
 */
function drawPlayer(ox, oy) {
  const x = ox + (playerX | 0);
  const y = oy + (playerY | 0);
  GPU.fillRect(x, y - 2, 1, 1, 1);
  GPU.fillRect(x - 1, y - 1, 3, 1, 1);
  GPU.fillRect(x - 2, y, 5, 1, 1);
  GPU.fillRect(x - 1, y + 1, 3, 1, 1);
  GPU.fillRect(x, y + 2, 1, 1, 1);

  // フォーカスモード: 弾が近いとき、中心の 3×3 を反転 → リング形状
  // 「当たり判定はこの中心 1px だけ」と視覚的に伝える
  if (focusShow) {
    GPU.invertRect(x - 1, y - 1, 3, 3);
  }

  // グレイズ閃光: ニアミス時に周囲を一瞬反転
  if (grazeFlash > 0) {
    GPU.invertRect(x - 4, y - 4, 9, 9);
  }

  // 無敵中は自機を点滅
  if (invincibilityTimer > 0 && frame % 4 < 2) {
    GPU.invertRect(x - 2, y - 2, 5, 5);
  }
}

/**
 * 残像を描画する。古い残像ほど小さく・薄く。
 */
function drawAfterimages(ox, oy) {
  for (let i = 0; i < afterimages.length - 1; i++) {
    const a = afterimages[i];
    const ax = ox + (a.x | 0);
    const ay = oy + (a.y | 0);
    const age = afterimages.length - 1 - i; // 大きいほど古い

    if (age <= 1) {
      // 新しい残像: 3×3 クロス
      GPU.fillRect(ax, ay - 1, 1, 3, 1);
      GPU.fillRect(ax - 1, ay, 3, 1, 1);
    } else if (age <= 3) {
      // 中間: チェッカー付き 3×3
      GPU.fillRect(ax - 1, ay - 1, 3, 3, 1);
      GPU.drawCheckerboard(ax - 1, ay - 1, 3, 3, 0);
    } else {
      // 古い残像: 1×1 ドット
      GPU.fillRect(ax, ay, 1, 1, 1);
    }
  }
}

/**
 * HUD (スコア・倍率・ボム) を描画する。
 */
function drawHud(ox, oy) {
  // スコア (左寄せ)
  const st = `${String(score).padStart(6, "0")}`;
  drawText(ox + 4, oy + 3, st, 1);

  // 倍率 (中央)
  const mt = `x${multiplier}`;
  const mtW = GameUtils.textWidth(mt);
  const mtX = GameUtils.centerTextX(ox, W, mt);
  drawText(mtX, oy + 3, mt, 1);

  // 倍率が高い時: 反転で強調 (ジュース!)
  if (multiplier >= 5) {
    GPU.invertRect(mtX - 2, oy + 2, mtW + 4, GLYPH_H + 2);
  }

  // ボム (右寄せ。"BOMB" テキスト + 個数表示)
  const bombTxt = `B:${bombs}`;
  drawText(ox + W - GameUtils.textWidth(bombTxt) - 4, oy + 3, bombTxt, 1);

  // HUD 区切り線
  GPU.hline(ox + 1, ox + W - 2, oy + HUD_HEIGHT - 1, 1);
}

/**
 * onDraw コールバック。毎フレーム呼ばれる。
 */
function onDraw(contentRect) {
  tick();

  // ── 画面シェイク (dead 状態では掛けない → 結果画面が読めるように) ──
  const { sx, sy } = GameUtils.calcShake(shakeTimer, state, ["dead"]);
  const ox = contentRect.x + sx;
  const oy = contentRect.y + sy;

  // 背景クリア
  GPU.fillRect(contentRect.x - 3, contentRect.y - 3, W + 6, H + 6, 0);

  // ── 外枠 ──
  GPU.drawRect(ox, oy, W, H, 1);

  // ── ウェーブ開始時の枠フリッカー ──
  if (state === "playing" && waveFrame < 6 && waveFrame % 2 === 0) {
    GPU.drawRect(ox + 1, oy + HUD_HEIGHT, W - 2, H - HUD_HEIGHT - 1, 1);
  }

  // ── HUD ──
  drawHud(ox, oy);

  // ── プレイエリア背景 (微細ドットで「空間」感を出す) ──
  if (state === "playing" || state === "dead") {
    // チェッカーパターンの薄いドット (弾幕と明確に区別)
    const seed = frame >> 5; // ゆっくり変化
    for (let i = 0; i < 6; i++) {
      const sx2 = ((seed * 31 + i * 97) % (W - 20)) + 10;
      const sy2 =
        PLAY_AREA_Y + ((seed * 53 + i * 71) % (PLAY_AREA_HEIGHT - 20)) + 10;
      // 1px ドットを点滅させて背景感を出す (弾は常時表示)
      if (frame % 8 < 4) {
        GPU.fillRect(ox + sx2, oy + sy2, 1, 1, 1);
      }
    }
  }

  // ── 残像 ──
  if (state === "playing") {
    drawAfterimages(ox, oy);
  }

  // ── 弾 (弾は BULLET_SIZE=3 で白填り + 周囲にドットで背景と区別) ──
  for (const b of bullets) {
    const bpx = (ox + b.x) | 0;
    const bpy = (oy + b.y) | 0;
    GPU.fillRect(bpx, bpy, BULLET_SIZE, BULLET_SIZE, 1);
    // 弾の周囲に 1px 暗いアウトライン (前景感)
    if (!b.grazed) {
      GPU.fillRect(bpx - 1, bpy + 1, 1, 1, 1);
      GPU.fillRect(bpx + BULLET_SIZE, bpy + 1, 1, 1, 1);
    }
  }

  // ── 自機 ──
  if (state === "playing" || state === "dead") {
    drawPlayer(ox, oy);
  }

  // ── パーティクル ──
  for (const p of particles) {
    const ppx = (ox + p.x) | 0;
    const ppy = (oy + p.y) | 0;
    const ratio = p.life / p.maxLife;
    if (ratio > 0.5) {
      GPU.fillRect(ppx, ppy, 2, 2, 1);
    } else {
      GPU.fillRect(ppx, ppy, 1, 1, 1);
    }
  }

  // ── ウェーブ告知 ──
  if (state === "playing" && waveFrame < 55) {
    const wt = `WAVE ${wave}`;
    const wW = GameUtils.textWidth(wt);
    const wx = GameUtils.centerTextX(ox, W, wt);
    const wy = oy + ((H / 2 - 10) | 0);
    // パルス (点滅)
    if (waveFrame < 45 || waveFrame % 4 < 2) {
      GPU.fillRect(wx - 3, wy - 2, wW + 6, GLYPH_H + 4, 1);
      drawText(wx, wy, wt, 0);
    }
  }

  // ── ボム全画面閃光 ──
  if (bombFlash > 0 && bombFlash % 2 === 0) {
    GPU.invertRect(ox + 1, oy + HUD_HEIGHT, W - 2, H - HUD_HEIGHT - 1);
  }

  // ── 状態オーバーレイ ──
  if (state === "ready") {
    GameUtils.drawOverlay(ox, oy, W, H, [
      "GRAZE",
      "",
      "MOUSE: DODGE",
      "CLICK: BOMB",
      "",
      "GRAZE = BONUS!",
      "",
      "CLICK TO START",
    ]);
  } else if (state === "dead") {
    GameUtils.drawOverlay(ox, oy, W, H, [
      "GAME OVER",
      "",
      `SCORE ${score}`,
      `WAVE ${wave}`,
      `BEST x${bestMultiplier}`,
      hiScore > 0 ? `HI ${hiScore}` : "",
      "",
      "CLICK TO RETRY",
    ]);
  }

  // ── ポーズオーバーレイ ──
  if (paused && state !== "ready") {
    GameUtils.drawPauseOverlay(ox, oy, W, H);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  入力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function onInput(ev) {
  // ── マウス追跡 ──
  if (ev.type === "hover" || ev.type === "held" || ev.type === "down") {
    targetX = ev.localX;
    targetY = ev.localY;
  }

  if (ev.type === "down") {
    initSfx();
    switch (state) {
      case "ready":
        newGame();
        break;
      case "playing":
        doBomb();
        break;
      case "dead":
        newGame();
        break;
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ゲーム制御
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function newGame() {
  state = "playing";
  score = 0;
  wave = 1;
  waveFrame = 0;
  multiplier = 1;
  multiplierGraceTimer = 0;
  bestMultiplier = 1;
  bombs = BOMB_MAX;
  bombFlash = 0;
  invincibilityTimer = 60; // 開始直後の猶予
  shakeTimer = 0;
  grazeFlash = 0;
  focusShow = false;

  playerX = W / 2;
  playerY = H - 40;
  targetX = playerX;
  targetY = playerY;
  afterimages = [];

  bullets = [];
  particles = [];
  spiralAngle = 0;
  configureWave(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  footer 描画
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function onDrawFooter(footerRect) {
  drawText(footerRect.x, footerRect.y, `WAVE:${wave}`, 1);
  const hi = `HI:${String(hiScore).padStart(6, "0")}`;
  drawText(footerRect.x + footerRect.w - GameUtils.textWidth(hi), footerRect.y, hi, 1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  閉じる前のリセット
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function onBeforeClose() {
  state = "ready";
  score = 0;
  wave = 1;
  waveFrame = 0;
  frame = 0;
  multiplier = 1;
  multiplierGraceTimer = 0;
  bestMultiplier = 1;
  bombs = BOMB_MAX;
  bombFlash = 0;
  invincibilityTimer = 0;
  shakeTimer = 0;
  grazeFlash = 0;
  focusShow = false;
  paused = false;
  playerX = W / 2;
  playerY = H - 40;
  targetX = playerX;
  targetY = playerY;
  afterimages = [];
  bullets = [];
  particles = [];
  spawners = [];
  spiralAngle = 0;
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  登録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const app = GameUtils.registerGameApp({
  name: APP_NAME,
  width: W,
  height: H,
  onDraw,
  onInput,
  onDrawFooter,
  onBeforeClose,
  category: "GAMES",
  dev: true,
});

