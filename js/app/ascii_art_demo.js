/**
 * @module app/ascii_art_demo
 * ascii_art_demo.js — ASCII Art 変換デモウィンドウ
 *
 * core/ascii_art.js の動作確認用デモパネル。
 * 合成テストパターン (水平グラデーション / 放射グラデーション / チェッカー / 球体) を
 * ASCII Art に変換し、文字濃淡の結果をリアルタイムプレビューする。
 *
 * 構成:
 *   - ツールバー: パターン選択 DropDown, INV (反転) トグル, GAMMA スライダー,
 *                W/H サイズ指定 NumberBox
 *   - 中央: ASCII Art プレビューエリア (枠線付き)
 *   - 下部: Tone Ramp 表示 (折り返し)
 *   - Footer: 現在の ASCII Art サイズ (cols×rows CHARS)
 */

import { fillRect, drawRect, hline } from "../core/gpu.js";
import { drawText, GLYPH_W, GLYPH_H } from "../core/font.js";
import { wmOpen, wmRegister, CONTENT_PADDING } from "../wm/index.js";
import * as UI from "../ui/index.js";
import * as AsciiArt from "../core/ascii_art.js";

// ── 定数 ──
const APP_NAME = "AA_DEMO";
const PADDING = CONTENT_PADDING;

// ASCII Art プレビューのサイズ範囲 (文字数)
const COLS_MIN = 8;
const COLS_MAX = 48;
const ROWS_MIN = 4;
const ROWS_MAX = 24;

// テストパターンの解像度 (ソース画像)
const PATTERN_W = 192;
const PATTERN_H = 192;

// ── テストパターン定義 ──
const PATTERNS = ["H-GRAD", "V-GRAD", "RADIAL", "CHECKER", "SPHERE"];

// ── 状態 ──
let patternIndex = 0;
let invertEnabled = false;
let gammaValue = 10; // ×10 (Slider は整数)。実値 = gammaValue / 10
let userMaxCols = COLS_MAX; // NumberBox で変更可能
let userMaxRows = ROWS_MAX;

/** @type {Uint8ClampedArray|null} 現在のパターン RGBA */
let patternRGBA = null;

/** @type {string[]|null} 最後に生成した ASCII Art 行 */
let asciiLines = null;

/** Tone Ramp 表示用文字列 */
let rampDisplay = "";

// ── ウィジェット ──
let ddPattern;
let btnInvert;
let sliderGamma;
let labelGamma;
let labelW;
let nbCols;
let labelH;
let nbRows;
let widgets = new UI.WidgetGroup();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  テストパターン生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * RGBA テストパターンを生成する。
 * @param {string} name  パターン名
 * @param {number} w  幅
 * @param {number} h  高さ
 * @returns {Uint8ClampedArray}
 */
