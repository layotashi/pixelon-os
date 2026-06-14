/**
 * @module ui/widgets/NumberBox
 * NumberBox.js — 数値入力ボックス
 *
 * 上下ドラッグで値を増減。Shift+ドラッグで微調整。
 * ホイールで操作可能。ダブルクリックでデフォルト値にリセット。
 */

import { FocusableWidget } from "../FocusableWidget.js";
import { drawRoundRect, fillRect, drawText } from "../ports.js";
import {
  textWidth,
  BUTTON_PADDING,
  BUTTON_AUTO_HEIGHT,
  tickRepeat,
} from "../ui_helpers.js";

export class NumberBox extends FocusableWidget {
  /**
   * @param {number} x  コンテンツ領域内の X
   * @param {number} y  コンテンツ領域内の Y
   * @param {number} min 最小値
   * @param {number} max 最大値
   * @param {number} value 初期値
   * @param {number} step 増減ステップ
   * @param {function} [onChange] 値変更コールバック (newValue) => void
   * @param {object}   [opts]          オプション
   * @param {number}   [opts.digits]   表示桁数 (省略時は min/max から自動算出)
   * @param {string}   [opts.padChar]  パディング文字 (デフォルト "_")
   */
  constructor(x, y, min, max, value, step, onChange, opts) {
    const options = opts || {};
    const digits =
      options.digits != null
        ? options.digits
        : Math.max(String(min).length, String(max).length);
    const padChar = options.padChar != null ? options.padChar : "_";
    const w = textWidth("0".repeat(digits)) + BUTTON_PADDING * 2 + 4;
    super(x, y, w, BUTTON_AUTO_HEIGHT);
    this.min = min;
    this.max = max;
    this.value = Math.max(min, Math.min(max, value));
    this.defaultValue = this.value;
    this.step = step;
    this.digits = digits;
    this.padChar = padChar;
    this.dragging = false;
    /** @private */
    this.dragStartY = 0;
    /** @private */
    this.dragStartVal = 0;
    /** @private */
    this.dragShift = false;
    /** @private 整数モードか (step が整数) */
    this._isInt = Number.isInteger(step);
    /** 操作中の反転表示フレーム数 */
    this.activeFrames = 0;
    this.onChange = onChange || null;
  }

  /** @override */
  remeasure() {
    this.w = textWidth("0".repeat(this.digits)) + BUTTON_PADDING * 2 + 4;
    this.h = BUTTON_AUTO_HEIGHT;
  }

  /**
   * 値をクランプ・丸め・比較し、変化があればセット＋コールバックを呼ぶ。
   * @param {number} raw 設定したい生の値
   * @returns {boolean} 値が変化したら true
   * @private
   */
  _setValue(raw) {
    const clamped = Math.max(this.min, Math.min(this.max, raw));
    const newValue = this._isInt ? Math.round(clamped) : clamped;
    if (newValue === this.value) return false;
    this.value = newValue;
    if (this.onChange) this.onChange(newValue);
    return true;
  }

  /** @override */
  get cursorName() {
    return "drag-v";
  }

  /** @override */
  get isActive() {
    return this.dragging;
  }

  /** @override */
  resetDragState() {
    this.dragging = false;
  }

  /** @override */
  draw(contentRect) {
    const absX = contentRect.x + this.x;
    const absY = contentRect.y + this.y;

    drawRoundRect(absX, absY, this.w, this.h, 1, 1);

    // 操作中は反転表示
    const active = this.dragging || this.activeFrames > 0;
    if (this.activeFrames > 0) this.activeFrames--;

    // パディング付き右揃え文字列
    const valStr = String(this.value);
    const pad = this.padChar || "_";
    const digits = this.digits || valStr.length;
    const display =
      valStr.length < digits
        ? pad.repeat(digits - valStr.length) + valStr
        : valStr;

    const displayWidth = textWidth(display);
    const textX = absX + ((this.w - displayWidth) >> 1);
    const textY = absY + 2 + BUTTON_PADDING;

    if (active) {
      const fillX = absX + 2;
      const fillY = absY + 2;
      fillRect(fillX, fillY, this.w - 4, this.h - 4, 1);
      drawText(textX, textY, display, 0);
    } else {
      drawText(textX, textY, display, 1);
    }
  }

  /** @override */
  update(ev) {
    const hit = this.hitTest(ev.localX, ev.localY);

    if (ev.type === "down" && hit) {
      this.dragging = true;
      this.dragStartY = ev.localY;
      this.dragStartVal = this.value;
      this.dragShift = !!ev.shift;
    }

    if (this.dragging && ev.type === "held") {
      const dy = this.dragStartY - ev.localY;
      const fineScale = this.dragShift || ev.shift ? 0.1 : 1;
      const steps = ((dy / 2) | 0) * fineScale;
      this._setValue(this.dragStartVal + steps * this.step);
    }

    if (ev.type === "up") {
      this.dragging = false;
    }

    // ダブルクリック: デフォルト値にリセット
    if (ev.type === "dblclick" && hit) {
      this.dragging = false;
      if (this.defaultValue != null && this._setValue(this.defaultValue)) {
        this.activeFrames = 6;
      }
    }

    // ホイール: ホバー中の値を増減
    if (ev.type === "wheel" && hit) {
      const dir = ev.deltaY > 0 ? -1 : 1;
      if (this._setValue(this.value + dir * this.step)) {
        this.activeFrames = 6;
      }
      ev.consumed = true;
    }
  }

  /** @override — ↑↓ で step 単位増減 (リピート+加速) */
  handleKey() {
    let dir = 0;
    if (tickRepeat("ArrowUp", true)) dir = +1;
    else if (tickRepeat("ArrowDown", true)) dir = -1;
    if (dir !== 0) {
      if (this._setValue(this.value + dir * this.step)) {
        this.activeFrames = 6;
      }
      return true;
    }
    return false;
  }
}

