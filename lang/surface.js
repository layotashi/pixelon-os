/**
 * @module lang/surface
 * surface.js — 言語ランタイムが描画する抽象「サーフェス」契約。
 *
 * 言語本体はこの契約だけに依存し、実装は注入される:
 *   - playground: canvas2D の薄いシム
 *   - SYNESTA 統合: 本物の GPU (js/ui/ports の gpu 相当)
 * これにより font/theme/GPU をコピーせず共有でき、統合時のドリフトを防ぐ。
 *
 * すべて 1-bit。色は「インク level ∈ [0,1]」のみ（テーマが level→色を解決）。
 * 座標は VRAM ピクセル (DOT)。x:0..W-1, y:0..H-1。
 *
 * 契約 (Tier0 で必須なのは width/height/blitField/present):
 *   width()  -> number
 *   height() -> number
 *   present()                         // 1フレームを確定（フラッシュ）
 *   blitField(buf, w, h)              // 値の場を表示へ（このサーフェスは 0..1 → 1-bit ディザ）
 *   // ── 描画命令（Tier1。Processing 流の命名） ──
 *   clear(level=0)
 *   stroke(level)                     // 以降の point/line の描画値 0..1
 *   point(x, y[, level])
 *   line(x0, y0, x1, y1)
 */

/**
 * 場バッファ（Float 0..1）を 4x4 Bayer でしきい値化して 1-bit に落とす純関数。
 * シム/GPU 双方が blitField 実装で使える共通ヘルパ（描画先には依存しない）。
 * @param {Float32Array|number[]} buf  長さ w*h、各 0..1
 * @returns {Uint8Array}  長さ w*h、各 0|1
 */
const BAYER4 = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
].map((v) => (v + 0.5) / 16);

export function ditherField(buf, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = buf[i] < 0 ? 0 : buf[i] > 1 ? 1 : buf[i];
      const th = BAYER4[(y & 3) * 4 + (x & 3)];
      out[i] = v > th ? 1 : 0;
    }
  }
  return out;
}

/**
 * 1-bit フレームバッファに契約を実装した汎用サーフェス（純粋・ホスト非依存）。
 *
 * ランタイムの全モード（場/描画/状態場）をこの 1 つで受けられる:
 *   - blitField … 0..1 の場を 4x4 Bayer でディザして全面に書く。
 *   - clear/stroke/point/line … Tier1 描画をバッファへ直書き（自動クリアなし＝蓄積可）。
 * `present()` は no-op。ホストは `.buf`（Uint8Array, 0|1, 長さ W*H）を読んで画面へ
 * blit するだけでよい（SYNESTA は GPU.blit、playground は canvas など）。
 * SYNESTA を一切 import しないので、node テストでも playground でも再利用できる。
 *
 * @param {number} W
 * @param {number} H
 * @returns {object} surface 契約 + `.buf`
 */
export function makeBufferSurface(W, H) {
  const buf = new Uint8Array(W * H);
  let ink = 1; // 以降の point/line の描画値（stroke で変更）

  const setPx = (x, y, v) => {
    x |= 0;
    y |= 0;
    if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = v;
  };

  return {
    buf,
    width: () => W,
    height: () => H,
    present() {},
    clear(level = 0) {
      buf.fill(level >= 0.5 ? 1 : 0);
    },
    stroke(level) {
      ink = level >= 0.5 ? 1 : 0;
    },
    point(x, y, level) {
      setPx(x, y, level == null ? ink : level >= 0.5 ? 1 : 0);
    },
    line(x0, y0, x1, y1) {
      // Bresenham
      x0 |= 0;
      y0 |= 0;
      x1 |= 0;
      y1 |= 0;
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      for (;;) {
        setPx(x0, y0, ink);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
    },
    blitField(fbuf, w, h) {
      const bits = ditherField(fbuf, w, h);
      buf.set(bits.length === buf.length ? bits : bits.subarray(0, buf.length));
    },
  };
}
