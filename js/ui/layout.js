/**
 * @module ui/layout
 * layout.js — UI レイアウトエンジン
 *
 * Box コンテナ (HBox / VBox) による宣言的レイアウトを提供する。
 * 子要素を水平・垂直に配置し、交差軸の整列を自動で行う。
 * 任意深度のネスト (VBox > HBox > VBox …) に対応する。
 *
 * visible === false の Box 子要素は配置・サイズ計算から除外されるだけでなく、
 * layout() 時に配下の全リーフウィジェットの visible も false に設定される。
 * これにより WidgetGroup.draw() / update() からも確実に非表示となる。
 *
 * ━━ gap の不変条件 ━━
 * フォーカスブラケット (_drawFocusBrackets) は各ウィジェットの外側に
 * FOCUS_MARGIN px 張り出して描画される。隣接ウィジェットのブラケットが
 * 重ならないために、gap >= FOCUS_MARGIN * 2 (= MIN_GAP) である必要がある。
 * Box コンストラクタで gap を MIN_GAP 未満に指定しても MIN_GAP にクランプされる。
 */

import { FOCUS_MARGIN, GAP, MIN_GAP } from "./ui_constants.js";

/** @typedef {import('./Widget.js').Widget} Widget */

/**
 * ウィジェット配列の境界ボックスから必要なコンテンツサイズを算出する。
 * フォーカスブラケットの外側マージンを含む。
 * @param {Widget[]} widgets  ウィジェット配列
 * @param {number} [pad=0]  追加の右・下余白 (px)
 * @returns {{ w:number, h:number }}  必要なコンテンツ領域サイズ
 */
