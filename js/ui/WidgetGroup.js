/**
 * @module ui/WidgetGroup
 * WidgetGroup.js — ウィジェットグループ (旧 drawWidgets / updateWidgets の代替)
 *
 * Widget インスタンスの配列を保持し、描画・入力処理・フォーカス管理・
 * ラジオグループの排他制御・ポップアップキュー登録を一括で行う。
 *
 * 使用例:
 *   const group = new WidgetGroup([
 *     new PushButton(0, 0, "Run", () => {}),
 *     new Label(0, 20, "Status:"),
 *   ]);
 *   // draw コールバック内で:
 *   group.draw(contentRect);
 *   // input コールバック内で:
 *   group.update(ev);
 *   // ウィンドウサイズ計算:
 *   const size = group.measure();
 *
 * グローバルステート (フォーカス, WM コールバック, ポップアップキュー) は
 * ui_helpers.js のモジュール変数を通じて全 WidgetGroup で共有される。
 * kernel.js → WidgetGroup.setWmCallbacks() で注入する。
 *
 * 描画・入力ポートは ports.js 経由で間接参照する (DI)。
 * ホスト側は index.js の initPorts() でコア実装を注入する。
 */

import * as Ports from "./ports.js";
import { measureWidgets } from "./layout.js";
import { FOCUS_MARGIN } from "./ui_constants.js";
import * as Helpers from "./ui_helpers.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Private helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * フォーカスインジケータ (四隅カギ括弧) を描画する。
 * @param {import("./Widget.js").Widget} widget  対象ウィジェット
 * @param {{ x:number, y:number }} contentRect       コンテンツ領域
 */
