/**
 * @module app/glypher
 * glypher.js — GLYPHER (1-bit ビットマップフォントエディタ)
 *
 * システムフォント (5x5) の全 ASCII グリフ (0x20–0x7E) を 1 文字ずつ
 * デザインし、APPLY で OS 全体のフォントに即時適用する。
 * 「ユーザーが作ったフォントが OS の chrome そのものになる」という
 * PIXERA OS の個人化体験の中核。
 *
 * 仕様:
 *   - 起動時に現在のシステムフォントを取り込んで編集対象にする
 *     (白紙からではなく、実フォントを微調整する形)
 *   - 上部: キャラクタマップ (全 95 文字を現在の字形で一覧、クリックで選択)
 *   - 中央: 選択中文字の拡大エディタ (クリック/ドラッグでピクセルを塗る)
 *   - CLEAR / INVERT で編集補助
 *   - 下部: パングラムプレビュー (編集中フォントで描画)
 *   - APPLY: 編集したフォントを OS 全体に即時適用 (font.js setGlyphs)
 *   - REVERT: 起動時のシステムフォントに戻す
 *
 * 寸法はシステムフォントと同一 (5x5) を保つため、適用してもメトリクス・
 * アイコン・レイアウトは一切変わらず、純粋に字形だけが置き換わる。
 *
 *   - SAVE: 名前を付けて VFS (/Fonts/<name>.font) に保存 → Config.FONTS に
 *     登録 → Settings ドロップダウンで切替可能に。boot 時に再読込されるため
 *     リロード後も自作フォントが残る (core/user_fonts.js)。
 */

import {
  pset,
  fillRect,
  fillRoundRect,
  drawRoundRect,
  hline,
  vline,
} from "../core/gpu.js";
import {
  drawText,
  GLYPH_H,
  getGlyph,
  getFontMetrics,
  setGlyphs,
} from "../core/font.js";
import { wmOpen, wmRegister, wmRequestCursor } from "../wm/index.js";
import { setSystemFont } from "../config.js";
import { saveUserFont } from "../core/user_fonts.js";
import * as UI from "../ui/index.js";

const APP_NAME = "GLYPHER";


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  レイアウト定数 (content-relative)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ウィンドウ本体が既に CONTENT_PADDING (既定 6px) を全辺に適用しているため、
// アプリ側では追加のオフセットを持たず、コンテンツ領域 (cr) の原点にそのまま
// 各要素を配置する (二重の余白を避ける)。
//
// CRAP のうち反復・整列・近接を担保するため、ラベルと本体の位置関係は
// 以下の 2 つの間隔だけで統一する:
//   LABEL_GAP   … ラベル下端から対応する本体上端までの間隔 (常に 4px)
//   SECTION_GAP … あるセクションの本体下端から次のラベルまでの間隔
// また、ラベルと本体は常に同じ左端 x (= 0, cr.x にフラッシュ) に揃える。
const LABEL_GAP = 4;
const SECTION_GAP = 8;

// キャラクタマップ: 編集対象の文字を現フォントで一覧表示 (小文字は除外)
const CMAP_COLS = 16;
const CMAP_CELL = 11; // (CMAP_CELL - glyphW=5) = 6 → 上下左右 3px で対称配置
// 角丸枠線 (FRAME_BORDER) + 枠内側の分離余白 (FRAME_INNER) = 枠の外周から
// 文字セルまでの距離。本体 (枠の外周) はラベルと同じ x=0 に揃える。
const FRAME_BORDER = 1;
const FRAME_INNER = 1;
const FRAME_MARGIN = FRAME_BORDER + FRAME_INNER;
const CMAP_X = 0;
const CMAP_LABEL_Y = 0; // "GLYPHS:" ラベル
const CMAP_Y = CMAP_LABEL_Y + GLYPH_H + LABEL_GAP; // ラベルの LABEL_GAP 下に枠

