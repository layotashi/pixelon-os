/**
 * @module ui/widgets/HSep
 * HSep.js — 水平セパレータ (HTML の <hr> 相当)
 */

import { Widget } from "../Widget.js";
import { hline } from "../ports.js";

export class HSep extends Widget {
  /**
   * @param {number} x コンテンツ領域内の X
   * @param {number} y コンテンツ領域内の Y
   * @param {number} w 幅 (px)
   */
  constructor(x, y, w) {
    super(x, y, w, 1);
  }

  /** @override */
  draw(contentRect) {
    const absX = contentRect.x + this.x;
    hline(absX, absX + this.w - 1, contentRect.y + this.y, 1);
  }
}

