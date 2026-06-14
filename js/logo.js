/**
 * @module logo
 * logo.js — 製品ロゴ管理・描画
 *
 * assets/logo/logo.png から製品ロゴを読み込み、
 * 1-bit ビットマップとして描画する。
 *
 * PNG 仕様:
 *   - 白ピクセル (R≥128) = 前景、黒ピクセル = 透過
 *   - サイズ: PNG から動的に取得 (LOGO_WIDTH × LOGO_HEIGHT)
 */

import { blit } from "./core/gpu.js";

// ── ロゴパラメータ (initLogo で PNG から自動設定) ──

/** ロゴ幅 (px) — initLogo 後に確定 */
export let LOGO_WIDTH = 0;

/** ロゴ高さ (px) — initLogo 後に確定 */
export let LOGO_HEIGHT = 0;

// ── 内部状態 ──

/** ロゴビットマップ: Uint8Array(LOGO_WIDTH * LOGO_HEIGHT) */
let logoBits = null;

/** 初期化完了フラグ */
let ready = false;

// ── 初期化 ──

/**
 * ロゴ PNG を読み込みビットマップを構築する。
 * LOGO_WIDTH / LOGO_HEIGHT は PNG の実サイズから自動設定される。
 * @param {string} [url="./assets/logo/logo.png"]
 * @returns {Promise<void>}
 */
export function initLogo(url = "./assets/logo/logo.png") {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      LOGO_WIDTH = w;
      LOGO_HEIGHT = h;

      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;

      const buf = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          buf[y * w + x] = data[idx] >= 128 ? 1 : 0;
        }
      }

      logoBits = buf;
      ready = true;
      resolve();
    };
    img.onerror = () => reject(new Error(`Failed to load logo: ${url}`));
    img.src = url;
  });
}

// ── 描画 API ──

/**
 * ロゴを描画する。
 * @param {number} x  描画先 X (左上)
 * @param {number} y  描画先 Y (左上)
 * @param {number} [c=1] 描画色 (0 or 1)
 */
export function drawLogo(x, y, c = 1) {
  if (!ready || !logoBits) return;
  blit(logoBits, LOGO_WIDTH, LOGO_HEIGHT, x, y, c);
}

