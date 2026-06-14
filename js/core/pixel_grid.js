/**
 * @module core/pixel_grid
 * pixel_grid.js — ピクセルグリッド変換モジュール
 *
 * 1-bit VRAM データを 3x 拡大ピクセルグリッド表示に変換する。
 * DOM/Canvas に依存しない純粋関数群。
 *
 * 固定パラメータ:
 *   Dot size: 2, Gap width: 1 → CELL_SIZE = 3
 *   Gap darkness: 100% (黒), Glow intensity: 30%, Glow radius: 1 (Chebyshev)
 *   Diagonal: spacing=6, thickness=3, darkness=20%, speed=20px/s (右下方向)
 *   Vignette: strength=30%, radius=10% (楕円, 連続 RGB 暗化)
 *
 * 8色パレット:
 *   0: bg ドット
 *   1: fg ドット
 *   2: bg グロー (bg * intensity) — bg ピクセル隣のギャップ
 *   3: fg グロー (fg * intensity) — fg ピクセル隣のギャップ
 *   4: bg + 斜線暗化 (bg * 0.80)
 *   5: fg + 斜線暗化 (fg * 0.80)
 *   6: bg グロー + 斜線暗化
 *   7: fg グロー + 斜線暗化
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** セルサイズ (DOT + GAP) */
export const CELL = 3;

/** ドットサイズ (2x2 ピクセル) */
const DOT = 2;

/** グロー強度 */
let _glowIntensity = 0.30;

/** グロー有効フラグ */
let _glowEnabled = true;

/** ビネットパラメータ */
let _vignetteEnabled = true;
let _vignetteStrength = 0.30;
let _vignetteRadius   = 0.10;

/** ノイズパラメータ */
let _noiseEnabled = false;
let _noiseStrength = 0.10;  // 0.0-1.0 (Config の 0-100 を /100)

/**
 * ノイズ LUT — 事前生成ランダム値 (初期化時に 1 回だけ生成)
 * 262144 ピクセル × 3ch = 786432 entries (768 KB)
 * 4 フレーム分のオフセットをラウンドロビンで切り替え、
 * ホットループから乱数生成を完全に排除する。
 */
const NOISE_LUT_PIXELS = 262144;
const NOISE_LUT_SIZE = NOISE_LUT_PIXELS * 3;
const _noiseLut = new Int8Array(NOISE_LUT_SIZE);
const NOISE_FRAMES = 4;
let _noiseFrame = 0;

// xorshift32 で LUT を一括生成 (モジュール読み込み時に 1 回だけ実行)
{
  let s = 48271;
  for (let i = 0; i < NOISE_LUT_SIZE; i++) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    _noiseLut[i] = s >> 24; // 上位バイト [-128, 127]
  }
}

/** 斜線パラメータ */
let _diagEnabled = true;
let _diagSpacing = 6;
let _diagThickness = 3;
let _diagDarkness = 0.20;
let _diagSpeed = 20; // px/s

/**
 * 斜線ヒットテーブル (最適化3)
 * spacing/thickness 変更時に _rebuildDiagHit() で再構築。
 */
let _diagHit = new Uint8Array([1,1,1,0,0,0,1,1,1,0]);

/** spacing/thickness から DIAG_HIT を再構築する */
function _rebuildDiagHit() {
  const size = _diagSpacing + CELL + 2;
  _diagHit = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    _diagHit[i] = (i % _diagSpacing) < _diagThickness ? 1 : 0;
  }
}

