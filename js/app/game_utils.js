/**
 * @module app/game_utils
 * game_utils.js — ゲームアプリ共通ユーティリティ
 *
 * ゲームアプリで繰り返し実装されるパターンを一元化し、
 * バグの原因となるコード重複を排除する。
 *
 * 根本課題:
 *   1. WM 統合パターンが未定義 → ゲームごとにバラバラな実装
 *   2. テキスト幅計算の散在 → 手計算ミスによる描画ズレ
 *   3. オーバーレイ描画の重複 → 修正漏れ
 *   4. SFX 初期化ボイラープレート → 冗長 & コピペバグ
 *
 * 提供する機能:
 *   - テキスト幅計算・中央揃え (textWidth, centerTextX)
 *   - ダイアログ風オーバーレイ描画 (drawOverlay)
 *   - ポーズオーバーレイ描画 (drawPauseOverlay)
 *   - 画面シェイク計算 / 結果画面での抑制 (calcShake)
 *   - SFX チャンネル一括初期化・ワンショット再生 (createSfxChannels, playSfx — core/audio.js より re-export)
 *   - パーティクル更新ループ (tickParticles)
 *   - WM 統合パターン (registerGameApp)
 */

import { fillRect, drawRect } from "../core/gpu.js";
import { drawText, GLYPH_H, textWidth } from "../core/font.js";
import { wmOpen, wmRegister, wmIsFocused } from "../wm/index.js";
import { createSfxChannels, playSfx } from "../core/audio.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  テキストユーティリティ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// textWidth: core/font.js の正規定義を re-export
export { textWidth };

/**
 * テキストを水平中央に配置する X 座標を返す。
 *
 * @param {number} ox - 領域の左端
 * @param {number} areaW - 領域の幅
 * @param {string} str - テキスト
 * @returns {number} 描画開始 X 座標 (整数)
 */
export function centerTextX(ox, areaW, str) {
  return (ox + (areaW - textWidth(str)) / 2) | 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * テキスト行をダイアログ風に中央寄せ描画する。
 * 黒背景 + 白の二重枠線。空文字列行はスキップされる。
 *
 * @param {number} ox - ゲーム領域左端 X (シェイク適用後)
 * @param {number} oy - ゲーム領域上端 Y (シェイク適用後)
 * @param {number} w - ゲーム領域幅
 * @param {number} h - ゲーム領域高さ
 * @param {string[]} lines - 表示するテキスト行
 */
export function drawOverlay(ox, oy, w, h, lines) {
  const lineH = GLYPH_H + 3;
  const totalH = lines.length * lineH + 10;
  let maxW = 0;
  for (const l of lines) {
    const lw = textWidth(l);
    if (lw > maxW) maxW = lw;
  }
  const bw = maxW + 20;
  const bh = totalH;
  const dx = (ox + (w - bw) / 2) | 0;
  const dy = (oy + (h - bh) / 2) | 0;

  fillRect(dx, dy, bw, bh, 0);
  drawRect(dx, dy, bw, bh, 1);
  drawRect(dx + 1, dy + 1, bw - 2, bh - 2, 1);

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (!t) continue;
    drawText(dx + 10, dy + 6 + i * lineH, t, 1);
  }
}

/**
 * "PAUSED" オーバーレイを描画する。
 * 黒背景 + 白の二重枠線で "PAUSED" テキストを中央表示。
 *
 * @param {number} ox - ゲーム領域左端 X
 * @param {number} oy - ゲーム領域上端 Y
 * @param {number} w - ゲーム領域幅
 * @param {number} h - ゲーム領域高さ
 */