function generatePattern(name, w, h) {
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let v = 0;

      switch (name) {
        case "H-GRAD":
          // 水平グラデーション (左:黒 → 右:白)
          v = (x / (w - 1)) * 255;
          break;

        case "V-GRAD":
          // 垂直グラデーション (上:黒 → 下:白)
          v = (y / (h - 1)) * 255;
          break;

        case "RADIAL": {
          // 放射グラデーション (中心:白 → 外:黒)
          const cx = w / 2;
          const cy = h / 2;
          const maxR = Math.sqrt(cx * cx + cy * cy);
          const dx = x - cx;
          const dy = y - cy;
          const r = Math.sqrt(dx * dx + dy * dy);
          v = (1 - Math.min(r / maxR, 1)) * 255;
          break;
        }

        case "CHECKER": {
          // チェッカーパターン (8×8 セル)
          const cellSize = 24;
          const cx2 = (x / cellSize) | 0;
          const cy2 = (y / cellSize) | 0;
          v = (cx2 + cy2) % 2 === 0 ? 255 : 0;
          break;
        }

        case "SPHERE": {
          // 擬似 3D 球体 (ランバート反射)
          const sx = (x / w) * 2 - 1; // -1..1
          const sy = (y / h) * 2 - 1;
          const r2 = sx * sx + sy * sy;
          if (r2 > 1) {
            v = 0; // 背景
          } else {
            const sz = Math.sqrt(1 - r2);
            // 光源方向: 右上から (0.6, -0.5, 0.6)
            const lx = 0.6,
              ly = -0.5,
              lz = 0.6;
            const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
            const dot = (sx * lx + sy * ly + sz * lz) / len;
            v = Math.max(0, dot) * 255;
          }
          break;
        }

        default:
          v = 128;
      }

      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  return data;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  変換実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** パターンを再生成し ASCII Art に変換する */
function refreshAsciiArt() {
  patternRGBA = generatePattern(PATTERNS[patternIndex], PATTERN_W, PATTERN_H);

  // アスペクト比維持のサイズ算出
  const { cols, rows } = AsciiArt.calcAsciiSize(
    PATTERN_W,
    PATTERN_H,
    userMaxCols,
    userMaxRows,
  );

  const ramp = AsciiArt.getDefaultRamp();
  rampDisplay = AsciiArt.getRampString(ramp);

  asciiLines = AsciiArt.asciiRGBA(
    patternRGBA,
    PATTERN_W,
    PATTERN_H,
    cols,
    rows,
    {
      ramp,
      invert: invertEnabled,
      gamma: gammaValue / 10,
      low: 0,
      high: 100,
    },
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  レイアウト定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Ramp 表示
const RAMP_LABEL = "RAMP:";
const RAMP_LABEL_W = RAMP_LABEL.length * (GLYPH_W + 1);

// ── レイアウトツリー (openWindow で構築) ──
/** @type {import('../ui/layout.js').Box|null} */
let root = null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 描画コールバック。
 * @param {{ x: number, y: number, w: number, h: number }} cr
 */
function onDraw(cr) {
  // 背景クリア
  fillRect(cr.x, cr.y, cr.w, cr.h, 0);

  // ── ウィジェット描画 ──
  widgets.draw(cr);

  // ── ASCII Art プレビュー ──
  const ctrlRow = root.children[0]; // HBox (コントロール行)
  const artY = cr.y + ctrlRow.y + ctrlRow.h + PADDING;

  if (asciiLines && asciiLines.length > 0) {
    const artX = cr.x + UI.FOCUS_MARGIN;
    const artPixW = asciiLines[0].length * AsciiArt.CELL_W;
    const artPixH = asciiLines.length * AsciiArt.CELL_H;

    // 枠線 — コンテンツの外側に 1px の均等余白を設ける
    drawRect(artX - 1, artY - 1, artPixW + 1, artPixH + 1, 1);

    // ASCII Art 描画
    AsciiArt.drawAsciiArt(asciiLines, artX, artY, 1);
  }

  // ── Ramp 表示 (複数行折り返し) ──
  const artAreaH = userMaxRows * AsciiArt.CELL_H;
  const rampY = cr.y + ctrlRow.y + ctrlRow.h + PADDING + artAreaH + 4;
  hline(cr.x + UI.FOCUS_MARGIN, cr.x + cr.w - UI.FOCUS_MARGIN - 1, rampY, 1);

  const rampX = cr.x + UI.FOCUS_MARGIN;
  drawText(rampX, rampY + 2, RAMP_LABEL, 1);

  // ランプ文字列を折り返して描画
  const rampCPL = Math.max(
    1,
    Math.floor((cr.w - UI.FOCUS_MARGIN * 2) / (GLYPH_W + 1)),
  );
  const rampTextX = rampX + RAMP_LABEL_W;
  for (let i = 0, lineIdx = 0; i < rampDisplay.length; lineIdx++) {
    const chunk = rampDisplay.substring(i, i + rampCPL);
    const ly = rampY + 2 + lineIdx * (GLYPH_H + 1);
    drawText(lineIdx === 0 ? rampTextX : rampX, ly, chunk, 1);
    i += chunk.length;
  }
}

// ── Footer 描画 ──
function onDrawFooter(footerRect) {
  if (asciiLines && asciiLines.length > 0) {
    const info = `${asciiLines[0].length}x${asciiLines.length} CHARS`;
    drawText(footerRect.x, footerRect.y, info, 1);
  }
}

/**
 * 入力コールバック。
 */
function onInput(ev) {
  widgets.update(ev);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  サイズ測定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * コンテンツサイズ計測。userMaxCols / userMaxRows に応じて動的に算出。
 */
function onMeasure() {
  const ctrlRow = root.children[0];
  const artAreaW = userMaxCols * AsciiArt.CELL_W;
  const artAreaH = userMaxRows * AsciiArt.CELL_H;

  const contentW = Math.max(
    UI.FOCUS_MARGIN + artAreaW + UI.FOCUS_MARGIN,
    ctrlRow.x + ctrlRow.w + UI.FOCUS_MARGIN,
  );

  // Ramp 表示行数を算出
  const rampCPL = Math.max(
    1,
    Math.floor((contentW - UI.FOCUS_MARGIN * 2) / (GLYPH_W + 1)),
  );
  const firstLineChars = rampCPL - Math.ceil(RAMP_LABEL_W / (GLYPH_W + 1));
  const remaining = Math.max(0, rampDisplay.length - firstLineChars);
  const rampLines = 1 + Math.ceil(remaining / rampCPL);
  const rampH = rampLines * (GLYPH_H + 1) + 2;

  const contentH =
    ctrlRow.y + ctrlRow.h + PADDING + artAreaH + 4 + rampH + UI.FOCUS_MARGIN;

  return { w: contentW, h: contentH };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ウィンドウ生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openWindow() {
  // ── ウィジェット生成 ──

  // パターン選択
  ddPattern = new UI.DropDown(0, 0, PATTERNS, patternIndex, (idx) => {
    patternIndex = idx;
    refreshAsciiArt();
  });

  // 反転トグル
  btnInvert = new UI.ToggleButton(
    0,
    0,
    "INV",
    (v) => {
      invertEnabled = v;
      refreshAsciiArt();
    },
    invertEnabled,
  );
  btnInvert.tooltip = "Invert luminance";

  // ガンマラベル
  labelGamma = new UI.Label(0, 0, "GAMMA:" + (gammaValue / 10).toFixed(1));

  // ガンマスライダー (5–20 → 0.5–2.0)
  sliderGamma = new UI.Slider(0, 0, 60, 5, 20, gammaValue, (v) => {
    gammaValue = v;
    labelGamma.text = "GAMMA:" + (v / 10).toFixed(1);
    refreshAsciiArt();
  });
  sliderGamma.tooltip = "Gamma correction (0.5-2.0)";

  // サイズ指定 NumberBox
  labelW = new UI.Label(0, 0, "W:");
  nbCols = new UI.NumberBox(0, 0, COLS_MIN, COLS_MAX, userMaxCols, 1, (v) => {
    userMaxCols = v;
    refreshAsciiArt();
  });
  nbCols.tooltip = "Max columns";
  labelH = new UI.Label(0, 0, "H:");
  nbRows = new UI.NumberBox(0, 0, ROWS_MIN, ROWS_MAX, userMaxRows, 1, (v) => {
    userMaxRows = v;
    refreshAsciiArt();
  });
  nbRows.tooltip = "Max rows";

  // ── レイアウト: VBox > HBox (コントロール行) ──
  root = UI.VBox([
    UI.HBox([
      ddPattern,
      btnInvert,
      labelGamma,
      sliderGamma,
      labelW,
      nbCols,
      labelH,
      nbRows,
    ]),
  ]);
  root.layout(UI.FOCUS_MARGIN, UI.FOCUS_MARGIN);

  widgets = new UI.WidgetGroup(root.leaves());

  // ── 初回変換 ──
  refreshAsciiArt();

  return wmOpen(-1, -1, 0, 0, APP_NAME, onDraw, onInput, onMeasure, {
    footer: true,
    onDrawFooter,
    onRelayout: () => {
      widgets.remeasureAll();
      root.layout(UI.FOCUS_MARGIN, UI.FOCUS_MARGIN);
    },
  });
}

// ── ウィンドウ登録 ──
wmRegister(APP_NAME, openWindow, { category: "DEMO", dev: true });

