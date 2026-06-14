/**
 * @module app/vram_dump
 * vram_dump.js — VRAM ダンプ (開発・デバッグ用)
 *
 * ── 概要 ──
 * VRAM の表示内容をテキスト (BIN / HEX / RLE) として
 * ホスト OS のクリップボードにコピーする開発者向けデバッグ機能。
 *
 * 画面の表示崩れ等をコーディングエージェント (AI) に共有する際、
 * 自然言語で散文的に説明するよりもビット列で正確に伝えられる。
 *
 * ── 操作フロー ──
 *   Ctrl+Shift+D → ダンプモード (BIN) に入る
 *     H キー    → HEX モードに切り替え
 *     B キー    → BIN モードに切り替え
 *     R キー    → RLE モードに切り替え
 *     ウィンドウクリック → そのウィンドウ領域の VRAM をコピー
 *     Enter     → 全画面 VRAM をコピー
 *     Esc       → キャンセル (モード解除)
 *   コピー完了後、モード自動解除
 *
 * ── 出力フォーマット ──
 *   BIN: 0/1 の行列 (1行 = VRAM 1行)
 *     [VRAM DUMP] full 600x450 format:bin
 *     000011110000...
 *
 *   HEX: 4px = 1 nibble (16進数)
 *     [VRAM DUMP] window "PAINT" 120x90 @ (240,180) screen 600x450 format:hex
 *     0F3C2A8B...
 *
 *   RLE: Run-Length Encoding (同一値の連続を 回数*値 で圧縮)
 *     [VRAM DUMP] full 600x450 format:rle
 *     150*0,1,48*0,1,150*0  ← 1行分
 *     長さ1の連続は値のみ (例: "1"), 2以上は "N*V" 形式。
 *     行間は改行で区切る。UI 画面は同一値の長い連続が多いため
 *     BIN/HEX に比べて大幅にデータ量が削減される。
 */

import { VRAM_WIDTH, VRAM_HEIGHT } from "../config.js";
import { vram, fillRect } from "../core/gpu.js";
import { drawText, textWidth, GLYPH_H } from "../core/font.js";
import * as Input from "../core/input.js";
import { wmGetWindowList, wmGetWindowRect } from "../wm/index.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ダンプモードが有効か */
let dumpActive = false;

/** 現在のフォーマット: "bin" | "hex" | "rle" */
let dumpFormat = "bin";

/** コピー成功フラッシュの残りフレーム数 (0 = 非表示) */
let flashFrames = 0;

/** フラッシュ表示テキスト */
let flashText = "";

/** フラッシュ表示の持続フレーム数 */
const FLASH_DURATION = 40;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  VRAM 読み取り・フォーマット
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * VRAM の矩形領域を BIN (0/1) テキストに変換する。
 * @param {number} x  左上 X
 * @param {number} y  左上 Y
 * @param {number} w  幅
 * @param {number} h  高さ
 * @returns {string}  改行区切りの 0/1 行列
 */
