/**
 * @module ui/widgets/Slider
 * Slider.js — 水平スライダー
 *
 * ドラッグで数値を操作する。Shift+ドラッグで微調整。
 * ホイールで増減、ダブルクリックでデフォルト値にリセット。
 */

import { FocusableWidget } from "../FocusableWidget.js";
import { drawRoundRect, fillRect } from "../ports.js";
import { BUTTON_AUTO_HEIGHT, tickRepeat } from "../ui_helpers.js";

/** スライダー高さ (px): ボーダー1 + 余白2 + バー3 + 余白2 + ボーダー1 */
const SLIDER_HEIGHT = 9;

export class Slider extends FocusableWidget {
  /**
   * @param {number} x  コンテンツ領域内の X
   * @param {number} y  コンテンツ領域内の Y
   * @param {number} w  幅 (px)
   * @param {number} min 最小値
   * @param {number} max 最大値
   * @param {number} value 初期値
   * @param {function} [onChange] 値変更コールバック (newValue) => void
   */
  constructor(x, y, w, min, max, value, onChange) {
    super(x, y, w, BUTTON_AUTO_HEIGHT);
    this.min = min;
    this.max = max;
    this.value = Math.max(min, Math.min(max, value));
    this.defaultValue = this.value;
    this.dragging = false;
    this.onChange = onChange || null;
    /** @type {number|null} ホイール操作のステップ量 (null=自動) */
    this.wheelStep = null;
    /** @private 整数モードか (min/max がともに整数) */
    this._isInt = Number.isInteger(min) && Number.isInteger(max);
    /** @private */
    this.dragShift = false;
    /** @private */
    this.dragStartX = 0;
    /** @private */
    this.dragStartVal = 0;
  }

  /** @override — h のみ更新 (w はアプリが指定するため不変) */
  remeasure() {
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
    const v = this._isInt ? Math.round(clamped) : clamped;
    if (v === this.value) return false;
    this.value = v;
    if (this.onChange) this.onChange(v);
    return true;
  }

  /** @override */
  get cursorName() {
    return "drag-h";
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
    const absY = contentRect.y + this.y + ((this.h - SLIDER_HEIGHT) >> 1);

    drawRoundRect(absX, absY, this.w, SLIDER_HEIGHT, 1, 1);

    const trackX0 = absX + 2;
    const trackLen = this.w - 4;
    if (trackLen <= 0) return;
    const ratio = (this.value - this.min) / (this.max - this.min);
    const fillLen = (trackLen * ratio) | 0;
    if (fillLen > 0) {
      fillRect(trackX0, absY + 2, fillLen, 5, 1);
    }
  }

  /** @override */
  update(ev) {
    const hit = this.hitTest(ev.localX, ev.localY);

    if (ev.type === "down" && hit) {
      this.dragging = true;
      this.dragShift = !!ev.shift;
      this.dragStartX = ev.localX;
      this.dragStartVal = this.value;
    }

    if (this.dragging && (ev.type === "down" || ev.type === "held")) {
      if (this.dragShift || ev.shift) {
        // Shift+ドラッグ: 微調整
        const dx = ev.localX - this.dragStartX;
        const pxPerStep = 4;
        const step = this._isInt
          ? 1 / pxPerStep
          : (this.max - this.min) / ((this.w - 4) * 10);
        this._setValue(this.dragStartVal + dx * step);
      } else {
        // 通常ドラッグ: トラック内側の X から値を算出
        const trackX0 = this.x + 2;
        const trackLen = this.w - 4;
        if (trackLen <= 0) return;
        const ratio = Math.max(
          0,
          Math.min(1, (ev.localX - trackX0) / trackLen),
        );
        this._setValue(this.min + ratio * (this.max - this.min));
      }
    }

    if (ev.type === "up") {
      this.dragging = false;
    }

    // ダブルクリック: デフォルト値にリセット
    if (ev.type === "dblclick" && hit) {
      this.dragging = false;
      if (this.defaultValue != null) {
        this._setValue(this.defaultValue);
      }
    }

    // ホイール: ホバー中のスライダーの値を增減
    if (ev.type === "wheel" && hit) {
      const range = this.max - this.min;
      const step =
        this.wheelStep != null
          ? this.wheelStep
          : this._isInt
            ? Math.max(1, (range * 0.05) | 0)
            : range * 0.05;
      const dir = ev.deltaY > 0 ? -1 : 1;
      this._setValue(this.value + dir * step);
      ev.consumed = true;
    }
  }

  /** @override — ←→ で最小ステップ増減 (リピート+加速) */
  handleKey() {
    let dir = 0;
    if (tickRepeat("ArrowLeft", true)) dir = -1;
    else if (tickRepeat("ArrowRight", true)) dir = +1;
    if (dir !== 0) {
      const step = this._isInt ? 1 : (this.max - this.min) / this.w;
      this._setValue(this.value + dir * step);
      return true;
    }
    return false;
  }
}

