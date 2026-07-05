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
    const h = innerH + Helpers.BUTTON_PADDING * 2 + 4;
    super(x, y, w, h);
    this.widthChars = widthChars;
    this.visibleRows = visibleRows;
    /** 編集ビュー核（モデル + ビューポート + 入力 + 本文描画）。枠と縦バーはこの widget が足す。 */
    this.view = new TextEditView(text, maxLines, {
      widthChars,
      visibleRows,
      onChange,
    });
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
    this.h = innerH + Helpers.BUTTON_PADDING * 2 + 4;
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
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  描画（枠 + 本文 + 縦スクロールバー）
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
    const innerH = this.h - 4 - Helpers.BUTTON_PADDING * 2;
    const focused = Helpers.getFocused() === this;

    this.view.drawContent(innerX, innerY, innerW, innerH, focused);

    // 縦スクロールバー
    const slotX = absX + this.w - 1 - Scroll.SCROLLBAR_SLOT_WIDTH;
    const slotY = absY + 1;
    const slotH = this.h - 2;
    Scroll.drawVScrollbarSlot(this.view._vScroll, slotX, slotY, slotH);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  入力（縦スクロールバー → 本文マウス / キーボード）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** @override */
  update(ev) {
    const hit = this.hitTest(ev.localX, ev.localY);

    // ── 縦スクロールバー ──
    const scrollbar = Scroll.vScrollbarSlotThumbArea(
      this.x + this.w - 1 - Scroll.SCROLLBAR_SLOT_WIDTH,
      this.y + 1,
      this.h - 2,
    );
    const vScroll = this.view._vScroll;
    const inScrollbar =
      ev.localX >= scrollbar.x &&
      ev.localX < scrollbar.x + scrollbar.w &&
      ev.localY >= scrollbar.y &&
      ev.localY < scrollbar.y + scrollbar.h;

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
    if (Scroll.scrollIsDragging(vScroll)) return;

    // ── 本文領域のマウス ──
    // スクロールバー領域を本文ヒットから除外する。除外しないと、内容が収まって
    // いる時の 100% thumb をクリックした際に本文カーソルが末尾へ飛び、意図せず
    // 下スクロールしてしまう（ドラッグ継続は _dragging 側で扱うので down のみ影響）。
    const innerX = this.x + 2 + Helpers.BUTTON_PADDING;
    const innerY = this.y + 2 + Helpers.BUTTON_PADDING;
    this.view.handleTextMouse(ev, hit && !inScrollbar, innerX, innerY);
  }

  /** @override */
  handleKey() {
    return this.view.handleKey();
  }
}