function readBin(x, y, w, h) {
  const lines = [];
  for (let row = y; row < y + h; row++) {
    let line = "";
    const base = row * VRAM_WIDTH;
    for (let col = x; col < x + w; col++) {
      line += vram[base + col] ? "1" : "0";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * VRAM の矩形領域を HEX テキストに変換する。
 * 4 ピクセルを 1 nibble (16進) にパックする (MSB が左端)。
 * 行末の端数ピクセルも 1 nibble に詰める (下位ビットは 0 パディング)。
 * @param {number} x  左上 X
 * @param {number} y  左上 Y
 * @param {number} w  幅
 * @param {number} h  高さ
 * @returns {string}  改行区切りの HEX 行列
 */
function readHex(x, y, w, h) {
  const lines = [];
  for (let row = y; row < y + h; row++) {
    let line = "";
    const base = row * VRAM_WIDTH;
    for (let col = x; col < x + w; col += 4) {
      let nibble = 0;
      for (let b = 0; b < 4; b++) {
        const px = col + b;
        if (px < x + w) {
          nibble |= (vram[base + px] ? 1 : 0) << (3 - b);
        }
      }
      line += nibble.toString(16).toUpperCase();
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * VRAM の矩形領域を RLE (Run-Length Encoding) テキストに変換する。
 * 同一値の連続を "N*V" 形式で圧縮する (長さ1の場合は値のみ)。
 * 各行をカンマ区切りのラン列として出力し、行間は改行で区切る。
 *
 * 例: 0が150個, 1が1個, 0が48個 → "150*0,1,48*0"
 *
 * @param {number} x  左上 X
 * @param {number} y  左上 Y
 * @param {number} w  幅
 * @param {number} h  高さ
 * @returns {string}  改行区切りの RLE 行列
 */
function readRle(x, y, w, h) {
  const lines = [];
  for (let row = y; row < y + h; row++) {
    const runs = [];
    const base = row * VRAM_WIDTH;
    let runVal = vram[base + x] ? 1 : 0;
    let runLen = 1;
    for (let col = x + 1; col < x + w; col++) {
      const v = vram[base + col] ? 1 : 0;
      if (v === runVal) {
        runLen++;
      } else {
        runs.push(runLen === 1 ? String(runVal) : `${runLen}*${runVal}`);
        runVal = v;
        runLen = 1;
      }
    }
    runs.push(runLen === 1 ? String(runVal) : `${runLen}*${runVal}`);
    lines.push(runs.join(","));
  }
  return lines.join("\n");
}

/**
 * 現在の dumpFormat に従って矩形領域をテキストに変換するディスパッチャ。
 */
function readRegion(x, y, w, h) {
  if (dumpFormat === "hex") return readHex(x, y, w, h);
  if (dumpFormat === "rle") return readRle(x, y, w, h);
  return readBin(x, y, w, h);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ヘッダ生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全画面ダンプ用のヘッダ行を生成する。
 */
function headerFull() {
  return `[VRAM DUMP] full ${VRAM_WIDTH}x${VRAM_HEIGHT} format:${dumpFormat}`;
}

/**
 * ウィンドウダンプ用のヘッダ行を生成する。
 * @param {string} title ウィンドウタイトル
 * @param {{ x:number, y:number, w:number, h:number }} rect ウィンドウ矩形
 */
function headerWindow(title, rect) {
  return (
    `[VRAM DUMP] window "${title}" ${rect.w}x${rect.h}` +
    ` @ (${rect.x},${rect.y}) screen ${VRAM_WIDTH}x${VRAM_HEIGHT} format:${dumpFormat}`
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  クリップボード書き込み
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * テキストをクリップボードにコピーする。
 * @param {string} text コピーするテキスト
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.error("[VRAM DUMP] clipboard write failed:", e);
    return false;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ダンプ実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全画面をダンプしてクリップボードにコピーする。
 */
async function dumpFull() {
  const header = headerFull();
  const body = readRegion(0, 0, VRAM_WIDTH, VRAM_HEIGHT);
  const text = header + "\n" + body;
  const ok = await copyToClipboard(text);
  showFlash(ok, "FULL");
}

/**
 * 指定ウィンドウ領域をダンプしてクリップボードにコピーする。
 * ウィンドウが画面外にはみ出している場合はクリップされる。
 * @param {number} id  ウィンドウ ID
 * @param {string} title  ウィンドウタイトル
 * @param {{ x:number, y:number, w:number, h:number }} rect  ウィンドウ矩形
 */
async function dumpWindow(id, title, rect) {
  // 画面内にクリップ
  const cx = Math.max(0, rect.x);
  const cy = Math.max(0, rect.y);
  const cx2 = Math.min(VRAM_WIDTH, rect.x + rect.w);
  const cy2 = Math.min(VRAM_HEIGHT, rect.y + rect.h);
  const cw = cx2 - cx;
  const ch = cy2 - cy;
  if (cw <= 0 || ch <= 0) {
    showFlash(false, "WINDOW");
    return;
  }

  const header = headerWindow(title, rect);
  const body = readRegion(cx, cy, cw, ch);
  const text = header + "\n" + body;
  const ok = await copyToClipboard(text);
  showFlash(ok, title);
}

/**
 * フラッシュ表示を開始する。
 * @param {boolean} ok コピー成功か
 * @param {string} target 対象名
 */
function showFlash(ok, target) {
  dumpActive = false;
  flashFrames = FLASH_DURATION;
  flashText = ok ? `COPIED (${target})` : "COPY FAILED";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ウィンドウ検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * マウス座標にあるウィンドウを最前面から探索する。
 * @param {number} mx マウス X
 * @param {number} my マウス Y
 * @returns {{ id:number, title:string, rect:{ x:number, y:number, w:number, h:number } }|null}
 */
function findWindowAt(mx, my) {
  const list = wmGetWindowList();
  // wmGetWindowList は背面→前面順。逆順で最前面から探索する。
  for (let i = list.length - 1; i >= 0; i--) {
    const { id, title } = list[i];
    const rect = wmGetWindowRect(id);
    if (!rect) continue;
    if (
      mx >= rect.x &&
      mx < rect.x + rect.w &&
      my >= rect.y &&
      my < rect.y + rect.h
    ) {
      return { id, title, rect };
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  毎フレーム更新 (app.js から呼ぶ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ダンプモードの入力処理。update() から毎フレーム呼ぶ。
 * @returns {boolean} ダンプモード中なら true (他の入力処理をスキップさせる用途)
 */
export function updateVramDump() {
  // フラッシュカウントダウン
  if (flashFrames > 0) flashFrames--;

  // ── モード開始: Ctrl+Shift+D ──
  if (!dumpActive && Input.ctrlShiftDown("KeyD")) {
    dumpActive = true;
    dumpFormat = "bin";
    return true;
  }

  if (!dumpActive) return false;

  // ── モード内キー操作 ──

  // Esc → キャンセル
  if (Input.keyDown("Escape")) {
    dumpActive = false;
    return true;
  }

  // H → HEX モード
  if (Input.keyDown("KeyH")) {
    dumpFormat = "hex";
    return true;
  }

  // B → BIN モード
  if (Input.keyDown("KeyB")) {
    dumpFormat = "bin";
    return true;
  }

  // R → RLE モード
  if (Input.keyDown("KeyR")) {
    dumpFormat = "rle";
    return true;
  }

  // Enter → 全画面ダンプ
  if (Input.keyDown("Enter")) {
    dumpFull();
    return true;
  }

  // 左クリック → ウィンドウダンプ
  if (Input.mouseButtonDown(0)) {
    const mx = Input.mouseX();
    const my = Input.mouseY();
    const hit = findWindowAt(mx, my);
    if (hit) {
      dumpWindow(hit.id, hit.title, hit.rect);
    } else {
      // ウィンドウ外クリック → 全画面ダンプ
      dumpFull();
    }
    return true;
  }

  return true;
}

/**
 * ダンプモード中か。
 * wm.js がダンプモード中のクリックを通常の操作として処理しないようにするためのフラグ。
 */
export function isVramDumpActive() {
  return dumpActive;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画 (app.js の draw() から呼ぶ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ダンプモード / コピー完了フラッシュのオーバーレイを描画する。
 */
export function drawVramDumpOverlay() {
  if (dumpActive) {
    // モード表示バー — 現在のフォーマット以外の切替キーを表示
    const LABELS = {
      bin: "[DUMP:BIN] CLICK=WINDOW  ENTER=FULL  H=HEX  R=RLE  ESC=CANCEL",
      hex: "[DUMP:HEX] CLICK=WINDOW  ENTER=FULL  B=BIN  R=RLE  ESC=CANCEL",
      rle: "[DUMP:RLE] CLICK=WINDOW  ENTER=FULL  B=BIN  H=HEX  ESC=CANCEL",
    };
    const label = LABELS[dumpFormat];
    const tw = textWidth(label);
    const tx = ((VRAM_WIDTH - tw) / 2) | 0;
    const ty = 4;
    fillRect(tx - 4, ty - 2, tw + 8, GLYPH_H + 4, 0);
    drawText(tx, ty, label, 1);
    return;
  }

  if (flashFrames > 0) {
    const tw = textWidth(flashText);
    const tx = ((VRAM_WIDTH - tw) / 2) | 0;
    const ty = 4;
    fillRect(tx - 4, ty - 2, tw + 8, GLYPH_H + 4, 0);
    drawText(tx, ty, flashText, 1);
  }
}

