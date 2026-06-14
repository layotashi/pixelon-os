/**
 * @module ui/scrollbar
 * scrollbar.js — スクロールバー プリミティブ
 *
 * スクロール状態の管理・描画・入力処理を単一モジュールに集約する。
 * ListBox / TreeView / TextArea およびウィンドウスクロール (wm.js) が
 * 共通のスクロール部品として使用する。
 *
 * ── 設計原則 ──
 *   1. 単位非依存: offset / viewport / content は行数でもピクセル数でもよい
 *   2. ステートレス描画: drawVScrollbar / drawHScrollbar は毎フレーム呼ぶ
 *   3. 副作用は state への書き込みのみ (ports.js 経由の描画を除く)
 *   4. consumed フラグ: 入力を消費したかどうかを呼び出し元に通知
 *
 * ── スクロールバーの見た目仕様 ──
 *   スクロールバーは「スロット」と呼ぶ矩形領域に描画される。
 *   スロットの構成 (垂直の場合、左から右へ):
 *
 *     sep(1px) │ 暗色(1px) │ thumb(SCROLLBAR_W) │ 暗色(1px)
 *     ├────────────── SCROLLBAR_SLOT_WIDTH (= SCROLLBAR_W + 3) ──────────┤
 *
 *   上下方向も同様に 1px の暗色余白 (SCROLLBAR_MARGIN) が入る。
 *   この仕様は drawVScrollbarSlot / drawHScrollbarSlot が一元管理し、
 *   呼び出し側はスロット矩形を渡すだけでよい。
 *
 * ── スクロール状態 (ScrollState) ──
 *   {
 *     offset:   number,  // 現在のスクロール位置 (0-based)
 *     viewport: number,  // 表示領域サイズ (行数 or px)
 *     content:  number,  // コンテンツ全体サイズ (行数 or px)
 *     _thumbDrag:      boolean, // サムをドラッグ中か
 *     _dragStartPos:   number,  // ドラッグ開始時のマウス座標
 *     _dragStartOffset:number,  // ドラッグ開始時の offset
 *   }
 *
 * ── 使い方 ──
 *   const vs = createScrollState(visibleRows, items.length);
 *   // 描画 (高レベル — 推奨):
 *   drawVScrollbarSlot(vs, slotX, slotY, slotH);
 *   // 描画 (低レベル — thumb のみ):
 *   drawVScrollbar(vs, thumbX, thumbY, thumbH);
 *   // 入力:
 *   const { consumed } = handleVScrollInput(vs, evType, mouseY, thumbY, thumbH);
 *   // 値の読み取り:
 *   const startIdx = vs.offset;
 */

import { fillRect, vline, hline } from "./ports.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** スクロールバーの太さ (px) */
export const SCROLLBAR_W = 7;

/**
 * 明色枠線と thumb 間の暗色余白 (px)。
 * thumb の上下左右に均等に適用される。
 */
export const SCROLLBAR_MARGIN = 1;

/**
 * スクロールバーが占有する総幅/総高 (px)。
 * sep(1) + margin(1) + thumb(SCROLLBAR_W) + margin(1) = SCROLLBAR_W + 3。
 * 呼び出し側が contentW 等からスクロールバー分を差し引く際に使う。
 */
export const SCROLLBAR_SLOT_WIDTH = SCROLLBAR_W + SCROLLBAR_MARGIN * 2 + 1;

/** サムの最小サイズ (px) */
const THUMB_MIN = 5;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ファクトリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * スクロール状態を生成する。
 * @param {number} viewport  表示領域サイズ (行数 or px)
 * @param {number} content   コンテンツ全体サイズ (行数 or px)
 * @returns {object} ScrollState
 */
