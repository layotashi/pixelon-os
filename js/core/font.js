/**
 * @module core/font
 * font.js — ビットマップフォント管理・テキスト描画
 *
 * フォントシート PNG を読み込み、ASCII 0x20–0x7E の 95 グリフを
 * Uint8Array ルックアップテーブルに変換して保持する。
 * drawText() でテキストを VRAM に描画する。
 * switchFont() で実行時にフォントを切り替えられる。
 *
 * フォントシート仕様:
 *   - 各グリフは glyphW × glyphH ピクセル
 *   - セルピッチ: (glyphW+1) × (glyphH+1)、隣接グリフ間で 1px 余白を共有
 *   - シート先頭に offset px マージン (左上)
 *   - cols 列に左→右、上→下で ASCII 順に配置
 *   - 白ピクセル (R≥128) = 前景、黒ピクセル = 透過
 */

import { blit } from "./gpu.js";
import { getTextTransform } from "../config.js";

// ── フォントパラメータ (switchFont で動的更新) ──

/** グリフ幅 (px) */
export let GLYPH_W = 5;

/** グリフ高さ (px) */
export let GLYPH_H = 7;

/** 最初の文字コード */
const FIRST_CHAR = 0x20;

/** 最後の文字コード */
const LAST_CHAR = 0x7e;

/** 文字数 */
const CHAR_COUNT = LAST_CHAR - FIRST_CHAR + 1;

// ── 内部状態 ──

/**
 * グリフデータのルックアップテーブル
 * glyphs[charIndex] = Uint8Array(GLYPH_W * GLYPH_H)  (0/1)
 * @type {Uint8Array[]}
 */
const glyphs = new Array(CHAR_COUNT);

/** 初期化完了フラグ (PNG ロード完了後 true) */
let ready = false;

// ── 初期化・切替 ──

/**
 * フォントPNGを読み込みグリフテーブルを構築する。
 * kernel.js のブートシーケンスで最初に呼ばれる。
 *
 * @param {string} url      フォントシートの URL
 * @param {number} [gw=5]   グリフ幅
 * @param {number} [gh=7]   グリフ高さ
 * @param {number} [cols=10] シートの列数
 * @param {number} [offset=1] シート先頭オフセット (px)
 * @returns {Promise<void>}
 */
export function initFont(url, gw = 5, gh = 7, cols = 10, offset = 1) {
  return switchFont(url, gw, gh, cols, offset);
}

/**
 * フォントを動的に切り替える。
 * 新しい PNG を読み込み、グリフテーブルを再構築し、
 * GLYPH_W / GLYPH_H をを更新する。
 *
 * @param {string} url      フォントシートの URL
 * @param {number} gw       グリフ幅
 * @param {number} gh       グリフ高さ
 * @param {number} [cols=10]   シートの列数
 * @param {number} [offset=1]  シート先頭オフセット (px)
 * @returns {Promise<void>}
 */
export function switchFont(url, gw, gh, cols = 10, offset = 1) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // オフスクリーン canvas でピクセルデータを読み取る
      const offscreen = document.createElement("canvas");
      offscreen.width = img.width;
      offscreen.height = img.height;
      const offscreenCtx = offscreen.getContext("2d");
      offscreenCtx.drawImage(img, 0, 0);
      const data = offscreenCtx.getImageData(0, 0, img.width, img.height).data;

      const cellW = gw + 1;
      const cellH = gh + 1;

      for (let i = 0; i < CHAR_COUNT; i++) {
        const col = i % cols;
        const row = (i / cols) | 0;
        const ox = offset + col * cellW;
        const oy = offset + row * cellH;
        const buf = new Uint8Array(gw * gh);

        for (let gy = 0; gy < gh; gy++) {
          for (let gx = 0; gx < gw; gx++) {
            const srcIdx = ((oy + gy) * img.width + (ox + gx)) * 4;
            // R チャネル ≥ 128 なら前景とみなす
            buf[gy * gw + gx] = data[srcIdx] >= 128 ? 1 : 0;
          }
        }
        glyphs[i] = buf;
      }

      GLYPH_W = gw;
      GLYPH_H = gh;
      ready = true;
      resolve();
    };
    img.onerror = () => reject(new Error(`Failed to load font: ${url}`));
    img.src = url;
  });
}

// ── 描画 API ──

/**
 * 1文字を描画する。
 * @param {number} x   描画先 X
 * @param {number} y   描画先 Y
 * @param {string} ch  1文字
 * @param {number} c   描画色 (0 or 1)
 */
export function drawChar(x, y, ch, c) {
  if (!ready) return;
  const code = ch.charCodeAt(0);
  if (code < FIRST_CHAR || code > LAST_CHAR) return;
  const glyph = glyphs[code - FIRST_CHAR];
  if (glyph) blit(glyph, GLYPH_W, GLYPH_H, x, y, c);
}

/**
 * 指定文字のグリフビットマップを返す。
 * ascii_art.js 等で文字の塗り面積率 (density) を算出するために使用。
 *
 * @param {string} ch  1文字
 * @returns {Uint8Array|null}  GLYPH_W × GLYPH_H の 0/1 配列。未初期化 or 範囲外なら null
 */
export function getGlyph(ch) {
  if (!ready) return null;
  const code = ch.charCodeAt(0);
  if (code < FIRST_CHAR || code > LAST_CHAR) return null;
  return glyphs[code - FIRST_CHAR] || null;
}

/**
 * 文字列を描画する。1文字ごとに GLYPH_W+1 px ずつ右に進む (1px 字間)。
 * @param {number} x    描画先 X
 * @param {number} y    描画先 Y
 * @param {string} str  文字列
 * @param {number} c    描画色 (0 or 1)
 */
export function drawText(x, y, str, c) {
  if (!ready) return;
  const transformed =
    getTextTransform() === "uppercase" ? str.toUpperCase() : str;
  const step = GLYPH_W + 1; // 文字幅 + 字間1px
  for (let i = 0; i < transformed.length; i++) {
    drawChar(x + i * step, y, transformed[i], c);
  }
}

/**
 * 文字列のピクセル幅を返す。
 * 各グリフ GLYPH_W px + 1px 字間。末尾の字間は含まない。
 * @param {string} s  文字列
 * @returns {number}  描画幅 (px)。空文字なら 0
 */
export function textWidth(s) {
  return s.length > 0 ? s.length * (GLYPH_W + 1) - 1 : 0;
}

