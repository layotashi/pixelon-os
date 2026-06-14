/**
 * @module core/pbm
 * pbm.js — PBM P1 (ASCII) エンコード / デコード
 *
 * 1-bit ビットマップ画像を PBM (Portable Bitmap) P1 形式で
 * エンコード・デコードするユーティリティ。
 *
 * PBM P1 仕様:
 *   - マジックナンバー "P1"
 *   - 幅 高さ (10 進 ASCII)
 *   - ピクセル値 0/1 (0 = 白, 1 = 黒)
 *   - "#" 以降行末まではコメント
 *
 * ── 使用例 ──
 *   import { encodePBM, decodePBM } from "../core/pbm.js";
 *
 *   const text = encodePBM(buf, 128, 96);
 *   const result = decodePBM(text);  // { w, h, buf } or null
 */

// ── エンコード ──

/**
 * Uint8Array バッファを PBM P1 テキストにエンコードする。
 *
 * @param {Uint8Array} buf  ピクセルバッファ (0 or 1, row-major)
 * @param {number}     w    幅
 * @param {number}     h    高さ
 * @returns {string}   PBM P1 形式のテキスト
 */
export function encodePBM(buf, w, h) {
  let s = `P1\n${w} ${h}\n`;
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      row.push(buf[y * w + x]);
    }
    s += row.join(" ") + "\n";
  }
  return s;
}

// ── デコード ──

/**
 * PBM P1 テキストをデコードしてピクセルバッファを返す。
 *
 * @param {string} text  PBM P1 形式のテキスト
 * @returns {{ w: number, h: number, buf: Uint8Array } | null}
 *          デコード成功時はオブジェクト、失敗時は null
 */
export function decodePBM(text) {
  // コメント除去 → トークン分割
  const tokens = text
    .replace(/#[^\n]*/g, "")
    .trim()
    .split(/\s+/);
  if (tokens[0] !== "P1") return null;

  const w = parseInt(tokens[1], 10);
  const h = parseInt(tokens[2], 10);
  if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return null;

  const buf = new Uint8Array(w * h);
  let ti = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ti >= tokens.length) break;
      buf[y * w + x] = parseInt(tokens[ti], 10) ? 1 : 0;
      ti++;
    }
  }
  return { w, h, buf };
}

