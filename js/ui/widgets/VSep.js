/**
 * @module ui/widgets/VSep
 * VSep.js — 垂直セパレータ (カラム間の区切り)
 */

import { Widget } from "../Widget.js";
import { vline } from "../ports.js";

export class VSep extends Widget {
  /**
   * @param {number} x コンテンツ領域内の X
   * @param {number} y コンテンツ領域内の Y
   * @param {number} h 高さ (px)
   */
  constructor(x, y, h) {
    super(x, y, 1, h);
  }

  /** @override */
  draw(contentRect) {
    const absY = contentRect.y + this.y;
    vline(contentRect.x + this.x, absY, absY + this.h - 1, 1);
  }
}

