/**
 * @module ui/widgets/TextArea
 * TextArea.js — 複数行テキスト入力（汎用ウィジェット）
 *
 * 編集の中身（文書・選択・Undo・入力・本文描画）は TextEditView / TextEditModel に
 * 委譲し、この widget は「固定サイズ・角丸の枠・右端の縦スクロールバー」という chrome
 * だけを足す薄いラッパ。NotePad の editor-as-body は同じ TextEditView を別 chrome
 * （枠なしフィル + 端の V/H バー）で包む。ストリーム選択・矩形選択・キーボード/マウス
 * 操作に対応。
 */

import { FocusableWidget } from "../FocusableWidget.js";
import * as Ports from "../ports.js";
import * as Helpers from "../ui_helpers.js";
import * as Scroll from "../scrollbar.js";
import { TextEditView } from "../text_edit_view.js";

export class TextArea extends FocusableWidget {
  /**
   * @param {number} x  コンテンツ領域内の X
   * @param {number} y  コンテンツ領域内の Y
   * @param {number} widthChars   表示幅 (文字数)
   * @param {number} visibleRows  表示行数
   * @param {number} maxLines     最大行数
   * @param {string} text         初期テキスト (改行区切り)
   * @param {function} [onChange] テキスト変更コールバック (newText) => void
   */
  constructor(x, y, widthChars, visibleRows, maxLines, text, onChange) {
    const charW = Ports.GLYPH_W + 1;
    const lineH = Helpers.TEXTAREA_LINE_HEIGHT;
    const innerW = widthChars * charW + Ports.GLYPH_W;
    const innerH = visibleRows * lineH - 1;
    const w =
      innerW + Helpers.BUTTON_PADDING * 2 + Scroll.SCROLLBAR_SLOT_WIDTH + 4;
    const h =
      innerH + Helpers.BUTTON_PADDING * 2 + Scroll.SCROLLBAR_SLOT_WIDTH + 4;
    super(x, y, w, h);
    this.widthChars = widthChars;
    this.visibleRows = visibleRows;
    /** 編集ビュー核（モデル + ビューポート + 入力 + 本文描画）。枠と縦バーはこの widget が足す。 */
    this.view = new TextEditView(text, maxLines, {
      widthChars,
      visibleRows,
      onChange,
    });
    /** @private 横スクロールバー状態（view.scrollX へ橋渡し。NotePad の editor と同じ橋渡し方式）。 */
    this._hScroll = Scroll.createScrollState(1, 1);
  }

  // ── 公開 API は view へ委譲（notepad 等の後方互換 + 汎用ウィジェットの API） ──
  get lines() { return this.view.lines; }
  set lines(v) { this.view.lines = v; }
  get cursorRow() { return this.view.cursorRow; }
  set cursorRow(v) { this.view.cursorRow = v; }
  get cursorCol() { return this.view.cursorCol; }
  set cursorCol(v) { this.view.cursorCol = v; }
  get scrollX() { return this.view.scrollX; }
  set scrollX(v) { this.view.scrollX = v; }
  get guideCol() { return this.view.guideCol; }
  set guideCol(v) { this.view.guideCol = v; }
  get showWhitespace() { return this.view.showWhitespace; }
  set showWhitespace(v) { this.view.showWhitespace = v; }
  get uppercaseInput() { return this.view.uppercaseInput; }
  set uppercaseInput(v) { this.view.uppercaseInput = v; }
  get showLineNumbers() { return this.view.showLineNumbers; }
  set showLineNumbers(v) { this.view.showLineNumbers = v; }

  getText() { return this.view.getText(); }
  selectedCharCount() { return this.view.selectedCharCount(); }
  setContentLength(length) { this.view.setContentLength(length); }
  scrollToTop() { this.view.scrollToTop(); }
  ensureVisible(row) { this.view.ensureVisible(row); }
  clearHistory() { this.view.clearHistory(); }
  snapshotForUndo() { this.view.snapshotForUndo(); }

