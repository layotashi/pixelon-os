/**
 * @module ui/widgets/Label
 * Label.js — 静的テキストラベル
 *
 * 入力を受け付けない表示専用ウィジェット。
 * テキストに "\n" を含む場合は複数行で描画される。
 *
 * text プロパティはセッターでカプセル化されており、代入時に w/h が自動再計算される
 * (派生状態の不変条件を機械的に維持)。
 *
 * inverted = true で「反転表示」(前景色で塗った矩形の上に背景色テキスト) になり、
 * 1-bit でも強い強調・階層 (CRAP の Contrast) を作れる。padX/padY はその際テキストが
 * 縁に密着しないための内側余白で、w/h に算入される (既定 0 → 素のラベルは従来と同一)。
 * 描画は色番号ではなくレベル 0/1 で行うため、反転はテーマの fg/bg に自動追従する。
 */

import { Widget } from "../Widget.js";
import { drawText, fillRect, GLYPH_H } from "../ports.js";
import { textWidth, LABEL_LINE_HEIGHT } from "../ui_helpers.js";

export class Label extends Widget {
  /**
   * @param {number} x コンテンツ領域内の X
   * @param {number} y コンテンツ領域内の Y
   * @param {string} text 表示テキスト ("\n" で改行)
   * @param {number} [color=1] 描画色 (0 or 1)
   */
  constructor(x, y, text, color = 1) {
    super(x, y, 0, 0); // w/h は _recomputeSize で確定
    /** @private */
    this._text = text;
    this.color = color;
    /** @type {boolean} 反転 (前景塗り + 背景色テキスト) で強調表示するか */
    this.inverted = false;
    /** @private 反転帯のテキスト内側余白 (px)。w/h に算入される */
    this._padX = 0;
    this._padY = 0;
    this._recomputeSize();
  }

  get text() {
    return this._text;
  }

  set text(v) {
    this._text = v;
    this._recomputeSize();
  }

  get padX() {
    return this._padX;
  }

  set padX(v) {
    this._padX = v;
    this._recomputeSize();
  }

  get padY() {
    return this._padY;
  }

  set padY(v) {
    this._padY = v;
    this._recomputeSize();
  }

  /** @private text + 余白から w/h を再計算 */
  _recomputeSize() {
    const lines = this._text.split("\n");
    const textW =
      lines.length > 0 ? Math.max(...lines.map((line) => textWidth(line))) : 0;
    const textH =
      lines.length <= 1
        ? GLYPH_H
        : (lines.length - 1) * LABEL_LINE_HEIGHT + GLYPH_H;
    this.w = textW + this._padX * 2;
    this.h = textH + this._padY * 2;
  }

  /** @override — フォント切替時に外部から呼ばれる */
  remeasure() {
    this._recomputeSize();
  }

  /** @override */
  draw(contentRect) {
    const absX = contentRect.x + this.x;
    const absY = contentRect.y + this.y;
    // 反転: 前景レベル(1)で矩形を塗り、背景レベル(0)でテキストを描く。
    // VBox で全幅に stretch された場合は this.w 全体が帯になる (タイトルバー風)。
    if (this.inverted) fillRect(absX, absY, this.w, this.h, 1);
    const textColor = this.inverted ? 0 : this.color;
    let ty = absY + this._padY;
    const lines = this._text.split("\n");
    for (const line of lines) {
      if (line.length > 0) drawText(absX + this._padX, ty, line, textColor);
      ty += LABEL_LINE_HEIGHT;
    }
  }
}
