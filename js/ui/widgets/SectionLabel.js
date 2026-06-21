/**
 * @module ui/widgets/SectionLabel
 * SectionLabel.js — 反転バンドのセクション見出し (大項目ラベル)
 *
 * Label の反転描画 (inverted) に内側余白を持たせ、「タイトルバー風の帯」として
 * セクションの大項目名を表す。VBox の直下に置くとパネル/ゾーン幅いっぱいに
 * stretch され、全幅の反転バンドになる。
 *
 * 小項目 (フィールドラベル: OUT/DOT/PAD 等) は素の Label を使い、大項目だけを
 * SectionLabel にすることで対比 (CRAP の Contrast) と二階層の構造を作る。
 * 余白・様式は SECTION_PAD_* に集約し、全画面で統一する (Repetition)。
 *
 * 注: 角丸ではなく角 (Label の矩形塗り) のままにすることで、押せる UI
 * (ButtonBase は角丸) との誤認を避ける。
 */

import { Label } from "./Label.js";
import { SECTION_PAD } from "../ui_constants.js";

export class SectionLabel extends Label {
  /**
   * @param {number} x コンテンツ領域内の X
   * @param {number} y コンテンツ領域内の Y
   * @param {string} text 見出しテキスト
   */
  constructor(x, y, text) {
    super(x, y, text, 1);
    this.inverted = true;
    this.padX = SECTION_PAD; // 四辺同一余白 (セッター経由で w/h を再計算)
    this.padY = SECTION_PAD;
  }
}
