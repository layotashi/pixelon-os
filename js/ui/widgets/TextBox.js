/**
 * @module ui/widgets/TextBox
 * TextBox.js — 1 行テキスト入力
 *
 * クリックでカーソル配置、Shift+クリックで選択拡張。
 * キーボード入力は handleKey() で処理 (文字入力, カーソル移動, 選択, コピペ)。
 */

import { FocusableWidget } from "../FocusableWidget.js";
import * as Ports from "../ports.js";
import * as Helpers from "../ui_helpers.js";

export class TextBox extends FocusableWidget {
  /**
   * @param {number} x  コンテンツ領域内の X
   * @param {number} y  コンテンツ領域内の Y
   * @param {number} widthChars  表示幅 (文字数)
   * @param {number} maxLength   最大入力文字数
   * @param {string} text        初期テキスト
   * @param {function} [onChange] テキスト変更コールバック (newText) => void
   */
  constructor(x, y, widthChars, maxLength, text, onChange) {
    const charW = Ports.GLYPH_W + 1;
    const innerW = widthChars * charW + Ports.GLYPH_W;
    const w = innerW + Helpers.BUTTON_PADDING * 2 + 4;
    super(x, y, w, Helpers.BUTTON_AUTO_HEIGHT);
    this.text = String(text || "").slice(0, maxLength);
    this.maxLength = maxLength;
    this.widthChars = widthChars;
    /** カーソル位置 (文字間インデックス) */
    this.cursor = this.text.length;
    /** 表示スクロールオフセット (文字数) */
    this.scrollOffset = 0;
    /** 選択アンカー位置 (null=選択なし) */
    this.selectionAnchor = null;
    /** @private マウスドラッグ中 */
    this._dragging = false;
    this.onChange = onChange || null;
    /** @private カーソル点滅タイマー */
    this._blinkTimer = 0;
  }

  /** @override */
  remeasure() {
    const charW = Ports.GLYPH_W + 1;
    const innerW = this.widthChars * charW + Ports.GLYPH_W;
    this.w = innerW + Helpers.BUTTON_PADDING * 2 + 4;
    this.h = Helpers.BUTTON_AUTO_HEIGHT;
  }

  /** @override */
  get isTextInput() {
    return true;
  }

  /** @override */
  clearSelection() {
    this.selectionAnchor = null;
    this._dragging = false;
  }

  /** @override */
  resetDragState() {
    this._dragging = false;
  }

  // ── 選択ヘルパー (private) ──

  /** 正規化された選択範囲 [start, end) を返す。選択なしは null */
  _getSelectionRange() {
    if (this.selectionAnchor === null || this.selectionAnchor === this.cursor)
      return null;
    return this.selectionAnchor < this.cursor
      ? [this.selectionAnchor, this.cursor]
      : [this.cursor, this.selectionAnchor];
  }

  /** 選択範囲を削除し、カーソルを選択開始位置に移動する */
  _deleteSelection() {
    const selection = this._getSelectionRange();
    if (!selection) return false;
    this.text =
      this.text.slice(0, selection[0]) + this.text.slice(selection[1]);
    this.cursor = selection[0];
    this.selectionAnchor = null;
    return true;
  }