  /** @override */
  remeasure() {
    const charW = Ports.GLYPH_W + 1;
    const innerW = this.widthChars * charW + Ports.GLYPH_W;
    const innerH = this.visibleRows * Helpers.TEXTAREA_LINE_HEIGHT - 1;
    this.w =
      innerW + Helpers.BUTTON_PADDING * 2 + Scroll.SCROLLBAR_SLOT_WIDTH + 4;
    this.h =
      innerH + Helpers.BUTTON_PADDING * 2 + Scroll.SCROLLBAR_SLOT_WIDTH + 4;
  }

  /** @override */
  get isTextInput() {
    return true;
  }

  /** @override */
  clearSelection() {
    this.view.clearSelection();
  }

  /** @override */
  resetDragState() {
    this.view.resetDragState();
    Scroll.scrollDragReset(this._hScroll);
  }

  /**
   * @private 横スクロールバー状態を view.scrollX と最長行から同期する。
   * NotePad の editor-as-body と同じ橋渡し方式 (詳細は notepad_editor.js を参照)。
   */
  _syncHScroll() {
    let maxLen = 0;
    const lines = this.view.lines;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > maxLen) maxLen = lines[i].length;
    }
    this._hScroll.viewport = this.view.widthChars;
    Scroll.scrollSetContent(this._hScroll, maxLen);
    if (Scroll.scrollIsDragging(this._hScroll)) {
      this.view.scrollX = this._hScroll.offset;
    } else {
      Scroll.scrollTo(this._hScroll, this.view.scrollX);
    }
  }

  /** @private スクロールバースロット矩形群 (絶対座標)。draw/update で共有する幾何。 */
  _scrollGeom(absX, absY) {
    const SLOT = Scroll.SCROLLBAR_SLOT_WIDTH;
    return {
      vSlotX: absX + this.w - 1 - SLOT,
      vSlotY: absY + 1,
      vSlotH: this.h - 2 - SLOT,
      hSlotX: absX + 1,
      hSlotY: absY + this.h - 1 - SLOT,
      hSlotW: this.w - 2 - SLOT,
      cornerX: absX + this.w - 1 - SLOT,
      cornerY: absY + this.h - 1 - SLOT,
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  描画（枠 + 本文 + 縦横スクロールバー）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** @override */
  draw(contentRect) {
    const absX = contentRect.x + this.x;
    const absY = contentRect.y + this.y;

    Ports.drawRoundRect(absX, absY, this.w, this.h, 1, 1);

    const innerX = absX + 2 + Helpers.BUTTON_PADDING;
    const innerY = absY + 2 + Helpers.BUTTON_PADDING;
    const innerW =
      this.w - 4 - Helpers.BUTTON_PADDING * 2 - Scroll.SCROLLBAR_SLOT_WIDTH;
    const innerH =
      this.h - 4 - Helpers.BUTTON_PADDING * 2 - Scroll.SCROLLBAR_SLOT_WIDTH;
    const focused = Helpers.getFocused() === this;

    this._syncHScroll();
    this.view.drawContent(innerX, innerY, innerW, innerH, focused);

    // 縦横スクロールバー + コーナー
    const g = this._scrollGeom(absX, absY);
    Scroll.drawVScrollbarSlot(this.view._vScroll, g.vSlotX, g.vSlotY, g.vSlotH);
    Scroll.drawHScrollbarSlot(this._hScroll, g.hSlotX, g.hSlotY, g.hSlotW);
    Scroll.drawScrollCorner(this.view._vScroll, g.cornerX, g.cornerY);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  入力（縦スクロールバー → 本文マウス / キーボード）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** @override */
  update(ev) {
    const hit = this.hitTest(ev.localX, ev.localY);

    // ── 縦横スクロールバー ──
    // ev.localX/Y は親コンテナ基準のローカル座標 (widget 自身の原点ではない) なので、
    // draw() の絶対座標計算と同じく this.x/this.y のオフセットを渡す必要がある。
    // これを渡し忘れると当たり判定がズレ、H バークリックが V バーの判定と誤って
    // 重なって誤発火する (縦スクロールが最下部まで飛ぶバグの原因だった)。
    const g = this._scrollGeom(this.x, this.y);
    const scrollbar = Scroll.vScrollbarSlotThumbArea(g.vSlotX, g.vSlotY, g.vSlotH);
    const hScrollbar = Scroll.hScrollbarSlotThumbArea(g.hSlotX, g.hSlotY, g.hSlotW);
    const vScroll = this.view._vScroll;
    const hScroll = this._hScroll;
    const inScrollbar =
      ev.localX >= scrollbar.x &&
      ev.localX < scrollbar.x + scrollbar.w &&
      ev.localY >= scrollbar.y &&
      ev.localY < scrollbar.y + scrollbar.h;
    const inHScrollbar =
      ev.localX >= hScrollbar.x &&
      ev.localX < hScrollbar.x + hScrollbar.w &&
      ev.localY >= hScrollbar.y &&
      ev.localY < hScrollbar.y + hScrollbar.h;

    if (
      inScrollbar &&
      (ev.type === "down" || ev.type === "held" || ev.type === "up")
    ) {
      Scroll.handleVScrollInput(vScroll, ev.type, ev.localY, scrollbar.y, scrollbar.h);
    }
    if (ev.type === "held" && Scroll.scrollIsDragging(vScroll) && !inScrollbar) {
      Scroll.handleVScrollInput(vScroll, ev.type, ev.localY, scrollbar.y, scrollbar.h);
    }
    if (ev.type === "up" && Scroll.scrollIsDragging(vScroll)) {
      Scroll.scrollDragReset(vScroll);
    }
    // スクロールバー領域では drag-v カーソル
    if (
      (inScrollbar || Scroll.scrollIsDragging(vScroll)) &&
      (ev.type === "hover" || ev.type === "held" || ev.type === "down")
    ) {
      Helpers.wmRequestCursor("drag-v");
    }

    if (
      inHScrollbar &&
      (ev.type === "down" || ev.type === "held" || ev.type === "up")
    ) {
      Scroll.handleHScrollInput(hScroll, ev.type, ev.localX, hScrollbar.x, hScrollbar.w);
      this.view.scrollX = hScroll.offset;
    }
    if (ev.type === "held" && Scroll.scrollIsDragging(hScroll) && !inHScrollbar) {
      Scroll.handleHScrollInput(hScroll, ev.type, ev.localX, hScrollbar.x, hScrollbar.w);
      this.view.scrollX = hScroll.offset;
    }
    if (ev.type === "up" && Scroll.scrollIsDragging(hScroll)) {
      Scroll.scrollDragReset(hScroll);
    }
    // 横スクロールバー領域では drag-h カーソル
    if (
      (inHScrollbar || Scroll.scrollIsDragging(hScroll)) &&
      (ev.type === "hover" || ev.type === "held" || ev.type === "down")
    ) {
      Helpers.wmRequestCursor("drag-h");
    }

    if (Scroll.scrollIsDragging(vScroll) || Scroll.scrollIsDragging(hScroll)) return;

    // ── 本文領域のマウス ──
    // スクロールバー領域を本文ヒットから除外する。除外しないと、内容が収まって
    // いる時の 100% thumb をクリックした際に本文カーソルが末尾へ飛び、意図せず
    // 下スクロールしてしまう（ドラッグ継続は _dragging 側で扱うので down のみ影響）。
    const innerX = this.x + 2 + Helpers.BUTTON_PADDING;
    const innerY = this.y + 2 + Helpers.BUTTON_PADDING;
    this.view.handleTextMouse(ev, hit && !inScrollbar && !inHScrollbar, innerX, innerY);
  }

  /** @override */
  handleKey() {
    return this.view.handleKey();
  }
}
