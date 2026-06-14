/**
 * @module app/gradient_demo
 * gradient_demo.js — bayerGradRect デモウィンドウ
 *
 * gpu.js に追加した bayerGradRect 描画プリミティブの動作確認用デモパネル。
 * 水平・垂直グラデーションの各種バリエーションを一覧表示する。
 */

import { fillRect, drawRect, bayerGradRect } from "../core/gpu.js";
import { drawText, GLYPH_H } from "../core/font.js";
import { wmOpen, wmRegister, CONTENT_PADDING } from "../wm/index.js";

const APP_NAME = "GRAD_DEMO";

// ── レイアウト定数 ──
const PADDING = CONTENT_PADDING; // コンテンツ領域内パディング
const BAYER_WIDTH = 17 * 4;
const BAYER_HEIGHT = 17 * 4;
const INNER_PAD = 1;
const BORDER_WIDTH = 1;
const SWATCH_WIDTH = BAYER_WIDTH + 2 * (INNER_PAD + BORDER_WIDTH); // 各サンプル矩形の幅
const SWATCH_HEIGHT = BAYER_HEIGHT + 2 * (INNER_PAD + BORDER_WIDTH); // 各サンプル矩形の高さ
const GAP_HORIZONTAL = 12; // 水平方向の間隔
const GAP_VERTICAL = 12; // 垂直方向の間隔
const LABEL_HEIGHT = GLYPH_H + 2; // ラベルテキストの高さ

/**
 * グラデーションサンプル定義。
 * 表示ラベルと bayerGradRect に渡すパラメータを保持する。
 * @typedef {{ label: string, d0: number, d1: number, dir: "h"|"v", matrix: "4"|"8" }} Sample
 */

/** @type {Sample[]} */
const samples = [
  // ── Row 1: 水平グラデ (4x4) ──
  { label: "H 0>1 4x4", d0: 0.0, d1: 1.0, dir: "h", matrix: "4" },
  { label: "H 1>0 4x4", d0: 1.0, d1: 0.0, dir: "h", matrix: "4" },
  { label: "H .2>.8 4x4", d0: 0.2, d1: 0.8, dir: "h", matrix: "4" },

  // ── Row 2: 水平グラデ (8x8) ──
  { label: "H 0>1 8x8", d0: 0.0, d1: 1.0, dir: "h", matrix: "8" },
  { label: "H 1>0 8x8", d0: 1.0, d1: 0.0, dir: "h", matrix: "8" },
  { label: "H .2>.8 8x8", d0: 0.2, d1: 0.8, dir: "h", matrix: "8" },

  // ── Row 3: 垂直グラデ (4x4) ──
  { label: "V 0>1 4x4", d0: 0.0, d1: 1.0, dir: "v", matrix: "4" },
  { label: "V 1>0 4x4", d0: 1.0, d1: 0.0, dir: "v", matrix: "4" },
  { label: "V .5>.5 4x4", d0: 0.5, d1: 0.5, dir: "v", matrix: "4" },

  // ── Row 4: 垂直グラデ (8x8) ──
  { label: "V 0>1 8x8", d0: 0.0, d1: 1.0, dir: "v", matrix: "8" },
  { label: "V 1>0 8x8", d0: 1.0, d1: 0.0, dir: "v", matrix: "8" },
  { label: "V 0>.5 8x8", d0: 0.0, d1: 0.5, dir: "v", matrix: "8" },
];

const COLS = 3; // 1行あたりの列数

// ── コンテンツサイズ ──
const rows = Math.ceil(samples.length / COLS);
const contentW =
  COLS * SWATCH_WIDTH + (COLS - 1) * GAP_HORIZONTAL + PADDING * 2;
const contentH =
  rows * (LABEL_HEIGHT + SWATCH_HEIGHT + GAP_VERTICAL) -
  GAP_VERTICAL +
  PADDING * 2;

/**
 * 描画コールバック。
 * @param {{ x:number, y:number, w:number, h:number }} cr コンテンツ矩形
 */
function onDraw(contentRect) {
  // 背景クリア
  fillRect(contentRect.x, contentRect.y, contentRect.w, contentRect.h, 0);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const col = i % COLS;
    const row = (i / COLS) | 0;

    const sx = contentRect.x + PADDING + col * (SWATCH_WIDTH + GAP_HORIZONTAL);
    const sy =
      contentRect.y +
      PADDING +
      row * (LABEL_HEIGHT + SWATCH_HEIGHT + GAP_VERTICAL);

    // ラベル
    drawText(sx, sy, s.label, 1);

    // グラデーション矩形
    const gy = sy + LABEL_HEIGHT;
    bayerGradRect(
      sx + 1 + INNER_PAD,
      gy + 1 + INNER_PAD,
      BAYER_WIDTH,
      BAYER_HEIGHT,
      s.d0,
      s.d1,
      s.dir,
      s.matrix,
    );

    // 枠線
    drawRect(sx, gy, SWATCH_WIDTH, SWATCH_HEIGHT, 1);
  }
}

// ── ウィンドウ登録 ──
wmRegister(
  APP_NAME,
  () =>
    wmOpen(-1, -1, 0, 0, APP_NAME, onDraw, null, () => ({
      w: contentW,
      h: contentH,
    })),
  { category: "DEMO", dev: true, shortName: "GRAD" },
);