/** LUT が初期化済みなら強制再構築する */
function _forceRebuildLut() {
  if (_lutFg0 < 0) return;
  rebuildLut([_lutFg0, _lutFg1, _lutFg2], [_lutBg0, _lutBg1, _lutBg2]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  斜線アニメーション状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _diagOffset = 0;
let _lastTime = 0;

/**
 * 斜線オフセットを performance.now() ベースで進める。
 * 毎フレーム flush() の先頭で呼ぶ。
 */
export function tickDiag() {
  const now = performance.now();
  if (_lastTime > 0) {
    const dt = (now - _lastTime) / 1000;
    _diagOffset = (_diagOffset + _diagSpeed * dt) % (_diagSpacing * 1000);
  }
  _lastTime = now;
}

/** 現在の斜線オフセットを返す */
export function getDiagOffset() {
  return _diagOffset;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  8色 LUT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 8色 LUT (packed RGBA, little-endian ABGR)
 * Index: 0=bg, 1=fg, 2=bgGlow, 3=fgGlow, 4=bg+diag, 5=fg+diag, 6=bgGlow+diag, 7=fgGlow+diag
 */
const _lut = new Uint32Array(8);

/** LUT 変更検知用 */
let _lutFg0 = -1, _lutFg1 = -1, _lutFg2 = -1;
let _lutBg0 = -1, _lutBg1 = -1, _lutBg2 = -1;

/** RGB → packed ABGR (little-endian) */
function pack(r, g, b) {
  return r | (g << 8) | (b << 16) | 0xff000000;
}

/** チャンネルを 0-255 にクランプ */
function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0;
}

/**
 * パレット変更時に 8 色 LUT を再構築する。
 * @param {number[]} fg  前景色 [R, G, B]
 * @param {number[]} bg  背景色 [R, G, B]
 */
export function rebuildLut(fg, bg) {
  _lutFg0 = fg[0]; _lutFg1 = fg[1]; _lutFg2 = fg[2];
  _lutBg0 = bg[0]; _lutBg1 = bg[1]; _lutBg2 = bg[2];

  // 0: bg dot
  _lut[0] = pack(bg[0], bg[1], bg[2]);
  // 1: fg dot
  _lut[1] = pack(fg[0], fg[1], fg[2]);
  // 2: bg glow (bg * intensity); bg ピクセル隣のギャップ
  //    OFF → intensity=0 → black
  const gi = _glowEnabled ? _glowIntensity : 0;
  const bgr = clamp(bg[0] * gi);
  const bgg = clamp(bg[1] * gi);
  const bgb = clamp(bg[2] * gi);
  _lut[2] = pack(bgr, bgg, bgb);
  // 3: fg glow (fg * intensity); fg ピクセル隣のギャップ
  const fgr = clamp(fg[0] * gi);
  const fgg = clamp(fg[1] * gi);
  const fgb = clamp(fg[2] * gi);
  _lut[3] = pack(fgr, fgg, fgb);
  // 4: bg + diag darkening; OFF → darkness=0 → dm=1 → no darkening
  const dm = 1 - (_diagEnabled ? _diagDarkness : 0);
  _lut[4] = pack(clamp(bg[0] * dm), clamp(bg[1] * dm), clamp(bg[2] * dm));
  // 5: fg + diag darkening
  _lut[5] = pack(clamp(fg[0] * dm), clamp(fg[1] * dm), clamp(fg[2] * dm));
  // 6: bg glow + diag darkening
  _lut[6] = pack(clamp(bgr * dm), clamp(bgg * dm), clamp(bgb * dm));
  // 7: fg glow + diag darkening
  _lut[7] = pack(clamp(fgr * dm), clamp(fgg * dm), clamp(fgb * dm));
}

/**
 * パレットが変わったかチェックし、必要なら LUT を再構築する。
 * @param {number[]} fg
 * @param {number[]} bg
 */
export function ensureLut(fg, bg) {
  if (
    fg[0] !== _lutFg0 || fg[1] !== _lutFg1 || fg[2] !== _lutFg2 ||
    bg[0] !== _lutBg0 || bg[1] !== _lutBg1 || bg[2] !== _lutBg2
  ) {
    rebuildLut(fg, bg);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  applyPixelGrid — VRAM → RGBA (Uint32Array)
//  最適化2: 3x3 内側ループ手動展開
//  最適化3: 斜線 modulo をセル単位に削減 + DIAG_HIT テーブル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1-bit VRAM を 3x 拡大ピクセルグリッド RGBA に変換する。
 *
 * @param {Uint32Array} out32    出力先 (w*CELL * h*CELL 要素)
 * @param {Uint8Array}  vram     1-bit VRAM データ (0/1)
 * @param {number}      w        VRAM 幅
 * @param {number}      h        VRAM 高さ
 * @param {number}      diagOff  斜線オフセット (px)
 */
export function applyPixelGrid(out32, vram, w, h, diagOff) {
  const outW = w * CELL;
  const doff = Math.floor(diagOff);
  const lut = _lut;
  const S = _diagSpacing;
  const dh = _diagHit;

  for (let sy = 0; sy < h; sy++) {
    const srcRow = sy * w;
    const outRowBase = sy * CELL * outW;
    const outRow1 = outRowBase + outW;
    const outRow2 = outRowBase + outW + outW;

    for (let sx = 0; sx < w; sx++) {
      const v = vram[srcRow + sx]; // 0 or 1
      const ox = sx * CELL;

      // 隣接ピクセル (双方向グロー判定用)
      // fg(1) 隣接 → index 3 (fg glow), bg(0) のみ → index 2 (bg glow)
      const rightLit = (sx + 1 < w) ? vram[srcRow + sx + 1] : 0;
      const belowLit = (sy + 1 < h) ? vram[srcRow + w + sx] : 0;
      const diagLit = (sx + 1 < w && sy + 1 < h) ? vram[srcRow + w + sx + 1] : 0;

      const gapR = (v | rightLit) ? 3 : 2;
      const gapB = (v | belowLit) ? 3 : 2;
      const gapC = (v | rightLit | belowLit | diagLit) ? 3 : 2;

      // 斜線: セル基準の base を1回だけ計算 (最適化3)
      const base = ((ox + sy * CELL - doff) % S + S) % S;

      // ── Row 0 (ly=0) ──
      const r0 = outRowBase + ox;
      // (0,0) dot, diag offset=0
      out32[r0]     = lut[v   + (dh[base]     << 2)];
      // (1,0) dot, diag offset=1
      out32[r0 + 1] = lut[v   + (dh[base + 1] << 2)];
      // (2,0) gap glow, diag offset=2
      out32[r0 + 2] = lut[gapR + (dh[base + 2] << 2)];

      // ── Row 1 (ly=1) ──
      const r1 = outRow1 + ox;
      // (0,1) dot, diag offset=1
      out32[r1]     = lut[v   + (dh[base + 1] << 2)];
      // (1,1) dot, diag offset=2
      out32[r1 + 1] = lut[v   + (dh[base + 2] << 2)];
      // (2,1) gap glow, diag offset=3
      out32[r1 + 2] = lut[gapR + (dh[base + 3] << 2)];

      // ── Row 2 (ly=2) ──
      const r2 = outRow2 + ox;
      // (0,2) gap glow, diag offset=2
      out32[r2]     = lut[gapB + (dh[base + 2] << 2)];
      // (1,2) gap glow, diag offset=3
      out32[r2 + 1] = lut[gapB + (dh[base + 3] << 2)];
      // (2,2) corner glow, diag offset=4
      out32[r2 + 2] = lut[gapC + (dh[base + 4] << 2)];
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  applyPixelGridIndexed — VRAM → indexed Uint8Array (GIF 用)
//  最適化2,3 を同様に適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1-bit VRAM を 3x 拡大ピクセルグリッド indexed-color に変換する。
 * GIF エンコード用。出力値は 0-7 のパレットインデックス。
 *
 * @param {Uint8Array} vram     1-bit VRAM データ (0/1)
 * @param {number}     w        VRAM 幅
 * @param {number}     h        VRAM 高さ
 * @param {number}     diagOff  斜線オフセット (px)
 * @returns {{ data: Uint8Array, width: number, height: number }}
 */
export function applyPixelGridIndexed(vram, w, h, diagOff) {
  const outW = w * CELL;
  const outH = h * CELL;
  const out = new Uint8Array(outW * outH);
  const doff = Math.floor(diagOff);
  const S = _diagSpacing;
  const dh = _diagHit;

  for (let sy = 0; sy < h; sy++) {
    const srcRow = sy * w;
    const outRowBase = sy * CELL * outW;
    const outRow1 = outRowBase + outW;
    const outRow2 = outRowBase + outW + outW;

    for (let sx = 0; sx < w; sx++) {
      const v = vram[srcRow + sx];
      const ox = sx * CELL;

      const rightLit = (sx + 1 < w) ? vram[srcRow + sx + 1] : 0;
      const belowLit = (sy + 1 < h) ? vram[srcRow + w + sx] : 0;
      const diagLit = (sx + 1 < w && sy + 1 < h) ? vram[srcRow + w + sx + 1] : 0;

      const gapR = (v | rightLit) ? 3 : 2;
      const gapB = (v | belowLit) ? 3 : 2;
      const gapC = (v | rightLit | belowLit | diagLit) ? 3 : 2;

      const base = ((ox + sy * CELL - doff) % S + S) % S;

      // ── Row 0 ──
      const r0 = outRowBase + ox;
      out[r0]     = v    + (dh[base]     << 2);
      out[r0 + 1] = v    + (dh[base + 1] << 2);
      out[r0 + 2] = gapR + (dh[base + 2] << 2);

      // ── Row 1 ──
      const r1 = outRow1 + ox;
      out[r1]     = v    + (dh[base + 1] << 2);
      out[r1 + 1] = v    + (dh[base + 2] << 2);
      out[r1 + 2] = gapR + (dh[base + 3] << 2);

      // ── Row 2 ──
      const r2 = outRow2 + ox;
      out[r2]     = gapB + (dh[base + 2] << 2);
      out[r2 + 1] = gapB + (dh[base + 3] << 2);
      out[r2 + 2] = gapC + (dh[base + 4] << 2);
    }
  }

  return { data: out, width: outW, height: outH };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Vignette LUT (最適化1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @type {Uint16Array|null} factor 0-256 (256 = 変化なし) */
let _vignetteLut = null;
let _vignetteLutW = 0;
let _vignetteLutH = 0;

/**
 * ビネット factor LUT を構築する。
 * initGpu() と Config.onResize() で呼ぶ。
 * @param {number} w  画像幅 (物理ピクセル)
 * @param {number} h  画像高さ (物理ピクセル)
 */
export function rebuildVignetteLut(w, h) {
  _vignetteLutW = w;
  _vignetteLutH = h;
  const size = w * h;
  _vignetteLut = new Uint16Array(size);

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const SQRT2 = Math.SQRT2;
  const rDist = _vignetteRadius * SQRT2;
  const range = SQRT2 - rDist;

  for (let py = 0; py < h; py++) {
    const ny = (py - cy) / cy;
    const ny2 = ny * ny;
    const rowOff = py * w;
    for (let px = 0; px < w; px++) {
      const nx = (px - cx) / cx;
      const d = Math.sqrt(nx * nx + ny2);
      if (d <= rDist) {
        _vignetteLut[rowOff + px] = 256; // 変化なし
      } else {
        const intensity = _vignetteStrength * (d - rDist) / range;
        const factor = 1 - Math.min(intensity, 1);
        _vignetteLut[rowOff + px] = (factor * 256 + 0.5) | 0;
      }
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  applyVignette — 楕円ビネット (物理ピクセル連続暗化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ピクセルグリッド変換済みの RGBA バッファにビネット効果を適用する。
 * 楕円形 (aspect-corrected) の連続 RGB 乗算暗化。
 *
 * LUT が構築済みかつサイズが一致する場合は高速パス (整数演算のみ)、
 * そうでなければフォールバック (Math.sqrt 直接計算) を使用する。
 *
 * @param {Uint8ClampedArray|Uint8Array} pixels  RGBA ピクセルデータ
 * @param {number} w  画像幅 (物理ピクセル)
 * @param {number} h  画像高さ (物理ピクセル)
 */
export function applyVignette(pixels, w, h) {
  if (_vignetteLut && _vignetteLutW === w && _vignetteLutH === h) {
    // 高速パス: LUT から factor を引いて整数演算
    const lut = _vignetteLut;
    const len = w * h;
    for (let i = 0; i < len; i++) {
      const f = lut[i];
      if (f >= 256) continue; // 中心付近 — 完全スキップ
      const idx = i << 2;
      pixels[idx]     = (pixels[idx]     * f + 128) >> 8;
      pixels[idx + 1] = (pixels[idx + 1] * f + 128) >> 8;
      pixels[idx + 2] = (pixels[idx + 2] * f + 128) >> 8;
    }
    return;
  }

  // フォールバック: LUT なし (endCapture 等でサイズ不一致時)
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const SQRT2 = Math.SQRT2;
  const rDist = _vignetteRadius * SQRT2;
  const range = SQRT2 - rDist;

  for (let py = 0; py < h; py++) {
    const ny = (py - cy) / cy;
    const ny2 = ny * ny;
    for (let px = 0; px < w; px++) {
      const nx = (px - cx) / cx;
      const d = Math.sqrt(nx * nx + ny2);
      if (d <= rDist) continue;
      const intensity = _vignetteStrength * (d - rDist) / range;
      const factor = 1 - Math.min(intensity, 1);
      const idx = (py * w + px) * 4;
      pixels[idx]     = Math.round(pixels[idx]     * factor);
      pixels[idx + 1] = Math.round(pixels[idx + 1] * factor);
      pixels[idx + 2] = Math.round(pixels[idx + 2] * factor);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  applyNoise — RGB 個別ランダムノイズ (物理ピクセル単位)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ピクセルグリッド変換済みの RGBA バッファに RGB ノイズを適用する。
 * 毎フレーム変化する乱数で、アナログ CRT の揺らぎを再現する。
 * Uint8ClampedArray が自動 0-255 クランプするため手動クランプ不要。
 *
 * 最適化:
 *   - 事前生成 LUT (768 KB) からの逐次読み出し — ホットループ内で乱数生成ゼロ
 *   - 4 フレーム分のオフセットラウンドロビンで毎フレーム異なるパターン
 *   - 3ch 独立読み出しで CPU パイプライン並列化が効く
 *
 * @param {Uint8ClampedArray|Uint8Array} pixels  RGBA ピクセルデータ
 * @param {number} w  画像幅 (物理ピクセル)
 * @param {number} h  画像高さ (物理ピクセル)
 */
export function applyNoise(pixels, w, h) {
  if (!_noiseEnabled) return;
  const f = _noiseStrength * (51 / 256);
  const len = w * h * 4;
  const lut = _noiseLut;
  const lutSize = NOISE_LUT_SIZE;
  let off = (_noiseFrame % NOISE_FRAMES) * (lutSize / NOISE_FRAMES | 0);
  _noiseFrame++;

  for (let i = 0; i < len; i += 4) {
    pixels[i]     += lut[off]     * f;
    pixels[i + 1] += lut[off + 1] * f;
    pixels[i + 2] += lut[off + 2] * f;
    off += 3;
    if (off >= lutSize) off -= lutSize;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  getPixelGridPalette — 8色パレット RGB 配列
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在のパレットから 8 色 RGB 配列を返す (GIF 用)。
 * @param {number[]} fg  前景色 [R, G, B]
 * @param {number[]} bg  背景色 [R, G, B]
 * @returns {number[][]}  [[R,G,B], ...] (8 エントリ)
 */
export function getPixelGridPalette(fg, bg) {
  const dm = 1 - (_diagEnabled ? _diagDarkness : 0);
  const gi = _glowEnabled ? _glowIntensity : 0;
  const bgr = clamp(bg[0] * gi);
  const bgg = clamp(bg[1] * gi);
  const bgb = clamp(bg[2] * gi);
  const fgr = clamp(fg[0] * gi);
  const fgg = clamp(fg[1] * gi);
  const fgb = clamp(fg[2] * gi);

  return [
    [bg[0], bg[1], bg[2]],                                         // 0: bg dot
    [fg[0], fg[1], fg[2]],                                         // 1: fg dot
    [bgr, bgg, bgb],                                                // 2: bg glow
    [fgr, fgg, fgb],                                                // 3: fg glow
    [clamp(bg[0] * dm), clamp(bg[1] * dm), clamp(bg[2] * dm)],     // 4: bg+diag
    [clamp(fg[0] * dm), clamp(fg[1] * dm), clamp(fg[2] * dm)],     // 5: fg+diag
    [clamp(bgr * dm), clamp(bgg * dm), clamp(bgb * dm)],            // 6: bg glow+diag
    [clamp(fgr * dm), clamp(fgg * dm), clamp(fgb * dm)],            // 7: fg glow+diag
  ];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  動的パラメータ setter / getter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function isVignetteEnabled() { return _vignetteEnabled; }
export function setVignetteEnabled(v) { _vignetteEnabled = !!v; }
export function setVignetteStrength(v) { _vignetteStrength = v; }
export function setVignetteRadius(v) { _vignetteRadius = v; }

export function setDiagEnabled(v) { _diagEnabled = !!v; _forceRebuildLut(); }
export function setDiagDarkness(v) { _diagDarkness = v; _forceRebuildLut(); }
export function setDiagSpeed(v) { _diagSpeed = v; }
export function setDiagSpacing(v) { _diagSpacing = v; _rebuildDiagHit(); }
export function setDiagThickness(v) { _diagThickness = v; _rebuildDiagHit(); }

export function isNoiseEnabled() { return _noiseEnabled; }
export function setNoiseEnabled(v) { _noiseEnabled = !!v; }
export function setNoiseStrength(v) { _noiseStrength = v; }

export function setGlowEnabled(v) { _glowEnabled = !!v; _forceRebuildLut(); }
export function setGlowIntensity(v) { _glowIntensity = v; _forceRebuildLut(); }