export function createScrollState(viewport, content) {
  return {
    offset: 0,
    viewport,
    content,
    _thumbDrag: false,
    _dragStartPos: 0,
    _dragStartOffset: 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  クエリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * スクロール可能な最大 offset を返す。
 * @param {object} s  ScrollState
 * @returns {number}
 */
export function scrollMaxOffset(s) {
  return Math.max(0, s.content - s.viewport);
}

/**
 * スクロールバーの表示が必要かどうかを返す。
 * @param {object} s  ScrollState
 * @returns {boolean}
 */
export function scrollNeeded(s) {
  return s.content > s.viewport;
}

/**
 * サムをドラッグ中かどうかを返す。
 * @param {object} s  ScrollState
 * @returns {boolean}
 */
export function scrollIsDragging(s) {
  return s._thumbDrag;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ミューテーション
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * offset を delta 分だけ変化させる (クランプ付き)。
 * @param {object} s      ScrollState
 * @param {number} delta  変化量 (正=下/右、負=上/左)
 */
export function scrollBy(s, delta) {
  const max = scrollMaxOffset(s);
  s.offset = Math.max(0, Math.min(max, s.offset + delta));
}

/**
 * offset を直接設定する (クランプ付き)。
 * @param {object} s       ScrollState
 * @param {number} offset  新しい offset
 */
export function scrollTo(s, offset) {
  const max = scrollMaxOffset(s);
  s.offset = Math.max(0, Math.min(max, offset));
}

/**
 * 指定インデックスが表示領域内に収まるよう offset を調整する。
 * @param {object} s      ScrollState
 * @param {number} index  表示したいインデックス (0-based)
 */
export function scrollEnsureVisible(s, index) {
  if (index < s.offset) {
    s.offset = index;
  }
  if (index >= s.offset + s.viewport) {
    s.offset = index - s.viewport + 1;
  }
}

/**
 * content サイズ変更時に offset をクランプする。
 * @param {object} s        ScrollState
 * @param {number} content  新しいコンテンツサイズ
 */
export function scrollSetContent(s, content) {
  s.content = content;
  const max = scrollMaxOffset(s);
  if (s.offset > max) s.offset = max;
}

/**
 * viewport サイズ変更時に offset をクランプする。
 * @param {object} s         ScrollState
 * @param {number} viewport  新しい表示領域サイズ
 */
export function scrollSetViewport(s, viewport) {
  s.viewport = viewport;
  const max = scrollMaxOffset(s);
  if (s.offset > max) s.offset = max;
}

/**
 * ドラッグ状態を強制リセットする (フォーカス喪失時など)。
 * @param {object} s  ScrollState
 */
export function scrollDragReset(s) {
  s._thumbDrag = false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  サムジオメトリ (内部)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * サムの位置・サイズを算出する。
 * @param {object} s          ScrollState
 * @param {number} trackStart トラック開始座標 (px)
 * @param {number} trackLen   トラック長さ (px)
 * @returns {{ pos:number, size:number, trackRange:number }|null}
 *          スクロール不要なら null
 */
function thumbGeom(s, trackStart, trackLen) {
  const max = scrollMaxOffset(s);
  if (max <= 0) return null;
  const ratio = s.viewport / s.content;
  const size = Math.max(THUMB_MIN, (trackLen * ratio) | 0);
  const trackRange = trackLen - size;
  const pos = (trackStart + trackRange * (s.offset / max)) | 0;
  return { pos, size, trackRange };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 垂直スクロールバーを描画する。
 * トラック左端に区切り線 (vline) を引き、サムを fillRect で描画。
 * @param {object} s  ScrollState
 * @param {number} x  スクロールバー左端 X
 * @param {number} y  スクロールバー上端 Y (= トラック開始)
 * @param {number} h  スクロールバー高さ (= トラック長さ)
 */
export function drawVScrollbar(s, x, y, h) {
  const geom = thumbGeom(s, y, h);
  if (!geom) {
    // スクロール不要: トラック全体を明色で埋める (全コンテンツ表示中)
    fillRect(x, y, SCROLLBAR_W, h, 1);
    return;
  }
  fillRect(x, geom.pos, SCROLLBAR_W, geom.size, 1);
}

/**
 * 垂直スクロールバーの区切り線を描画する。
 * ウィジェット枠 ↔ スクロールバー間の境界線。
 * @param {number} x   区切り線 X
 * @param {number} y1  上端 Y
 * @param {number} y2  下端 Y
 */
export function drawVScrollSep(x, y1, y2) {
  vline(x, y1, y2, 1);
}

/**
 * 水平スクロールバーを描画する。
 * トラック上端に区切り線 (hline) を引き、サムを fillRect で描画。
 * @param {object} s  ScrollState
 * @param {number} x  スクロールバー左端 X (= トラック開始)
 * @param {number} y  スクロールバー上端 Y
 * @param {number} w  スクロールバー幅 (= トラック長さ)
 */
export function drawHScrollbar(s, x, y, w) {
  const geom = thumbGeom(s, x, w);
  if (!geom) {
    // スクロール不要: トラック全体を明色で埋める
    fillRect(x, y, w, SCROLLBAR_W, 1);
    return;
  }
  fillRect(geom.pos, y, geom.size, SCROLLBAR_W, 1);
}

/**
 * 水平スクロールバーの区切り線を描画する。
 * @param {number} x1  左端 X
 * @param {number} x2  右端 X
 * @param {number} y   区切り線 Y
 */
export function drawHScrollSep(x1, x2, y) {
  hline(x1, x2, y, 1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  高レベル描画 (スロット単位)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// スクロールバーの見た目仕様 (sep + 暗色余白 + thumb) を一元管理する。
// 呼び出し側はスロット矩形を渡すだけでよく、内部レイアウトを知る必要がない。

/**
 * 垂直スクロールバーをスロット単位で描画する。
 *
 * スロットは以下の構造を持つ (左から右へ):
 *   sep(1px) │ 暗色余白(SCROLLBAR_MARGIN) │ thumb(SCROLLBAR_W) │ 暗色余白(SCROLLBAR_MARGIN)
 *
 * 上下方向にも SCROLLBAR_MARGIN の暗色余白が入る。
 *
 * @param {object} s  ScrollState
 * @param {number} x  スロット左端 X (sep の X 座標)
 * @param {number} y  スロット上端 Y
 * @param {number} h  スロット高さ
 */
export function drawVScrollbarSlot(s, x, y, h) {
  // sep 線
  vline(x, y, y + h - 1, 1);
  // thumb (暗色余白を挟んだ内側に描画)
  const thumbX = x + 1 + SCROLLBAR_MARGIN;
  const thumbY = y + SCROLLBAR_MARGIN;
  const thumbH = h - SCROLLBAR_MARGIN * 2;
  if (thumbH > 0) drawVScrollbar(s, thumbX, thumbY, thumbH);
}

/**
 * 水平スクロールバーをスロット単位で描画する。
 *
 * スロットは以下の構造を持つ (上から下へ):
 *   sep(1px) │ 暗色余白(SCROLLBAR_MARGIN) │ thumb(SCROLLBAR_W) │ 暗色余白(SCROLLBAR_MARGIN)
 *
 * 左右方向にも SCROLLBAR_MARGIN の暗色余白が入る。
 *
 * @param {object} s  ScrollState
 * @param {number} x  スロット左端 X
 * @param {number} y  スロット上端 Y (sep の Y 座標)
 * @param {number} w  スロット幅
 */
export function drawHScrollbarSlot(s, x, y, w) {
  // sep 線
  hline(x, x + w - 1, y, 1);
  // thumb (暗色余白を挟んだ内側に描画)
  const thumbX = x + SCROLLBAR_MARGIN;
  const thumbY = y + 1 + SCROLLBAR_MARGIN;
  const thumbW = w - SCROLLBAR_MARGIN * 2;
  if (thumbW > 0) drawHScrollbar(s, thumbX, thumbY, thumbW);
}

/**
 * drawVScrollbarSlot で描画されるスロットの thumb 領域を返す。
 * 入力処理 (handleVScrollInput) に渡す trackY / trackH を得るため。
 *
 * @param {number} slotX  スロット左端 X
 * @param {number} slotY  スロット上端 Y
 * @param {number} slotH  スロット高さ
 * @returns {{ x:number, y:number, w:number, h:number }}
 */
export function vScrollbarSlotThumbArea(slotX, slotY, slotH) {
  return {
    x: slotX + 1 + SCROLLBAR_MARGIN,
    y: slotY + SCROLLBAR_MARGIN,
    w: SCROLLBAR_W,
    h: Math.max(0, slotH - SCROLLBAR_MARGIN * 2),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  入力処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 垂直スクロールバーの入力を処理する。
 * サムのクリック・ドラッグ・トラック直クリック (ジャンプ) を扱う。
 * ホイールは含まない (呼び出し元で scrollBy を直接使用)。
 *
 * @param {object} s         ScrollState
 * @param {string} evType    イベント種別 ("down" | "held" | "up")
 * @param {number} mousePos  マウス Y 座標 (ローカル座標)
 * @param {number} trackY    トラック上端 Y (ローカル座標)
 * @param {number} trackH    トラック高さ (px)
 * @returns {{ consumed: boolean }}  入力を消費したかどうか
 */
export function handleVScrollInput(s, evType, mousePos, trackY, trackH) {
  return _handleScrollInput(s, evType, mousePos, trackY, trackH);
}

/**
 * 水平スクロールバーの入力を処理する。
 * @param {object} s         ScrollState
 * @param {string} evType    イベント種別 ("down" | "held" | "up")
 * @param {number} mousePos  マウス X 座標 (ローカル座標)
 * @param {number} trackX    トラック左端 X (ローカル座標)
 * @param {number} trackW    トラック幅 (px)
 * @returns {{ consumed: boolean }}  入力を消費したかどうか
 */
export function handleHScrollInput(s, evType, mousePos, trackX, trackW) {
  return _handleScrollInput(s, evType, mousePos, trackX, trackW);
}

/**
 * スクロールバー入力処理の共通実装 (方向非依存)。
 * @param {object} s         ScrollState
 * @param {string} evType    イベント種別
 * @param {number} mousePos  マウス座標 (スクロール方向)
 * @param {number} trackStart  トラック開始座標
 * @param {number} trackLen    トラック長さ
 * @returns {{ consumed: boolean }}
 */
function _handleScrollInput(s, evType, mousePos, trackStart, trackLen) {
  const max = scrollMaxOffset(s);

  // ── クリック: サム上ならドラッグ開始、トラック空白ならジャンプ+ドラッグ開始 ──
  if (evType === "down" && max > 0) {
    const geom = thumbGeom(s, trackStart, trackLen);
    if (!geom) return { consumed: false };

    const onThumb = mousePos >= geom.pos && mousePos < geom.pos + geom.size;

    if (!onThumb && geom.trackRange > 0) {
      // トラック空白クリック → サム中心がクリック位置に来るようジャンプ
      const clickRatio =
        (mousePos - trackStart - geom.size / 2) / geom.trackRange;
      scrollTo(s, Math.round(clickRatio * max));
    }

    s._thumbDrag = true;
    s._dragStartPos = mousePos;
    s._dragStartOffset = s.offset;
    return { consumed: true };
  }

  // ── サム ドラッグ中 ──
  if (evType === "held" && s._thumbDrag) {
    const geom = thumbGeom(s, trackStart, trackLen);
    if (geom && geom.trackRange > 0) {
      const delta = mousePos - s._dragStartPos;
      const dScroll = (delta / geom.trackRange) * max;
      scrollTo(s, Math.round(s._dragStartOffset + dScroll));
    }
    return { consumed: true };
  }

  // ── サム ドラッグ終了 ──
  if (evType === "up" && s._thumbDrag) {
    s._thumbDrag = false;
    return { consumed: true };
  }

  return { consumed: false };
}