  /** スクロールオフセットを調整してカーソルが見えるようにする */
  _ensureCursorVisible() {
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    }
    if (this.cursor > this.scrollOffset + this.widthChars) {
      this.scrollOffset = this.cursor - this.widthChars;
    }
  }

  // ── 単語境界 (private) ──

  /** カーソルから左方向の単語境界を返す */
  _findWordBoundaryLeft(cursor) {
    let pos = cursor;
    if (pos <= 0) return 0;
    const cat = Helpers.charCat(this.text[pos - 1]);
    while (pos > 0 && Helpers.charCat(this.text[pos - 1]) === cat) pos--;
    return pos;
  }

  /** カーソルから右方向の単語境界を返す */
  _findWordBoundaryRight(cursor) {
    let pos = cursor;
    const len = this.text.length;
    if (pos >= len) return len;
    const cat = Helpers.charCat(this.text[pos]);
    while (pos < len && Helpers.charCat(this.text[pos]) === cat) pos++;
    return pos;
  }

  // ── 描画 ──

  /** @override */
  draw(contentRect) {
    const absX = contentRect.x + this.x;
    const absY = contentRect.y + this.y;

    Ports.drawRoundRect(absX, absY, this.w, this.h, 1, 1);

    const innerX = absX + 2 + Helpers.BUTTON_PADDING;
    const innerY = absY + 2 + Helpers.BUTTON_PADDING;
    const innerW = this.w - 4 - Helpers.BUTTON_PADDING * 2;

    const visible = this.text.slice(
      this.scrollOffset,
      this.scrollOffset + this.widthChars,
    );
    const charW = Ports.GLYPH_W + 1;
    const clipH = Ports.GLYPH_H + 2;
    Ports.pushClip(innerX, innerY, innerW, clipH);

    const selection = this._getSelectionRange();

    // 文字ごとに描画
    for (let i = 0; i < visible.length; i++) {
      const charX = innerX + i * charW;
      if (visible[i] === " ") {
        Ports.drawTextIcon("space-dot", charX, innerY, 1);
      } else {
        Ports.drawText(charX, innerY, visible[i], 1);
      }
    }

    // 選択下線
    if (selection) {
      const visibleStart = this.scrollOffset;
      const visibleEnd = this.scrollOffset + this.widthChars;
      const selDrawStart = Math.max(selection[0], visibleStart) - visibleStart;
      const selDrawEnd = Math.min(selection[1], visibleEnd) - visibleStart;
      if (selDrawStart < selDrawEnd) {
        const clampedEnd = Math.min(selDrawEnd, visible.length);
        const underlineY = innerY + Ports.GLYPH_H + 1;
        for (let i = selDrawStart; i < clampedEnd; i++) {
          const charX = innerX + i * charW;
          Ports.hline(charX, charX + (Ports.GLYPH_W - 1), underlineY, 1);
        }
      }
    }

    // キャレット点滅
    const isFocused = Helpers.getFocused() === this;
    if (isFocused && !selection) {
      this._blinkTimer = (this._blinkTimer + 1) % Helpers.TEXTBOX_BLINK_CYCLE;
      if (this._blinkTimer < Helpers.TEXTBOX_BLINK_CYCLE / 2) {
        const cursorScreenPos = this.cursor - this.scrollOffset;
        const charX = innerX + cursorScreenPos * charW;
        const underlineY = innerY + Ports.GLYPH_H + 1;
        Ports.hline(charX, charX + (Ports.GLYPH_W - 1), underlineY, 1);
      }
    } else if (!isFocused) {
      this._blinkTimer = 0;
    }

    Ports.popClip();
  }

  // ── 入力処理 ──

  /** @override */
  update(ev) {
    const hit = this.hitTest(ev.localX, ev.localY);

    if (ev.type === "down" && hit) {
      const innerX = this.x + 2 + Helpers.BUTTON_PADDING;
      const charW = Ports.GLYPH_W + 1;
      const relX = ev.localX - innerX;
      const charIdx = Math.round(relX / charW);
      const newCur = Math.max(
        0,
        Math.min(this.text.length, this.scrollOffset + charIdx),
      );
      if (Ports.mouseHasShift()) {
        if (this.selectionAnchor === null) this.selectionAnchor = this.cursor;
        this.cursor = newCur;
      } else {
        this.selectionAnchor = newCur;
        this.cursor = newCur;
        this._dragging = true;
      }
      this._blinkTimer = 0;
    }

    if (ev.type === "held" && this._dragging) {
      const innerX = this.x + 2 + Helpers.BUTTON_PADDING;
      const charW = Ports.GLYPH_W + 1;
      const relX = ev.localX - innerX;
      const charIdx = Math.round(relX / charW);
      this.cursor = Math.max(
        0,
        Math.min(this.text.length, this.scrollOffset + charIdx),
      );
      this._ensureCursorVisible();
      this._blinkTimer = 0;
    }

    if (ev.type === "up" && this._dragging) {
      this._dragging = false;
      if (this.selectionAnchor === this.cursor) this.selectionAnchor = null;
    }
  }

  /** @override — 文字入力, カーソル移動, 選択, コピペ */
  handleKey() {
    let changed = false;
    const chars = Ports.getCharQueue();
    const shift = Helpers.shiftHeld();

    // 文字入力
    for (const ch of chars) {
      if (this._getSelectionRange()) {
        this._deleteSelection();
        changed = true;
      }
      if (this.text.length < this.maxLength) {
        this.text =
          this.text.slice(0, this.cursor) + ch + this.text.slice(this.cursor);
        this.cursor++;
        changed = true;
      }
      this.selectionAnchor = null;
    }

    // Backspace
    if (Helpers.tickRepeat("Backspace", true)) {
      if (this._getSelectionRange()) {
        this._deleteSelection();
        changed = true;
      } else if (Helpers.ctrlHeld()) {
        const newCursor = this._findWordBoundaryLeft(this.cursor);
        if (newCursor < this.cursor) {
          this.text =
            this.text.slice(0, newCursor) + this.text.slice(this.cursor);
          this.cursor = newCursor;
          changed = true;
        }
      } else if (this.cursor > 0) {
        this.text =
          this.text.slice(0, this.cursor - 1) + this.text.slice(this.cursor);
        this.cursor--;
        changed = true;
      }
      this.selectionAnchor = null;
    }

    // Delete
    if (Helpers.tickRepeat("Delete", true)) {
      if (this._getSelectionRange()) {
        this._deleteSelection();
        changed = true;
      } else if (Helpers.ctrlHeld()) {
        const newCursor = this._findWordBoundaryRight(this.cursor);
        if (newCursor > this.cursor) {
          this.text =
            this.text.slice(0, this.cursor) + this.text.slice(newCursor);
          changed = true;
        }
      } else if (this.cursor < this.text.length) {
        this.text =
          this.text.slice(0, this.cursor) + this.text.slice(this.cursor + 1);
        changed = true;
      }
      this.selectionAnchor = null;
    }

    // ← カーソル移動
    if (Helpers.tickRepeat("ArrowLeft", true)) {
      const ctrl = Helpers.ctrlHeld();
      if (shift) {
        if (this.selectionAnchor === null) this.selectionAnchor = this.cursor;
        this.cursor = ctrl
          ? this._findWordBoundaryLeft(this.cursor)
          : Math.max(0, this.cursor - 1);
      } else {
        if (ctrl) {
          this.cursor = this._findWordBoundaryLeft(this.cursor);
        } else {
          const selection = this._getSelectionRange();
          if (selection) this.cursor = selection[0];
          else if (this.cursor > 0) this.cursor--;
        }
        this.selectionAnchor = null;
      }
    }

    // → カーソル移動
    if (Helpers.tickRepeat("ArrowRight", true)) {
      const ctrl = Helpers.ctrlHeld();
      if (shift) {
        if (this.selectionAnchor === null) this.selectionAnchor = this.cursor;
        this.cursor = ctrl
          ? this._findWordBoundaryRight(this.cursor)
          : Math.min(this.text.length, this.cursor + 1);
      } else {
        if (ctrl) {
          this.cursor = this._findWordBoundaryRight(this.cursor);
        } else {
          const selection = this._getSelectionRange();
          if (selection) this.cursor = selection[1];
          else if (this.cursor < this.text.length) this.cursor++;
        }
        this.selectionAnchor = null;
      }
    }

    // Home
    if (Helpers.tickRepeat("Home", false)) {
      if (shift) {
        if (this.selectionAnchor === null) this.selectionAnchor = this.cursor;
      } else this.selectionAnchor = null;
      this.cursor = 0;
    }

    // End
    if (Helpers.tickRepeat("End", false)) {
      if (shift) {
        if (this.selectionAnchor === null) this.selectionAnchor = this.cursor;
      } else this.selectionAnchor = null;
      this.cursor = this.text.length;
    }

    // Ctrl+A
    if (Ports.ctrlDown("KeyA")) {
      this.selectionAnchor = 0;
      this.cursor = this.text.length;
    }

    // Ctrl+C
    if (Ports.ctrlDown("KeyC")) {
      const selection = this._getSelectionRange();
      if (selection)
        Helpers.clipboardWrite(this.text.slice(selection[0], selection[1]));
    }

    // Ctrl+X
    if (Ports.ctrlDown("KeyX")) {
      const selection = this._getSelectionRange();
      if (selection) {
        Helpers.clipboardWrite(this.text.slice(selection[0], selection[1]));
        this._deleteSelection();
        this.selectionAnchor = null;
        changed = true;
      }
    }

    // Ctrl+V
    if (Ports.ctrlDown("KeyV")) {
      const paste = Ports.getPasteText();
      if (paste) {
        if (this._getSelectionRange()) {
          this._deleteSelection();
        }
        const flat = paste.replace(/[\r\n]/g, "");
        const room = this.maxLength - this.text.length;
        const ins = flat.slice(0, room);
        this.text =
          this.text.slice(0, this.cursor) + ins + this.text.slice(this.cursor);
        this.cursor += ins.length;
        this.selectionAnchor = null;
        changed = true;
      }
    }

    this._ensureCursorVisible();
    if (changed) {
      this._blinkTimer = 0;
      if (this.onChange) this.onChange(this.text);
    }
    return chars.length > 0 || changed;
  }
}