// エディタ: 選択中グリフの拡大編集グリッド
const EDIT_SCALE = 15; // 5x5 を 75px に拡大 (編集しやすさ + 幅の収まり)
const EDITOR_X = 0; // グリッド左端の縦線もラベルと同じ x=0 に揃える
const TOOLBAR_GAP = 12; // エディタとツールバー (CLEAR/INVERT) の間隔

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @type {{ glyphW:number, glyphH:number, firstChar:number, charCount:number }|null} */
let metrics = null;
/** @type {Uint8Array[]|null} 編集中の全グリフ (working copy) */
let working = null;
/** @type {Uint8Array[]|null} 起動時のスナップショット (REVERT 用) */
let seed = null;
/** 編集対象の文字インデックス (0..charCount-1、working への実インデックス) */
let selIndex = 0;
/** UI に表示・編集する文字の実インデックス一覧 (小文字 a-z を除外) */
let EDITABLE = [];

// 動的レイアウト (metrics 確定後に算出)
let CMAP_ROWS = 6;
let CMAP_H = CMAP_ROWS * CMAP_CELL;
let CMAP_BOX_H = 0; // 枠 (角丸罫線 + 内側余白) を含めた charmap の実高さ
let EDIT_LABEL_Y = 0;
let EDITOR_Y = 0;
let EDITOR_W = 0;
let EDITOR_H = 0;
let TOOLBAR_X = 0;
let PREVIEW_LABEL_Y = 0;
let BTN_ROW_Y = 0;

function _copyBuf(b) {
  return Uint8Array.from(b);
}

/** 現在のシステムフォントを取り込んで編集対象にする (REVERT 用スナップも保存) */
function _seedFromSystem() {
  metrics = getFontMetrics();
  // 編集対象 = 小文字 a-z (0x61-0x7A) を除く全 ASCII。
  // PIXERA OS は全テキストを大文字化するため小文字は表示されず、5x5 フォントでも
  // プレースホルダ (塗りつぶしブロック) のまま。UI に出しても無意味なので除外。
  EDITABLE = [];
  for (let i = 0; i < metrics.charCount; i++) {
    const code = metrics.firstChar + i;
    if (code >= 0x61 && code <= 0x7a) continue;
    EDITABLE.push(i);
  }
  const len = metrics.glyphW * metrics.glyphH;
  working = new Array(metrics.charCount);
  seed = new Array(metrics.charCount);
  for (let i = 0; i < metrics.charCount; i++) {
    const ch = String.fromCharCode(metrics.firstChar + i);
    const g = getGlyph(ch);
    const buf = g && g.length === len ? _copyBuf(g) : new Uint8Array(len);
    working[i] = buf;
    seed[i] = _copyBuf(buf);
  }
  // 'A' を初期選択 (なければ先頭)
  const aIdx = "A".charCodeAt(0) - metrics.firstChar;
  selIndex = aIdx >= 0 && aIdx < metrics.charCount ? aIdx : 0;

  _computeLayout();
}

