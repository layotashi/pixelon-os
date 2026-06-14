/**
 * @module core/dither
 * dither.js — 1-bit ordered dithering エンジン
 *
 * Bayer ordered dithering で RGBA 画像データを 1-bit 配列に変換する。
 * 壁紙、画像ビューワー、動画プレイヤー等で共通利用する。
 *
 * ディザ方式:
 *   "bayer4" — Bayer 4×4 (デフォルト, 16階調)
 *   "bayer8" — Bayer 8×8 (64階調, より滑らか)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Bayer ディザ行列
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Bayer 4×4 整数行列 (0–15) — 共通利用用 */
export const BAYER_4x4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Bayer 4×4 (0–15 を 0.0–1.0 に正規化) — ディザリングエンジン用 */
const BAYER_4_NORMALIZED = BAYER_4x4.map((row) => row.map((v) => v / 16));

/** Bayer 8×8 整数行列 (0–63) — 共通利用用 */
export const BAYER_8x8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/** Bayer 8×8 (0–63 を 0.0–1.0 に正規化) — ディザリングエンジン用 */
const BAYER_8_NORMALIZED = [
  [0 / 64, 32 / 64, 8 / 64, 40 / 64, 2 / 64, 34 / 64, 10 / 64, 42 / 64],
  [48 / 64, 16 / 64, 56 / 64, 24 / 64, 50 / 64, 18 / 64, 58 / 64, 26 / 64],
  [12 / 64, 44 / 64, 4 / 64, 36 / 64, 14 / 64, 46 / 64, 6 / 64, 38 / 64],
  [60 / 64, 28 / 64, 52 / 64, 20 / 64, 62 / 64, 30 / 64, 54 / 64, 22 / 64],
  [3 / 64, 35 / 64, 11 / 64, 43 / 64, 1 / 64, 33 / 64, 9 / 64, 41 / 64],
  [51 / 64, 19 / 64, 59 / 64, 27 / 64, 49 / 64, 17 / 64, 57 / 64, 25 / 64],
  [15 / 64, 47 / 64, 7 / 64, 39 / 64, 13 / 64, 45 / 64, 5 / 64, 37 / 64],
  [63 / 64, 31 / 64, 55 / 64, 23 / 64, 61 / 64, 29 / 64, 53 / 64, 21 / 64],
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ディザモード
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @type {"bayer4"|"bayer8"} */
let ditherMode = "bayer4";

export function setDitherMode(mode) {
  if (mode === "bayer4" || mode === "bayer8") {
    ditherMode = mode;
  }
}

export function getDitherMode() {
  return ditherMode;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  前処理パラメータ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Percentile Stretch: 下位パーセンタイル (0–50) */
let stretchLow = 1.0;
/** Percentile Stretch: 上位パーセンタイル (50–100) */
let stretchHigh = 99.0;
/** ガンマ補正値 (0.5–2.0, 1.0=無補正) */
let ditherGamma = 1.0;

/**
 * 前処理パラメータを一括設定する。
 * @param {{ low?:number, high?:number, gamma?:number }} opts
 */
export function setPreprocessParams(opts) {
  if (opts.low !== undefined) stretchLow = Math.max(0, Math.min(50, opts.low));
  if (opts.high !== undefined)
    stretchHigh = Math.max(50, Math.min(100, opts.high));
  if (opts.gamma !== undefined)
    ditherGamma = Math.max(0.5, Math.min(2.0, opts.gamma));
}

/** 現在の前処理パラメータを返す */
export function getPreprocessParams() {
  return { low: stretchLow, high: stretchHigh, gamma: ditherGamma };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ディザリング API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── 事前確保バッファ (ビデオモード等の毎フレーム呼び出し対応) ──
let _grayBuf = null;
let _grayBufLen = 0;
const _histogram = new Uint32Array(256);

/**
 * RGBA 画像データを ordered dithering で 1-bit 配列に変換する。
 *
 * ソース画像を destW × destH に cover 配置 (中央クロップ) し、
 * Bayer ディザで 0/1 に量子化する。
 *
 * @param {Uint8ClampedArray} rgba  ソース RGBA ピクセルデータ (srcW × srcH × 4)
 * @param {number} srcW  ソース幅
 * @param {number} srcH  ソース高さ
 * @param {number} destW  出力幅
 * @param {number} destH  出力高さ
 * @param {Uint8Array} [out]  書き込み先バッファ (省略時は新規作成)
 * @returns {Uint8Array}  1-bit フレームバッファ (destW × destH)
 */
export function ditherRGBA(rgba, srcW, srcH, destW, destH, out) {
  if (!out) out = new Uint8Array(destW * destH);

  const matrix = ditherMode === "bayer8" ? BAYER_8_NORMALIZED : BAYER_4_NORMALIZED;
  const n = matrix.length;

  // cover 配置: ソースを destW × destH にフィット (はみ出す方向を中央クロップ)
  const scaleX = srcW / destW;
  const scaleY = srcH / destH;
  const scale = Math.min(scaleX, scaleY);
  const cropW = destW * scale;
  const cropH = destH * scale;
  const offX = (srcW - cropW) / 2;
  const offY = (srcH - cropH) / 2;

  // ── Pass 1: BT.709 グレースケール化 + ヒストグラム収集 ──
  const totalPx = destW * destH;
  // バッファを使い回す (サイズが変わった場合のみ再確保)
  if (_grayBufLen !== totalPx) {
    _grayBuf = new Float32Array(totalPx);
    _grayBufLen = totalPx;
  }
  const grayBuf = _grayBuf;
  const hist = _histogram;
  hist.fill(0);

  for (let dy = 0; dy < destH; dy++) {
    const rowOff = dy * destW;
    for (let dx = 0; dx < destW; dx++) {
      const sx = (offX + dx * scale) | 0;
      const sy = (offY + dy * scale) | 0;
      const si = (sy * srcW + sx) * 4;
      const g =
        rgba[si] * 0.2126 + rgba[si + 1] * 0.7152 + rgba[si + 2] * 0.0722;
      grayBuf[rowOff + dx] = g;
      hist[Math.min(255, g | 0)]++;
    }
  }

  // ── Percentile Stretch 閾値算出 ──
  const lowCount = ((totalPx * stretchLow) / 100) | 0;
  const highCount = ((totalPx * stretchHigh) / 100) | 0;
  let cumul = 0;
  let loVal = 0;
  let hiVal = 255;
  for (let i = 0; i < 256; i++) {
    cumul += hist[i];
    if (cumul <= lowCount) loVal = i;
    if (cumul < highCount) hiVal = i;
  }
  hiVal = Math.max(hiVal, loVal + 1); // ゼロ除算防止
  const range = hiVal - loVal;

  // ── ガンマ逆数 (LUT) ──
  const invGamma = 1.0 / ditherGamma;

  // ── Pass 2: Stretch + Gamma + Dithering ──
  for (let dy = 0; dy < destH; dy++) {
    const rowOff = dy * destW;
    for (let dx = 0; dx < destW; dx++) {
      // Percentile Stretch: [loVal, hiVal] → [0, 1]
      let v = (grayBuf[rowOff + dx] - loVal) / range;
      if (v < 0) v = 0;
      if (v > 1) v = 1;

      // Gamma 補正
      if (invGamma !== 1.0) v = v ** invGamma;

      // Ordered dithering
      const threshold = matrix[dy % n][dx % n];
      out[rowOff + dx] = v > threshold ? 1 : 0;
    }
  }
  return out;
}

