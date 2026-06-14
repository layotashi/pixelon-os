/**
 * @module ui/FocusableWidget
 * FocusableWidget.js — フォーカス可能ウィジェットの基底クラス
 *
 * キーボードフォーカスを受け取る全ウィジェットの基底。
 * ButtonBase, Slider, NumberBox, DropDown, ListBox, TreeView,
 * BayerPicker, TextBox, TextArea がこれを継承する。
 *
 * サブクラスは handleKey() をオーバーライドして
 * フォーカス中のキーボード操作を実装する。
 */

import { Widget } from "./Widget.js";

export class FocusableWidget extends Widget {
  /**
   * @param {number} x コンテンツ領域内の X 座標
   * @param {number} y コンテンツ領域内の Y 座標
   * @param {number} w 幅 (px)
   * @param {number} h 高さ (px)
   */
  constructor(x, y, w, h) {
    super(x, y, w, h);
  }

  /** フォーカス可能 */
  get focusable() {
    return true;
  }

  /** デフォルトカーソル (サブクラスでオーバーライド可) */
  get cursorName() {
    return "pointer";
  }

  /**
   * フォーカス中のキーボード入力を処理する。
   * キーを消費したら true を返す。
   * @returns {boolean}
   */
  handleKey() {
    return false;
  }
}

