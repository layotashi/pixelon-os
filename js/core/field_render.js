/**
 * @module core/field_render
 * field_render.js — スカラー場 (0..1) を 1-bit 表現へ落とす共有レンダラ。
 *
 * Tessera 言語の出力は結局 0..1 のスカラー場 f(x,y)。それを DITHER / HATCH / HALFTONE /
 * BRAILLE の各「面」方式で 1-bit (0/1) に変換する純関数群。「場 = 共通通貨」
 * という北極星 B の中核（TESSERA が使う）。
 *
 * すべて純粋: 入力 field=Float32Array(W*H, 0..1)、出力 out=Uint8Array(W*H, 0/1)。
 * 座標系・合成（額縁/倍率）・書き出しは呼び側＝アプリ／core/art_export.js の責務。
 * ASCII は解像度が変わる（1文字=セル）ため別扱い（core/ascii_art.js を使う）。
 */

/* prettier-ignore */
const BAYER2 = [
  0, 2,
  3, 1,
];

/* prettier-ignore */
const BAYER4 = [
   0, 8, 2,10,
  12, 4,14, 6,
   3,11, 1, 9,
  15, 7,13, 5,
];

/* prettier-ignore */
const BAYER8 = [
   0,32, 8,40, 2,34,10,42,
  48,16,56,24,50,18,58,26,
  12,44, 4,36,14,46, 6,38,
  60,28,52,20,62,30,54,22,
   3,35,11,43, 1,33, 9,41,
  51,19,59,27,49,17,57,25,
  15,47, 7,39,13,45, 5,37,
  63,31,55,23,61,29,53,21,
];

/** size(2/4/8) → Bayer 行列とマスク/正規化。無効値は 4x4 既定。 */
function ditherParams(size) {
  if (size === 2) return { mat: BAYER2, mask: 1, div: 4 };
  if (size === 8) return { mat: BAYER8, mask: 7, div: 64 };
  return { mat: BAYER4, mask: 3, div: 16 };
}

/**
 * Bayer 順序ディザ: (x,y,value) → 0/1。size=2/4/8。
 * (x,y) だけで閾値が決まる順序ディザなのでフレーム間で安定（アニメ/ループ安全）。
 * @param {number} size 2|4|8
 */
export function bayerBit(size, x, y, value) {
  const dp = ditherParams(size);
  const dim = dp.mask + 1;
  const th = (dp.mat[(y & dp.mask) * dim + (x & dp.mask)] + 0.5) / dp.div;
  return value > th ? 1 : 0;
}

/** 境界クランプの場参照 */
function clampF(f, x, y, W, H) {
  if (x < 0) x = 0;
  else if (x >= W) x = W - 1;
  if (y < 0) y = 0;
  else if (y >= H) y = H - 1;
  return f[y * W + x];
}

// ── 各方式（field → 1bit out） ──

function renderDither(f, W, H, a, size) {
  const dp = ditherParams(size);
  const dim = dp.mask + 1;
  for (let y = 0; y < H; y++) {
    const base = y * W;
    for (let x = 0; x < W; x++) {
      const th = (dp.mat[(y & dp.mask) * dim + (x & dp.mask)] + 0.5) / dp.div;
      a[base + x] = f[base + x] > th ? 1 : 0;
    }
  }
}

function renderHatch(f, W, H, a, P) {
  // 版画: 濃さを斜線クロスハッチの密度で
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = f[y * W + x];
      let on = 0;
      if (v > 0.12 && (x + y) % P === 0) on = 1; // /
      if (v > 0.45 && (x - y + 4000) % P === 0) on = 1; // \
      if (v > 0.72 && x % P === 0) on = 1; // |
      if (v > 0.9 && y % P === 0) on = 1; // —
      a[y * W + x] = on;
    }
}

function renderHalftone(f, W, H, a, cell) {
  // ハーフトーン網点: 濃さで成長する円ドット
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cx = ((x / cell) | 0) * cell + (cell >> 1);
      const cy = ((y / cell) | 0) * cell + (cell >> 1);
      const v = clampF(f, cx, cy, W, H);
      const dx = x - cx,
        dy = y - cy;
      const R = v * cell * 0.72;
      if (dx * dx + dy * dy <= R * R) a[y * W + x] = 1;
    }
}

function renderBraille(f, W, H, a, size) {
  // 点字: 2×4 サブドットセル（サブドットを Bayer ディザで階調表現）
  const dp = ditherParams(size);
  const dim = dp.mask + 1;
  const CW = 4,
    CH = 8;
  const dots = [0, 2]; // x オフセット
  const dotsY = [0, 2, 4, 6];
  for (let cy = 0; cy * CH < H; cy++)
    for (let cx = 0; cx * CW < W; cx++)
      for (const ddx of dots)
        for (const ddy of dotsY) {
          const px = cx * CW + ddx,
            py = cy * CH + ddy;
          if (px < W && py < H) {
            const bx = px >> 1,
              by = py >> 1;
            const th =
              (dp.mat[(by & dp.mask) * dim + (bx & dp.mask)] + 0.5) / dp.div;
            if (clampF(f, px, py, W, H) > th) a[py * W + px] = 1;
          }
        }
}

/**
 * 場を指定方式で 1-bit へ。dither は全画素を書き、それ以外は out を 0 クリアしてから描く。
 * 1-bit でグラデーション面が気持ちよく見える「面」系のみに整理（線ベースの contour/scanline は廃止）。
 * @param {Float32Array} field  0..1, 長さ W*H
 * @param {number} W
 * @param {number} H
 * @param {Uint8Array} out      0/1, 長さ W*H（書き込み先）
 * @param {string} mode  "dither"|"hatch"|"halftone"|"braille"
 * @param {object} params  { ditherSize, hatchPitch, halftoneCell }
 */
export function renderField(field, W, H, out, mode, params = {}) {
  if (mode === "dither") {
    renderDither(field, W, H, out, params.ditherSize);
    return;
  }
  out.fill(0);
  switch (mode) {
    case "hatch":
      renderHatch(field, W, H, out, params.hatchPitch);
      break;
    case "halftone":
      renderHalftone(field, W, H, out, params.halftoneCell);
      break;
    case "braille":
      renderBraille(field, W, H, out, params.ditherSize);
      break;
  }
}
