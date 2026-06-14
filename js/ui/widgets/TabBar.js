/**
 * @module ui/widgets/TabBar
 * TabBar.js — タブバーウィジェット
 *
 * 下線スタイルのタブ切替 UI。
 * アクティブタブは下線で示し、非選択タブはテキストのみ。
 *
 *   INST   PIANO_ROLL   ARRANGEMENT   MIXER
 *   ────
 *
 * FocusableWidget を継承した単一ウィジェットとして WidgetGroup に登録する。
 * RadioButton を内部に持たず、独自にタブ選択の排他制御を行う。
 */

import { FocusableWidget } from "../FocusableWidget.js";
import * as Ports from "../ports.js";
import { textWidth } from "../ui_helpers.js";

// ── SFX コールバック ──

/** @private グローバル SFX コールバック (タブ切替時) */
let _sfxOnChange = null;

/**
 * TabBar タブ切替時の SFX コールバックを設定する。
 * @param {function} fn コールバック
 */
export function tabBarSetSfxOnChange(fn) {
  _sfxOnChange = fn;
}

// ── 定数 ──

/** タブ間の間隔 (px) */
const TAB_GAP = 8;

/** テキストの上パディング (px) */
const TAB_PAD_TOP = 4;

/** テキストの下パディング (下線まで) (px) */
const TAB_PAD_BOTTOM = 3;

export class TabBar extends FocusableWidget {
  /**
   * @param {number} x コンテンツ領域内の X
   * @param {number} y コンテンツ領域内の Y
   * @param {string[]} labels タブラベル配列
   * @param {(index: number) => void} [onChange] タブ切替コールバック
   * @param {number} [initial=0] 初期アクティブインデックス
   */
  constructor(x, y, labels, onChange, initial = 0) {
    super(x, y, 0, 0);
    /** @type {string[]} */
    this.labels = labels;
    /** @type {((index: number) => void)|null} */
    this.onChange = onChange || null;
    /** @private */
    this._activeIndex = initial;
    /** @private @type {{ x: number, w: number }[]} 各タブの相対位置と幅 */
    this._tabs = [];
    this._recalc();
  }

  /** 現在のアクティブタブインデックス */
  get activeIndex() {
    return this._activeIndex;
  }

  /**
   * プログラマティックにタブを切り替える (コールバックは発火しない)。
   * @param {number} index タブインデックス
   */
  setActive(index) {
    if (index >= 0 && index < this.labels.length) {
      this._activeIndex = index;
    }
  }

  /** @override フォント変更時の再計測 */
  remeasure() {
    this._recalc();
  }

  /**
   * 各タブの位置・幅とウィジェット全体サイズを再計算する。
   * @private
   */
  _recalc() {
    this._tabs = [];
    let cx = 0;
    for (const label of this.labels) {
      const tw = textWidth(label);
      this._tabs.push({ x: cx, w: tw });
      cx += tw + TAB_GAP;
    }
    this.w = cx > 0 ? cx - TAB_GAP : 0;
    // テキスト上パディング + グリフ高さ + 下パディング + 下線 1px
    this.h = TAB_PAD_TOP + Ports.GLYPH_H + TAB_PAD_BOTTOM + 1;
  }

  /** @override */
  draw(contentRect) {
    const ax = contentRect.x + this.x;
    const ay = contentRect.y + this.y;
    const textY = ay + TAB_PAD_TOP;

    for (let i = 0; i < this.labels.length; i++) {
      const tab = this._tabs[i];
      // テキスト描画
      Ports.drawText(ax + tab.x, textY, this.labels[i], 1);

      // アクティブタブの下線
      if (i === this._activeIndex) {
        const uy = textY + Ports.GLYPH_H + TAB_PAD_BOTTOM;
        Ports.hline(ax + tab.x, ax + tab.x + tab.w - 1, uy, 1);
      }
    }
  }

  /** @override */
  update(ev) {
    if (ev.type === "down") {
      const lx = ev.localX - this.x;
      const ly = ev.localY - this.y;
      if (ly < 0 || ly >= this.h || lx < 0 || lx >= this.w) return;

      for (let i = 0; i < this._tabs.length; i++) {
        const tab = this._tabs[i];
        if (lx >= tab.x && lx < tab.x + tab.w) {
          if (i !== this._activeIndex) {
            this._activeIndex = i;
            if (_sfxOnChange) _sfxOnChange();
            if (this.onChange) this.onChange(i);
          }
          break;
        }
      }
    }
  }
}