function _drawFocusBrackets(widget, contentRect) {
  const absX = contentRect.x + widget.x;
  const absY = contentRect.y + widget.y;
  const armLength = 3; // カギ括弧の腕の長さ
  // ウィジェット外側へのオフセット。
  // この値が MIN_GAP (= FOCUS_MARGIN * 2) の片側分に対応する。
  // FOCUS_MARGIN を変更した場合でもレイアウトとの不変条件が維持される。
  const outerGap = FOCUS_MARGIN;
  const x0 = absX - outerGap;
  const y0 = absY - outerGap;
  const x1 = absX + widget.w - 1 + outerGap;
  const y1 = absY + widget.h - 1 + outerGap;
  // ┌ 左上
  Ports.hline(x0, x0 + armLength - 1, y0, 1);
  Ports.vline(x0, y0, y0 + armLength - 1, 1);
  // ┐ 右上
  Ports.hline(x1 - armLength + 1, x1, y0, 1);
  Ports.vline(x1, y0, y0 + armLength - 1, 1);
  // └ 左下
  Ports.hline(x0, x0 + armLength - 1, y1, 1);
  Ports.vline(x0, y1 - armLength + 1, y1, 1);
  // ┘ 右下
  Ports.hline(x1 - armLength + 1, x1, y1, 1);
  Ports.vline(x1, y1 - armLength + 1, y1, 1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WidgetGroup クラス
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class WidgetGroup {
  /**
   * @param {import("./Widget.js").Widget[]} [widgets] 管理するウィジェット配列
   */
  constructor(widgets = []) {
    /** @type {import("./Widget.js").Widget[]} */
    this.widgets = widgets;
  }

  /**
   * ウィジェットをグループに追加する。
   * @param {import("./Widget.js").Widget} widget
   * @returns {import("./Widget.js").Widget} 追加されたウィジェット (チェイン用)
   */
  add(widget) {
    this.widgets.push(widget);
    return widget;
  }

  // ━━ 描画 ━━━━━━━━━━━━━━━━━━━━━━

  /**
   * グループ内の全ウィジェットを描画する。
   * ドロップダウンのポップアップはキューに登録し、
   * WidgetGroup.flushPopups() で全ウィンドウ描画後にまとめて描画される。
   *
   * @param {{ x:number, y:number }} contentRect コンテンツ領域のオフセット
   */
  draw(contentRect) {
    // パス 1: 全ウィジェットの通常描画
    for (const w of this.widgets) {
      if (w.visible !== false) w.draw(contentRect);
    }

    // パス 2: フォーカスインジケータ (四隅カギ括弧)
    const focused = Helpers.getFocused();
    if (focused && this.widgets.includes(focused)) {
      _drawFocusBrackets(focused, contentRect);
    }

    // パス 3: 展開中ドロップダウンのポップアップをキューに登録
    for (const w of this.widgets) {
      if (w.hasPopup && w.open) {
        Helpers.pushPopup({
          dd: w,
          ax: contentRect.x + w.x,
          ay: contentRect.y + w.y + w.h + 1,
        });
      }
    }
  }

  // ━━ 入力処理 ━━━━━━━━━━━━━━━━━━

  /**
   * グループ内の全ウィジェットに入力イベントを配信する。
   * フォーカス管理・ドラッグリセット・ラジオ排他制御も行う。
   *
   * @param {{ localX:number, localY:number, type:string }} ev 入力イベント
   */
  update(ev) {
    const widgets = this.widgets;

    // ── 展開中のドロップダウンが入力を独占 ──
    Helpers.setPopupActive(false);
    for (const w of widgets) {
      if (w.hasPopup && w.open) {
        Helpers.setPopupActive(true);
        w.update(ev);
        return;
      }
    }

    // ── down/mdown 時: 前フレームで残ったドラッグ状態を全リセット ──
    if (ev.type === "down" || ev.type === "mdown") {
      for (const w of widgets) {
        w.resetDragState();
      }
    }

    // ── フォーカス管理: クリック/ホイール/中ボタンでフォーカス更新 ──
    if (ev.type === "down" || ev.type === "wheel" || ev.type === "mdown") {
      let hitFocusable = null;
      for (const w of widgets) {
        if (w.visible === false) continue;
        if (!w.focusable) continue;
        if (w.hitTest(ev.localX, ev.localY)) {
          hitFocusable = w;
          break;
        }
      }
      if (hitFocusable && Helpers.getFocused() !== hitFocusable) {
        Helpers.setFocused(hitFocusable); // 内部で旧フォーカスの clearSelection も行う
      } else if ((ev.type === "down" || ev.type === "mdown") && !hitFocusable) {
        Helpers.clearFocus();
        Helpers.resetRepeatKey();
      }
    }

    // ── フォーカス中のキーボード処理 ──
    const focused = Helpers.getFocused();
    if (focused && widgets.includes(focused)) {
      // Escape: フォーカス解除
      if (Ports.keyDown("Escape")) {
        Helpers.clearFocus();
      } else {
        focused.handleKey();
      }
    }

    // radio: 更新前の value をスナップショット (up 時のみ)
    const prevVal = ev.type === "up" ? widgets.map((w) => w.value) : null;

    // ── 全ウィジェットを更新 ──
    for (const w of widgets) {
      if (w.visible !== false) w.update(ev);
    }

    // ── カーソル: ドラッグ/プレス中はウィジェットのカーソルを維持 ──
    if (ev.type === "held") {
      for (const w of widgets) {
        if (w.visible === false || !w.cursorName) continue;
        if (w.isActive) {
          Helpers.wmRequestCursor(w.cursorName);
          break;
        }
      }
    }

    // ── ツールチップ & カーソル: hover/down 時 ──
    if (ev.type === "hover" || ev.type === "down") {
      for (const w of widgets) {
        if (w.visible === false) continue;
        if (w.hitTest(ev.localX, ev.localY)) {
          // onItemTooltip を持つコンテナ型はアイテム別に自前発火するので
          // ウィジェット全体の tooltip はフォールバックしない
          if (ev.type === "hover" && w.tooltip && !w.onItemTooltip) {
            Helpers.wmSetTooltip(w.tooltip);
          }
          if (w.cursorName) Helpers.wmRequestCursor(w.cursorName);
          break;
        }
      }
    }

    // ── radio グループの排他制御 ──
    if (ev.type === "up" && prevVal) {
      /** @type {Map<string, import("./Widget.js").Widget>} */
      const newlyOn = new Map();
      for (let i = 0; i < widgets.length; i++) {
        const w = widgets[i];
        // RadioButton のみ group プロパティ (non-null string) を持つ
        if (w.group && w.value && !prevVal[i]) {
          newlyOn.set(w.group, w);
        }
      }
      for (const [group, winner] of newlyOn) {
        for (const w of widgets) {
          if (w.group === group && w !== winner) {
            w.value = false;
          }
        }
      }
    }
  }

  // ━━ サイズ計測 ━━━━━━━━━━━━━━━━━

  /**
   * 全ウィジェットの remeasure() を呼び、w/h を現在のフォント/アイコンサイズに更新する。
   * フォント変更後、layout() を再実行する前に呼ぶこと。
   */
  remeasureAll() {
    for (const w of this.widgets) {
      w.remeasure();
    }
  }

  /**
   * 全ウィジェットのバウンディングボックスから必要サイズを算出する。
   * @param {number} [pad=0] 追加パディング
   * @returns {{ w: number, h: number }}
   */
  measure(pad = 0) {
    return measureWidgets(this.widgets, pad);
  }

  // ━━ 静的メソッド (グローバルステート操作) ━━━━━━━━━━

  /**
   * WM からのコールバックを注入する。kernel.js の初期化時に呼ぶ。
   * @param {{ setTooltip: function, requestCursor: function }} cbs
   */
  static setWmCallbacks(cbs) {
    Helpers.setWmCallbacks(cbs);
  }

  /** 現在フォーカス中のウィジェットを返す */
  static getFocused() {
    return Helpers.getFocused();
  }

  /** フォーカスを解除する */
  static clearFocus() {
    Helpers.clearFocus();
  }

  /**
   * ポップアップキューを描画・クリアする。
   * wmDraw() の全ウィンドウ描画後に呼ぶ。
   */
  static flushPopups() {
    Helpers.flushPopups();
  }

  /**
   * 現在ポップアップが開いているかを返す。
   * wm.js がボディ外でもイベントを伝播するか判定するために使う。
   */
  static hasOpenPopup() {
    return Helpers.hasOpenPopup();
  }

  /** テキスト入力系ウィジェットにフォーカスがあるかを返す */
  static hasTextInputFocus() {
    return Helpers.hasTextInputFocus();
  }
}

