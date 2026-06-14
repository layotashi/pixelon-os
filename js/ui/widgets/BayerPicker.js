/**
 * @module ui/widgets/BayerPicker
 * BayerPicker.js — ベイヤーパターン選択ピッカー
 *
 * 4×4 (0–16) または 8×8 (0–64) の Bayer ディザレベルを
 * グリッド UI で選択できる。
 */

import { FocusableWidget } from "../FocusableWidget.js";
import * as Ports from "../ports.js";

/** セル外寸 (px) */
const BAYER_CELL_SIZE = 14;
/** セル間ギャップ (px) */
const BAYER_CELL_GAP = 1;

/**
 * モード別パラメータ (matrix を除く)。
 * BAYER_4x4 / BAYER_8x8 は ports.js の live binding であり、
 * モジュール評価時にはまだ undefined のため、ここには含めない。
 * matrix は _getModeParams() で遅延取得する。
 */
const BAYER_MODES = {
  "4x4": { levels: 17, cols: 4, size: 4 },
  "8x8": { levels: 65, cols: 8, size: 8 },
};

/** モードから w/h を算出する */
function calcBayerPickerSize(mode) {
  const p = BAYER_MODES[mode] || BAYER_MODES["4x4"];
  const cols = p.cols;
  const rows = Math.ceil(p.levels / cols);
  return {
    w: cols * (BAYER_CELL_SIZE + BAYER_CELL_GAP) - BAYER_CELL_GAP,
    h: rows * (BAYER_CELL_SIZE + BAYER_CELL_GAP) - BAYER_CELL_GAP,
  };
}

export class BayerPicker extends FocusableWidget {
  /**
   * @param {number}   x     コンテンツ領域内の X
   * @param {number}   y     コンテンツ領域内の Y
   * @param {number}   value 初期レベル (4x4: 0–16, 8x8: 0–64)
   * @param {function} [onChange] レベル変更コールバック (newLevel) => void
   * @param {object}   [opts]
   * @param {"4x4"|"8x8"} [opts.mode="4x4"] Bayer 行列モード
   */
  constructor(x, y, value, onChange, opts) {
    const mode = (opts && opts.mode) || "4x4";
    const params = BAYER_MODES[mode] || BAYER_MODES["4x4"];
    const { w, h } = calcBayerPickerSize(mode);
    const maxValue = params.levels - 1;
    super(x, y, w, h);
    /** @type {"4x4"|"8x8"} 現在のモード */
    this.mode = mode;
    this.value = Math.max(0, Math.min(maxValue, value | 0));
    this.onChange = onChange || null;
  }

  /** モード別パラメータ (matrix を含むフルセット) */
  _getModeParams() {
    const base = BAYER_MODES[this.mode] || BAYER_MODES["4x4"];
    return {
      ...base,
      matrix: this.mode === "8x8" ? Ports.BAYER_8x8 : Ports.BAYER_4x4,
    };
  }

  /**
   * モードを切り替える。
   * w/h を再計算し、value をクランプする。
   * @param {"4x4"|"8x8"} mode 新しいモード
   */
  setMode(mode) {
    if (!BAYER_MODES[mode] || this.mode === mode) return;
    this.mode = mode;
    const params = BAYER_MODES[mode];
    const { w, h } = calcBayerPickerSize(mode);
    this.w = w;
    this.h = h;
    const maxValue = params.levels - 1;
    this.value = Math.max(0, Math.min(maxValue, this.value));
  }

  /** @override */
  draw(contentRect) {
    const absX = contentRect.x + this.x;
    const absY = contentRect.y + this.y;
    const params = this._getModeParams();

    for (let i = 0; i < params.levels; i++) {
      const col = i % params.cols;
      const row = (i / params.cols) | 0;
      const cellX = absX + col * (BAYER_CELL_SIZE + BAYER_CELL_GAP);
      const cellY = absY + row * (BAYER_CELL_SIZE + BAYER_CELL_GAP);
      const isSelected = i === this.value;

      Ports.drawRoundRect(cellX, cellY, BAYER_CELL_SIZE, BAYER_CELL_SIZE, 1, 1);

      // 選択セル: 内側にもう 1 周
      if (isSelected) {
        Ports.drawRect(
          cellX + 1,
          cellY + 1,
          BAYER_CELL_SIZE - 2,
          BAYER_CELL_SIZE - 2,
          1,
        );
      }

      // Bayer パターンプレビュー
      const previewX = cellX + 3;
      const previewY = cellY + 3;
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          Ports.pset(
            previewX + dx,
            previewY + dy,
            params.matrix[dy % params.size][dx % params.size] < i ? 1 : 0,
          );
        }
      }
    }
  }

  /** @override */
  update(ev) {
    const params = this._getModeParams();
    const maxValue = params.levels - 1;

    // ホイール
    if (ev.type === "wheel") {
      const hit = this.hitTest(ev.localX, ev.localY);
      if (hit) {
        const dir = ev.deltaY > 0 ? 1 : -1;
        const newValue = Math.max(0, Math.min(maxValue, this.value + dir));
        if (newValue !== this.value) {
          this.value = newValue;
          if (this.onChange) this.onChange(newValue);
        }
        ev.consumed = true;
      }
      return;
    }

    if (ev.type !== "up") return;
    for (let i = 0; i < params.levels; i++) {
      const col = i % params.cols;
      const row = (i / params.cols) | 0;
      const cellX = this.x + col * (BAYER_CELL_SIZE + BAYER_CELL_GAP);
      const cellY = this.y + row * (BAYER_CELL_SIZE + BAYER_CELL_GAP);
      if (
        ev.localX >= cellX &&
        ev.localX < cellX + BAYER_CELL_SIZE &&
        ev.localY >= cellY &&
        ev.localY < cellY + BAYER_CELL_SIZE
      ) {
        if (this.value !== i) {
          this.value = i;
          if (this.onChange) this.onChange(i);
        }
        return;
      }
    }
  }

  /** @override — ←→↑↓ でグリッド移動 */
  handleKey() {
    const params = this._getModeParams();
    const col = this.value % params.cols;
    const row = (this.value / params.cols) | 0;
    let newCol = col;
    let newRow = row;
    if (Ports.keyDown("ArrowLeft")) newCol = col - 1;
    else if (Ports.keyDown("ArrowRight")) newCol = col + 1;
    else if (Ports.keyDown("ArrowUp")) newRow = row - 1;
    else if (Ports.keyDown("ArrowDown")) newRow = row + 1;
    else return false;
    if (newCol < 0 || newCol >= params.cols || newRow < 0) return true;
    const newValue = newRow * params.cols + newCol;
    if (newValue >= params.levels) return true;
    if (newValue !== this.value) {
      this.value = newValue;
      if (this.onChange) this.onChange(this.value);
    }
    return true;
  }
}

