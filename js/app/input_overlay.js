/**
 * @module app/input_overlay
 * input_overlay.js — 入力可視化オーバーレイ (薄いログビューア)
 *
 * SNS 共有用に、ユーザーのキーボード・マウス操作をテキストとして
 * VRAM 画面の右下に描画するオーバーレイ。
 *
 * ── アーキテクチャ ──
 *   input.js のセマンティックイベントログ (getInputLog()) を毎フレーム消費し、
 *   表示エントリに変換する。このモジュール自体は DOM イベントリスナを持たず、
 *   キーラベル生成・ドラッグ判定・ダブルクリック判定は全て input.js 側で行う。
 *
 * ── 表示仕様 ──
 *   - キーボード : 修飾キー+キー名 (例: CTRL+Z, SHIFT+A)
 *                  印字可能記号はそのまま表示 (例: Shift+1 → !)
 *   - マウス     : L-CLICK, R-CLICK, M-CLICK, DBL-CLICK,
 *                  L-DRAG, R-DRAG, M-DRAG,
 *                  WHEEL UP, WHEEL DN
 *   - 修飾+マウス: CTRL+L-CLICK, SHIFT+WHEEL UP 等
 *   - 表示位置   : 右下 (マージン 4px), 左揃え
 *   - 余白       : テキスト周囲 4px, 行間 2px
 *   - 持続時間   : リリース後 120 フレーム (≈2 秒 @60fps)
 *   - 同一イベント連続時は持続タイマーを延長
 *   - ドラッグ開始時にクリックエントリを自動除去
 *
 * ── ON/OFF ──
 *   config.js の inputOverlay 設定で切り替える (デフォルト OFF)。
 *   SETTINGS アプリのトグルで操作。
 *
 * ── 依存 ──
 *   core/input.js — getInputLog() (セマンティックイベントログ)
 *   core/font.js  — drawText
 *   core/gpu.js   — fillRect
 *   config.js     — VRAM_WIDTH, VRAM_HEIGHT, isInputOverlayEnabled
 */

import { VRAM_WIDTH, VRAM_HEIGHT, isInputOverlayEnabled } from "../config.js";
import { fillRoundRect } from "../core/gpu.js";
import { drawText, GLYPH_H, textWidth } from "../core/font.js";
import { getInputLog } from "../core/input.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** オーバーレイの右下マージン (px) */
const MARGIN = 4;

/** 背景パディング (テキスト周囲の余白, px) */
const PADDING = 4;

/** 行間 (px) */
const LINE_GAP = 2;

/** リリース後の残留フレーム数 (≈2s @60fps) */
const LINGER_FRAMES = 120;

/** 同時に表示する最大行数 */
const MAX_LINES = 4;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  表示エントリ管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @typedef {Object} OverlayEntry
 * @property {string} text   表示テキスト
 * @property {number} timer  残りフレーム数 (0以下で消滅)
 * @property {boolean} held  まだ保持中かどうか
 */

/** @type {OverlayEntry[]} */
let entries = [];

/**
 * エントリを追加または延長する。
 * 同じテキストが既にあれば、タイマーを延長して held フラグを更新する。
 */
function pushEntry(text, isHeld) {
  for (const e of entries) {
    if (e.text === text) {
      e.timer = LINGER_FRAMES;
      e.held = isHeld;
      return;
    }
  }
  if (entries.length >= MAX_LINES) entries.shift();
  entries.push({ text, timer: LINGER_FRAMES, held: isHeld });
}

/**
 * 指定テキストのエントリの held を解除する。
 */
function releaseEntry(text) {
  for (const e of entries) {
    if (e.text === text) {
      e.held = false;
      return;
    }
  }
}

/**
 * 指定テキストのエントリを即座に除去する。
 */
function removeEntry(text) {
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].text === text) {
      entries.splice(i, 1);
      return;
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  毎フレーム更新
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 毎フレーム呼ぶ。input.js のセマンティックイベントログを消費し、
 * 表示エントリを更新する。draw() の前に呼ぶこと。
 */
export function updateInputOverlay() {
  if (!isInputOverlayEnabled()) return;

  const log = getInputLog();

  for (const ev of log) {
    switch (ev.type) {
      // ── キーボード ──
      case "key-down":
      case "key-held":
        pushEntry(ev.label, true);
        break;
      case "key-up":
        releaseEntry(ev.label);
        break;

      // ── マウスクリック ──
      case "click":
        pushEntry(ev.label, false);
        break;
      case "dblclick":
        pushEntry(ev.label, false);
        break;

      // ── ドラッグ ──
      case "drag-start":
        // ドラッグ開始 → 先行するクリックエントリを除去
        removeEntry(ev.label.replace("DRAG", "CLICK"));
        pushEntry(ev.label, true);
        break;
      case "drag":
        pushEntry(ev.label, true);
        break;
      case "drag-end":
        releaseEntry(ev.label);
        break;

      // ── ボタンリリース ──
      case "btn-up":
        // click → btn-up の順で来るので何もしない (click は既にタイマー消化待ち)
        break;

      // ── ホイール ──
      case "wheel":
        pushEntry(ev.label, false);
        break;
    }
  }

  // ── タイマー消化 ──
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e.held) {
      e.timer--;
      if (e.timer <= 0) entries.splice(i, 1);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * オーバーレイを VRAM に描画する。
 * flush() の直前 (カーソル描画後) に呼ぶ。
 */
export function drawInputOverlay() {
  if (!isInputOverlayEnabled() || entries.length === 0) return;

  let maxW = 0;
  for (const e of entries) {
    const w = textWidth(e.text);
    if (w > maxW) maxW = w;
  }

  const lineH = GLYPH_H + LINE_GAP;
  const boxW = maxW + PADDING * 2;
  const boxH = entries.length * lineH - LINE_GAP + PADDING * 2;

  const bx = VRAM_WIDTH - MARGIN - boxW;
  const by = VRAM_HEIGHT - MARGIN - boxH;

  fillRoundRect(bx, by, boxW, boxH, 1, 0);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const tx = bx + PADDING;
    const ty = by + PADDING + i * lineH;
    drawText(tx, ty, e.text, 1);
  }
}