/** metrics 確定後にレイアウト座標を算出する */
function _computeLayout() {
  const gw = metrics.glyphW;
  const gh = metrics.glyphH;
  CMAP_ROWS = Math.ceil(EDITABLE.length / CMAP_COLS);
  CMAP_H = CMAP_ROWS * CMAP_CELL;
  CMAP_BOX_H = CMAP_H + FRAME_MARGIN * 2;
  EDIT_LABEL_Y = CMAP_Y + CMAP_BOX_H + SECTION_GAP;
  EDITOR_Y = EDIT_LABEL_Y + GLYPH_H + LABEL_GAP;
  EDITOR_W = gw * EDIT_SCALE + 1;
  EDITOR_H = gh * EDIT_SCALE + 1;
  TOOLBAR_X = EDITOR_X + EDITOR_W + TOOLBAR_GAP;
  PREVIEW_LABEL_Y = EDITOR_Y + EDITOR_H + SECTION_GAP;
  // プレビュー: hline + "PREVIEW:" + パングラム 2 行
  const LH = gh + 2;
  BTN_ROW_Y = PREVIEW_LABEL_Y + GLYPH_H + LABEL_GAP + LH * 2 + SECTION_GAP;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  グリフ操作
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _clearGlyph() {
  if (working) working[selIndex].fill(0);
}

function _invertGlyph() {
  if (!working) return;
  const g = working[selIndex];
  for (let i = 0; i < g.length; i++) g[i] = g[i] ? 0 : 1;
}

/** 編集したフォントを OS 全体に即時適用する */
function _applyToSystem() {
  if (!working) return;
  setGlyphs(working.map(_copyBuf));
}

/** 起動時のシステムフォントに戻す (エディタもスナップショットへ復帰) */
function _revert() {
  if (!seed) return;
  setGlyphs(seed.map(_copyBuf));
  working = seed.map(_copyBuf);
}

/** 名前を付けて VFS に保存 → レジストリ登録 → システムフォントに設定 */
function _save() {
  if (!working) return;
  UI.openPromptDialog("FONT NAME:", {
    title: "SAVE FONT",
    defaultValue: "MYFONT",
    maxLength: 16,
    onResult: (name) => {
      if (!name) return;
      // ファイル名に使えない文字を除去
      const clean = name.replace(/[/\\:*?"<>|]/g, "").trim() || "MYFONT";
      const id = saveUserFont(clean, working);
      // 保存したフォントをシステムに適用 + 選択を永続化
      setSystemFont(id);
    },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ウィジェット
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let btnClear, btnInvert, btnApply, btnRevert, btnSave;
let widgetGroup;

/** onMeasure: charmap / editor+toolbar / preview / 下段ボタン列の実コンテンツ寸法
 * (cw/ch) を返す。各要素は cr 原点にフラッシュ配置されているため追加マージンは持たず、
 * pad / chrome / 枠の加算は WM (calcWindowSize) 側に一元化する。
 * onMeasure を渡すことで、フォント / CONTENT PAD 変更時に WM (recalcAllWindows) が
 * 外寸を「内容 + pad×2」へ上下左右対称に再フィットする (固定外寸による余白の非対称を防ぐ)。 */
function _measureContent() {
  const gw = metrics.glyphW;
  const cmapRight = CMAP_X + CMAP_COLS * CMAP_CELL + FRAME_MARGIN * 2;
  const toolbarRight = TOOLBAR_X + Math.max(btnClear.w, btnInvert.w);
  const STEP = gw + 1;
  const maxLineLen = Math.max(...PANGRAM_LINES.map((s) => s.length));
  const previewRight = STEP * maxLineLen - 1;
  const bottomRight = btnApply.w + 6 + btnRevert.w + 6 + btnSave.w;
  const cw = Math.max(cmapRight, toolbarRight, previewRight, bottomRight);
  const ch = BTN_ROW_Y + btnApply.h;
  return { w: cw, h: ch };
}

function _initWidgets() {
  if (widgetGroup) return;
  // レイアウトは _seedFromSystem 内で確定済み (factory で seed → init の順)
  // 右カラム: グリフ単位の編集ツール (現在の文字に作用)
  btnClear = new UI.PushButton(TOOLBAR_X, EDITOR_Y, "CLEAR", _clearGlyph);
  btnInvert = new UI.PushButton(
    TOOLBAR_X,
    EDITOR_Y + 18,
    "INVERT",
    _invertGlyph,
  );
  // 下段: フォント単位のアクション (APPLY / REVERT / SAVE)
  btnApply = new UI.PushButton(0, BTN_ROW_Y, "APPLY", _applyToSystem);
  btnRevert = new UI.PushButton(
    btnApply.w + 6,
    BTN_ROW_Y,
    "REVERT",
    _revert,
  );
  btnSave = new UI.PushButton(
    btnApply.w + 6 + btnRevert.w + 6,
    BTN_ROW_Y,
    "SAVE",
    _save,
  );
  widgetGroup = new UI.WidgetGroup([
    btnClear,
    btnInvert,
    btnApply,
    btnRevert,
    btnSave,
  ]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** グリフバッファを任意位置・倍率・色で描く */
function drawGlyphBuf(buf, gw, gh, cx, cy, scale, color) {
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (buf[y * gw + x]) {
        if (scale === 1) pset(cx + x, cy + y, color);
        else fillRect(cx + x * scale, cy + y * scale, scale, scale, color);
      }
    }
  }
}

function drawCharMap(cr) {
  const gw = metrics.glyphW;
  const gh = metrics.glyphH;
  drawText(cr.x, cr.y + CMAP_LABEL_Y, "GLYPHS:", 1);
  // 枠の外周 (boxX/boxY) をラベルと同じ x=0 に揃え、その内側に
  // FRAME_BORDER (罫線) + FRAME_INNER (文字との分離余白) を確保する。
  const boxX = cr.x + CMAP_X;
  const boxY = cr.y + CMAP_Y;
  const boxW = CMAP_COLS * CMAP_CELL + FRAME_MARGIN * 2;
  const boxH = CMAP_H + FRAME_MARGIN * 2;
  const baseX = boxX + FRAME_MARGIN;
  const baseY = boxY + FRAME_MARGIN;
  const gx = Math.floor((CMAP_CELL - gw) / 2);
  const gy = Math.floor((CMAP_CELL - gh) / 2);
  // 1px の角丸外枠と、内側 1px 余白で文字セルとの分離を確保
  drawRoundRect(boxX, boxY, boxW, boxH, 1, 1);
  for (let k = 0; k < EDITABLE.length; k++) {
    const gi = EDITABLE[k];
    const col = k % CMAP_COLS;
    const row = (k / CMAP_COLS) | 0;
    const cx = baseX + col * CMAP_CELL;
    const cy = baseY + row * CMAP_CELL;
    if (gi === selIndex) {
      // 選択セルは角丸の反転背景で強調する
      fillRoundRect(cx, cy, CMAP_CELL, CMAP_CELL, 1, 1);
      drawRoundRect(cx, cy, CMAP_CELL, CMAP_CELL, 1, 1);
      drawGlyphBuf(working[gi], gw, gh, cx + gx, cy + gy, 1, 0);
    } else {
      drawGlyphBuf(working[gi], gw, gh, cx + gx, cy + gy, 1, 1);
    }
  }
}

function drawEditor(cr) {
  const gw = metrics.glyphW;
  const gh = metrics.glyphH;
  // EDIT ラベル (GLYPHS:/PREVIEW: と揃え、選択文字に依らない固定表記にする)
  drawText(cr.x, cr.y + EDIT_LABEL_Y, "EDIT:", 1);

  // グリッドの左端 (最初の縦線) をラベルと同じ x=0 に揃える
  const gridX = cr.x + EDITOR_X;
  const gridY = cr.y + EDITOR_Y;
  for (let y = 0; y <= gh; y++) {
    hline(gridX, gridX + EDITOR_W - 1, gridY + y * EDIT_SCALE, 1);
  }
  for (let x = 0; x <= gw; x++) {
    vline(gridX + x * EDIT_SCALE, gridY, gridY + EDITOR_H - 1, 1);
  }
  // ON セルは各セルの内部に上下左右対称の余白を持たせ、グリッド線と密着しないようにする。
  //
  // 根本原因: グリッド線 (hline/vline) はセルの左端・上端の座標 (gridX + x*EDIT_SCALE)
  // そのものに 1px 幅で描画される。つまりそのセルの左/上境界は「線のピクセル自身」であり、
  // 右/下境界の線ピクセル (gridX + (x+1)*EDIT_SCALE) はそのセルには属さない (隣セルの境界)。
  // そのため、塗り開始位置を単純に (境界座標 + cellInset) とすると、左/上は「線ピクセルから
  // cellInset 分」の余白になる一方、右/下は「次の線ピクセルの手前 cellInset 分」の余白になり、
  // 左/上の余白が実質 1px 少なく見える (線ピクセル分が余白に含まれてしまわないため)。
  // 対称にするには、まず線ピクセル自身の 1px を余白側で消費 (+1) した上で、
  // 残りの内部領域 (EDIT_SCALE - 1 px) の中央に対称余白 cellInset を取る。
  const g = working[selIndex];
  const cellInset = 1;
  const cellW = EDIT_SCALE - 1 - cellInset * 2;
  const cellH = EDIT_SCALE - 1 - cellInset * 2;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (g[y * gw + x]) {
        fillRect(
          gridX + x * EDIT_SCALE + 1 + cellInset,
          gridY + y * EDIT_SCALE + 1 + cellInset,
          cellW,
          cellH,
          1,
        );
      }
    }
  }
}

// パングラム (全アルファベットを含む英文): フォントプレビューの定番。
const PANGRAM_LINES = ["THE QUICK BROWN FOX", "JUMPS OVER THE LAZY DOG"];

function drawPreview(cr) {
  const gw = metrics.glyphW;
  const gh = metrics.glyphH;
  const baseX = cr.x;
  const baseY = cr.y + PREVIEW_LABEL_Y;
  hline(cr.x, cr.x + cr.w - 1, baseY - SECTION_GAP / 2, 1);
  drawText(baseX, baseY, "PREVIEW:", 1);

  const STEP = gw + 1;
  const LH = gh + 2;
  let ly = baseY + GLYPH_H + LABEL_GAP;
  for (const line of PANGRAM_LINES) {
    let cx = baseX;
    for (const ch of line) {
      const idx = ch.charCodeAt(0) - metrics.firstChar;
      if (ch !== " " && idx >= 0 && idx < metrics.charCount) {
        drawGlyphBuf(working[idx], gw, gh, cx, ly, 1, 1);
      }
      cx += STEP;
    }
    ly += LH;
  }
}

function onDraw(cr) {
  if (!working) _seedFromSystem();
  _initWidgets();
  drawCharMap(cr);
  drawEditor(cr);
  drawPreview(cr);
  widgetGroup.draw(cr);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  入力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** キャラクタマップのヒットテスト → 文字インデックス or null */
function _charMapHit(localX, localY) {
  const dx = localX - (CMAP_X + FRAME_MARGIN);
  const dy = localY - (CMAP_Y + FRAME_MARGIN);
  if (dx < 0 || dy < 0) return null;
  const col = (dx / CMAP_CELL) | 0;
  const row = (dy / CMAP_CELL) | 0;
  if (col >= CMAP_COLS || row >= CMAP_ROWS) return null;
  const k = row * CMAP_COLS + col;
  if (k < 0 || k >= EDITABLE.length) return null;
  return EDITABLE[k]; // セル位置 → working への実インデックス
}

/** エディタグリッドのヒットテスト → {x,y} or null */
function _editorHit(localX, localY) {
  const dx = localX - EDITOR_X;
  const dy = localY - EDITOR_Y;
  if (dx < 0 || dy < 0 || dx >= EDITOR_W - 1 || dy >= EDITOR_H - 1) return null;
  return { x: (dx / EDIT_SCALE) | 0, y: (dy / EDIT_SCALE) | 0 };
}

let _lastPaintValue = null;

function onInput(ev) {
  if (!working) _seedFromSystem();
  _initWidgets();
  widgetGroup.update(ev);

  if (ev.type === "down") {
    const ci = _charMapHit(ev.localX, ev.localY);
    if (ci !== null) {
      selIndex = ci;
      return;
    }
    const cell = _editorHit(ev.localX, ev.localY);
    if (cell) {
      const g = working[selIndex];
      const idx = cell.y * metrics.glyphW + cell.x;
      g[idx] = g[idx] ? 0 : 1;
      _lastPaintValue = g[idx];
    }
  }
  if (ev.type === "held" && _lastPaintValue !== null) {
    const cell = _editorHit(ev.localX, ev.localY);
    if (cell) {
      const g = working[selIndex];
      g[cell.y * metrics.glyphW + cell.x] = _lastPaintValue;
    }
  }
  if (ev.type === "up") {
    _lastPaintValue = null;
  }
  if (ev.type === "hover") {
    if (
      _charMapHit(ev.localX, ev.localY) !== null ||
      _editorHit(ev.localX, ev.localY)
    ) {
      wmRequestCursor("pointer");
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  登録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

wmRegister(
  APP_NAME,
  () => {
    _seedFromSystem();
    _initWidgets();
    // 外寸は明示せず onMeasure (_measureContent) から自動算出させる。これにより
    // CONTENT PAD / フォント変更時も WM が外寸を対称に再フィットし、通常窓と同様に
    // リサイズ・最大化・snap・FIT TO CONTENT が使える (固定サイズ・最大化禁止を廃止)。
    return wmOpen(-1, -1, 0, 0, APP_NAME, onDraw, onInput, _measureContent, {
      about:
        "Edit the system font glyph by glyph. Pick a character from the " +
        "map, draw it in the grid, then APPLY to use your font across the " +
        "OS, or SAVE it with a name.",
    });
  },
  { category: "EXPERIMENT" },
);
