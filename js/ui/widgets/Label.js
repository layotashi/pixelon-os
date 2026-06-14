/**
 * @module ui/widgets/Label
 * Label.js — 静的テキストラベル
 *
 * 入力を受け付けない表示専用ウィジェット。
 * テキストに "\n" を含む場合は複数行で描画される。
 */

import { Widget } from "../Widget.js";
import { drawText, GLYPH_H } from "../ports.js";
import { textWidth, LABEL_LINE_HEIGHT } from "../ui_helpers.js";

export class Label extends Widget {
  /**
   * @param {number} x コンテンツ領域内の X
   * @param {number} y コンテンツ領域内の Y
   * @param {string} text 表示テキスト ("\n" で改行)
   * @param {number} [color=1] 描画色 (0 or 1)
   */
  constructor(x, y, text, color = 1) {
    const lines = text.split("\n");
    const maxWidth = lines.length > 0
      ? Math.max(...lines.map((line) => textWidth(line)))
      : 0;
    const h =
      lines.length === 1
        ? GLYPH_H
        : (lines.length - 1) * LABEL_LINE_HEIGHT + GLYPH_H;
    super(x, y, maxWidth, h);
    this.text = text;
    this.color = color;
  }

  /** @override */
  remeasure() {
    const lines = this.text.split("\n");
    this.w = lines.length > 0
      ? Math.max(...lines.map((line) => textWidth(line)))
      : 0;
    this.h =
      lines.length === 1
        ? GLYPH_H
        : (lines.length - 1) * LABEL_LINE_HEIGHT + GLYPH_H;
  }

  /** @override */
  draw(contentRect) {
    const absX = contentRect.x + this.x;
    let absY = contentRect.y + this.y;
    const lines = this.text.split("\n");
    for (const line of lines) {
      if (line.length > 0) drawText(absX, absY, line, this.color);
      absY += LABEL_LINE_HEIGHT;
    }
  }
}