export function drawPauseOverlay(ox, oy, w, h) {
  const pt = "PAUSED";
  const ptW = textWidth(pt);
  const ptX = (ox + (w - ptW) / 2) | 0;
  const ptY = (oy + (h - GLYPH_H) / 2) | 0;
  fillRect(ptX - 6, ptY - 4, ptW + 12, GLYPH_H + 8, 0);
  drawRect(ptX - 6, ptY - 4, ptW + 12, GLYPH_H + 8, 1);
  drawRect(ptX - 5, ptY - 3, ptW + 10, GLYPH_H + 6, 1);
  drawText(ptX, ptY, pt, 1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  シェイク
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 画面シェイクのオフセットを計算する。
 * 指定した状態ではシェイクを抑制する (結果画面でテキストが読めるように)。
 *
 * @param {number} shakeT - 残りシェイクフレーム数
 * @param {string} currentState - 現在のゲーム状態
 * @param {string[]} suppressStates - シェイクを抑制する状態名の配列
 * @returns {{ sx: number, sy: number }}
 */
export function calcShake(shakeT, currentState, suppressStates) {
  if (shakeT <= 0 || suppressStates.includes(currentState)) {
    return { sx: 0, sy: 0 };
  }
  return {
    sx: (Math.random() * 6 - 3) | 0,
    sy: (Math.random() * 4 - 2) | 0,
  };
}

// ── SFX ヘルパー (実体は core/audio.js。ゲームは game_utils 1 本で済むよう re-export) ──
export { createSfxChannels, playSfx };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  パーティクル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * パーティクル配列を 1 フレーム分更新する。
 * 寿命切れパーティクルは自動除去される。
 *
 * @param {Array} parts - パーティクル配列 (各要素は {x,y,dx,dy,life} を持つ)
 * @param {number} [gravity=0.06] - 毎フレームの重力加速度
 * @param {number} [friction=1.0] - dx に掛ける減速係数 (1.0 = 減速なし)
 */
export function tickParticles(parts, gravity = 0.06, friction = 1.0) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.dx;
    p.y += p.dy;
    p.dy += gravity;
    if (friction < 1) p.dx *= friction;
    if (--p.life <= 0) parts.splice(i, 1);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ゲームアプリ登録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ゲームアプリを WM に登録し、共通ボイラープレートを一元化する。
 *
 * 一元化されるもの:
 *   - ウィンドウ ID 管理 (外部から不可視)
 *   - ポーズ判定 (フォーカス喪失 = ポーズ)
 *   - onMeasure (固定サイズを返す)
 *   - wmRegister + wmOpen パターン
 *
 * @param {Object} config
 * @param {string} config.name - アプリ名 / ウィンドウタイトル
 * @param {string} [config.shortName] - デスクトップアイコン用の短縮名 (最大7文字)
 * @param {number} config.width - ゲーム領域幅
 * @param {number} config.height - ゲーム領域高さ
 * @param {function(Object):void} config.onDraw - 描画コールバック
 * @param {function(Object):void} config.onInput - 入力コールバック
 * @param {function(Object):void} [config.onDrawFooter] - フッター描画コールバック
 * @param {function():boolean} config.onBeforeClose - 閉じる前に呼ばれるリセット関数
 * @param {string} [config.category] - メニューカテゴリ (">" 区切りで N 階層対応。省略でトップレベル)
 * @returns {{ isPaused: () => boolean }}
 */
export function registerGameApp(config) {
  const {
    name,
    shortName,
    width,
    height,
    onDraw,
    onInput,
    onDrawFooter,
    onBeforeClose,
    category,
  } = config;

  let winId = -1;

  function isPaused() {
    return winId >= 0 && !wmIsFocused(winId);
  }

  function onMeasure() {
    return { w: width, h: height };
  }

  const opts = { onBeforeClose };
  if (onDrawFooter) {
    opts.footer = true;
    opts.onDrawFooter = onDrawFooter;
  }

  const regOpts = {};
  if (category) regOpts.category = category;
  if (shortName) regOpts.shortName = shortName;
  wmRegister(
    name,
    () => {
      winId = wmOpen(-1, -1, 0, 0, name, onDraw, onInput, onMeasure, opts);
      return winId;
    },
    Object.keys(regOpts).length > 0 ? regOpts : null,
  );

  return { isPaused };
}