export function measureWidgets(widgets, pad = 0) {
  let maxR = 0;
  let maxB = 0;
  for (const w of widgets) {
    if (w.visible === false) continue;
    const r = w.x + w.w;
    const b = w.y + w.h;
    if (r > maxR) maxR = r;
    if (b > maxB) maxB = b;
  }
  return {
    w: maxR + pad + FOCUS_MARGIN,
    h: maxB + pad + FOCUS_MARGIN,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Box レイアウトコンテナ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Box — 子要素を一方向に配置するレイアウトコンテナ。
 *
 * HBox / VBox ファクトリ関数経由で生成する。
 * Widget ではなくレイアウト記述子として機能し、子の x, y を再帰的にセットする。
 *
 * - HBox: 子を左→右に配置。交差軸 (垂直) は中央揃え。リーフ子要素の h をコンテナ高に stretch。
 * - VBox: 子を上→下に配置。交差軸 (水平) はリーフ子要素の w をコンテナ幅に stretch。
 * - 任意深度のネスト可能 (VBox > HBox > VBox …)
 * - visible === false の子は配置・サイズ計算から除外される
 *
 * 使用例:
 *   const root = VBox([
 *     HBox([label, dropdown]),
 *     HBox([button1, button2]),
 *     slider,
 *   ]);
 *   root.layout(FOCUS_MARGIN, FOCUS_MARGIN);
 *   const group = new WidgetGroup(root.leaves());
 *   // onMeasure: () => root.measure()
 */
export class Box {
  /**
   * @param {'h'|'v'} dir  配置方向 ('h' = 水平, 'v' = 垂直)
   * @param {number} gap   子要素間の間隔 (px)
   * @param {Array<Widget|Box>} children  子要素
   */
  constructor(dir, gap, children) {
    /** @type {'h'|'v'} */
    this.dir = dir;
    /** @type {number} gap は MIN_GAP 以上にクランプされる */
    this.gap = Math.max(gap, MIN_GAP);
    /** @type {Array<Widget|Box>} */
    this.children = children;
    /** @type {boolean} */
    this.visible = true;
    /** @type {number} layout() で設定される配置 X */
    this.x = 0;
    /** @type {number} layout() で設定される配置 Y */
    this.y = 0;
  }

  /**
   * visible な子要素のみ返す (内部ヘルパー)。
   * @returns {Array<Widget|Box>}
   */
  _vis() {
    return this.children.filter((c) => c.visible !== false);
  }

  /**
   * 幅を算出する (子のサイズから再帰的に計算)。
   * HBox: 子幅の合計 + gap × (n-1)
   * VBox: 子幅の最大値
   */
  get w() {
    const vis = this._vis();
    if (vis.length === 0) return 0;
    if (this.dir === "h") {
      return vis.reduce((s, c) => s + c.w, 0) + this.gap * (vis.length - 1);
    }
    return Math.max(...vis.map((c) => c.w));
  }

  /**
   * 高さを算出する (子のサイズから再帰的に計算)。
   * HBox: 子高さの最大値
   * VBox: 子高さの合計 + gap × (n-1)
   */
  get h() {
    const vis = this._vis();
    if (vis.length === 0) return 0;
    if (this.dir === "v") {
      return vis.reduce((s, c) => s + c.h, 0) + this.gap * (vis.length - 1);
    }
    return Math.max(...vis.map((c) => c.h));
  }

  /**
   * 子要素を再帰的に配置する。
   * HBox: 左→右、垂直中央揃え。
   * VBox: 上→下、左揃え。
   *
   * visible === false の Box 子要素については、配下の全リーフウィジェットの
   * visible を false に設定し、WidgetGroup.draw() からも確実に非表示にする。
   * 逆に visible な Box 子要素はリーフを true に復元してからレイアウトする。
   *
   * @param {number} [x=0]  配置開始 X
   * @param {number} [y=0]  配置開始 Y
   */
  layout(x = 0, y = 0) {
    this.x = x;
    this.y = y;

    // ── Box 子のリーフ可視性を「今の Box 可視性」と同期する ──
    // 表示 Box  → リーフを表示状態へ復元 (前回 hidden で隠れていた場合に復活させる)
    // 非表示 Box → リーフを非表示 (WidgetGroup.draw からも確実に隠す)
    //
    // この処理を maxW / maxH の計算より前に行うことが重要。
    // 前回 hidden だった Box が今回 visible になる場合、リーフが
    // visible=false のまま残っているとその Box の HBox.w / VBox.h が 0 に
    // 縮退し、後段の maxW が過小評価される。
    // (例: DISPLAY_TUNING で Pixel Grid を OFF→ON すると、
    //      復活した HBox の幅が 0 として計算され、HSep が縮んでいた。)
    for (const c of this.children) {
      if (c instanceof Box) {
        c._setLeavesVisible(c.visible !== false);
      }
    }

    const vis = this._vis();
    if (vis.length === 0) return;

    if (this.dir === "h") {
      // ── リーフの交差軸を自然値に復元 (自己参照防止) ──
      for (const c of vis) {
        if (!(c instanceof Box) && "_stretchedH" in c) {
          if (c.h === c._stretchedH) c.h = c._preStretchH;
        }
      }
      const maxH = this.h;
      let cx = x;
      for (const c of vis) {
        if (c instanceof Box) {
          const cy = y + ((maxH - c.h) >> 1);
          c.layout(cx, cy);
        } else {
          c._preStretchH = c.h;
          c.x = cx;
          c.y = y + ((maxH - c.h) >> 1); // vertical center
          c.h = maxH; // cross-axis stretch
          c._stretchedH = maxH;
        }
        cx += c.w + this.gap;
      }
    } else {
      // ── リーフの交差軸を自然値に復元 (自己参照防止) ──
      for (const c of vis) {
        if (!(c instanceof Box) && "_stretchedW" in c) {
          if (c.w === c._stretchedW) c.w = c._preStretchW;
        }
      }
      const maxW = this.w;
      let cy = y;
      for (const c of vis) {
        if (c instanceof Box) {
          c.layout(x, cy);
        } else {
          c._preStretchW = c.w;
          c.x = x;
          c.y = cy;
          c.w = maxW; // cross-axis stretch
          c._stretchedW = maxW;
        }
        cy += c.h + this.gap;
      }
    }
  }

  /**
   * 全子孫リーフウィジェットの visible を一括設定する (内部ヘルパー)。
   * layout() から呼ばれ、非表示コンテナ内のウィジェットを
   * WidgetGroup.draw() / update() からも確実に隠す。
   *
   * v = true で呼ばれた場合でも、ネストした非表示 Box の配下リーフは
   * 引き続き非表示のままにする (可視性カスケードの整合性)。
   * @param {boolean} v
   */
  _setLeavesVisible(v) {
    for (const c of this.children) {
      if (c instanceof Box) {
        // ネスト Box の可視性 AND 引数 v を伝播。
        // 非表示 Box の中身が一瞬でも可視化される副作用を防ぐ。
        c._setLeavesVisible(v && c.visible !== false);
      } else {
        c.visible = v;
      }
    }
  }

  /**
   * 全リーフウィジェットを平坦な配列で返す (WidgetGroup 用)。
   * Box 自身はスキップし、Widget のみを収集する。
   * @returns {Widget[]}
   */
  leaves() {
    const result = [];
    for (const c of this.children) {
      if (c instanceof Box) {
        result.push(...c.leaves());
      } else {
        result.push(c);
      }
    }
    return result;
  }

  /**
   * レイアウト後のバウンディングボックスから必要なコンテンツサイズを算出する。
   * フォーカスマージンを含む。layout() 呼び出し後に使用すること。
   * @param {number} [pad=0]  追加余白 (px)
   * @returns {{ w: number, h: number }}
   */
  measure(pad = 0) {
    return {
      w: this.x + this.w + pad + FOCUS_MARGIN,
      h: this.y + this.h + pad + FOCUS_MARGIN,
    };
  }
}

/**
 * 子要素を左→右に配置する HBox を生成する。
 * 交差軸 (垂直) は中央揃え + stretch (リーフ子要素の h をコンテナ高に拡張)。
 * @param {Array<Widget|Box>} children  子要素
 * @param {number} [gap=GAP]  子要素間の間隔 (px)
 * @returns {Box}
 */
export function HBox(children, gap = GAP) {
  return new Box("h", gap, children);
}

/**
 * 子要素を上→下に配置する VBox を生成する。
 * 交差軸 (水平) は stretch (リーフ子要素の w をコンテナ幅に拡張)。
 * @param {Array<Widget|Box>} children  子要素
 * @param {number} [gap=GAP]  子要素間の間隔 (px)
 * @returns {Box}
 */
export function VBox(children, gap = GAP) {
  return new Box("v", gap, children);
}

