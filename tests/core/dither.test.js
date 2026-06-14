/**
 * core/dither.js — ディザリングエンジンのテスト
 *
 * Bayer ディザ行列の正当性、ditherRGBA の入出力を検証。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  BAYER_4x4,
  BAYER_8x8,
  setDitherMode,
  getDitherMode,
  setPreprocessParams,
  getPreprocessParams,
  ditherRGBA,
} from "@/core/dither.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Bayer 行列の妥当性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("BAYER_4x4", () => {
  it("4×4 行列である", () => {
    expect(BAYER_4x4).toHaveLength(4);
    for (const row of BAYER_4x4) {
      expect(row).toHaveLength(4);
    }
  });

  it("0–15 の値を重複なく含む", () => {
    const flat = BAYER_4x4.flat();
    const sorted = [...flat].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });
});

describe("BAYER_8x8", () => {
  it("8×8 行列である", () => {
    expect(BAYER_8x8).toHaveLength(8);
    for (const row of BAYER_8x8) {
      expect(row).toHaveLength(8);
    }
  });

  it("0–63 の値を重複なく含む", () => {
    const flat = BAYER_8x8.flat();
    const sorted = [...flat].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 64 }, (_, i) => i));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ディザモード
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ditherMode", () => {
  beforeEach(() => {
    setDitherMode("bayer4"); // リセット
  });

  it("デフォルトは bayer4", () => {
    expect(getDitherMode()).toBe("bayer4");
  });

  it("bayer8 に切り替えられる", () => {
    setDitherMode("bayer8");
    expect(getDitherMode()).toBe("bayer8");
  });

  it("無効なモードは無視される", () => {
    setDitherMode("invalid");
    expect(getDitherMode()).toBe("bayer4");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  前処理パラメータ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("preprocessParams", () => {
  beforeEach(() => {
    setPreprocessParams({ low: 1, high: 99, gamma: 1 }); // リセット
  });

  it("デフォルト値を返す", () => {
    const p = getPreprocessParams();
    expect(p.low).toBe(1);
    expect(p.high).toBe(99);
    expect(p.gamma).toBe(1);
  });

  it("個別に設定できる", () => {
    setPreprocessParams({ low: 5 });
    expect(getPreprocessParams().low).toBe(5);
    expect(getPreprocessParams().high).toBe(99); // 変わらない
  });

  it("low のクランプ (0–50)", () => {
    setPreprocessParams({ low: -10 });
    expect(getPreprocessParams().low).toBe(0);
    setPreprocessParams({ low: 60 });
    expect(getPreprocessParams().low).toBe(50);
  });

  it("high のクランプ (50–100)", () => {
    setPreprocessParams({ high: 30 });
    expect(getPreprocessParams().high).toBe(50);
    setPreprocessParams({ high: 200 });
    expect(getPreprocessParams().high).toBe(100);
  });

  it("gamma のクランプ (0.5–2.0)", () => {
    setPreprocessParams({ gamma: 0.1 });
    expect(getPreprocessParams().gamma).toBe(0.5);
    setPreprocessParams({ gamma: 5 });
    expect(getPreprocessParams().gamma).toBe(2.0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ditherRGBA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ditherRGBA", () => {
  beforeEach(() => {
    setDitherMode("bayer4");
    setPreprocessParams({ low: 0, high: 100, gamma: 1 });
  });

  /**
   * ソリッドカラーの RGBA 画像データを生成。
   * @param {number} w 幅
   * @param {number} h 高さ
   * @param {number} r 赤 (0–255)
   * @param {number} g 緑 (0–255)
   * @param {number} b 青 (0–255)
   */
  function solidRGBA(w, h, r, g, b) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    return data;
  }

  /**
   * グラデーション RGBA 画像データを生成 (左端が黒、右端が白)。
   * @param {number} w 幅
   * @param {number} h 高さ
   */
  function gradientRGBA(w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = Math.round((x / (w - 1)) * 255);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    return data;
  }

  it("出力サイズが destW × destH", () => {
    const rgba = gradientRGBA(8, 8);
    const out = ditherRGBA(rgba, 8, 8, 8, 8);
    expect(out).toHaveLength(64);
  });

  it("真っ白 (255,255,255) → 全て 1", () => {
    const rgba = solidRGBA(4, 4, 255, 255, 255);
    const out = ditherRGBA(rgba, 4, 4, 4, 4);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBe(1);
    }
  });

  it("真っ黒 (0,0,0) → 全て 0", () => {
    const rgba = solidRGBA(4, 4, 0, 0, 0);
    const out = ditherRGBA(rgba, 4, 4, 4, 4);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBe(0);
    }
  });

  it("グラデーション画像はディザパターンを生成 (0 と 1 が混在)", () => {
    const rgba = gradientRGBA(16, 16);
    const out = ditherRGBA(rgba, 16, 16, 16, 16);
    const ones = Array.from(out).filter((v) => v === 1).length;
    const zeros = Array.from(out).filter((v) => v === 0).length;
    expect(ones).toBeGreaterThan(0);
    expect(zeros).toBeGreaterThan(0);
    expect(ones + zeros).toBe(256);
  });

  it("出力値が 0 または 1 のみ", () => {
    const rgba = solidRGBA(16, 16, 100, 150, 200);
    const out = ditherRGBA(rgba, 16, 16, 16, 16);
    for (let i = 0; i < out.length; i++) {
      expect(out[i] === 0 || out[i] === 1).toBe(true);
    }
  });

  it("既存バッファに書き込める", () => {
    const rgba = solidRGBA(4, 4, 255, 255, 255);
    const buf = new Uint8Array(16);
    const out = ditherRGBA(rgba, 4, 4, 4, 4, buf);
    expect(out).toBe(buf); // 同じ参照
    expect(buf[0]).toBe(1);
  });

  it("ソースとデストのサイズが異なる場合 (リサイズ)", () => {
    const rgba = solidRGBA(16, 16, 200, 200, 200);
    const out = ditherRGBA(rgba, 16, 16, 8, 8);
    expect(out).toHaveLength(64);
  });

  it("bayer8 でもディザリングが動作する", () => {
    setDitherMode("bayer8");
    const rgba = gradientRGBA(16, 16);
    const out = ditherRGBA(rgba, 16, 16, 16, 16);
    expect(out).toHaveLength(256);
    const ones = Array.from(out).filter((v) => v === 1).length;
    expect(ones).toBeGreaterThan(0);
    expect(ones).toBeLessThan(256);
  });

  it("明るい画像ほど 1 が多い", () => {
    // 2色の横割り画像: 上半分が暗い、下半分が明るい
    const w = 16,
      h = 16;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = y < h / 2 ? 40 : 220;
        rgba[i] = v;
        rgba[i + 1] = v;
        rgba[i + 2] = v;
        rgba[i + 3] = 255;
      }
    }
    const out = ditherRGBA(rgba, w, h, w, h);
    let darkOnes = 0,
      brightOnes = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (out[y * w + x] === 1) {
          if (y < h / 2) darkOnes++;
          else brightOnes++;
        }
      }
    }
    expect(brightOnes).toBeGreaterThan(darkOnes);
  });

  it("ガンマ補正が結果に影響する", () => {
    const rgba = gradientRGBA(16, 16);

    setPreprocessParams({ low: 0, high: 100, gamma: 0.5 });
    const outLowGamma = ditherRGBA(rgba, 16, 16, 16, 16);
    const countLow = Array.from(outLowGamma).filter((v) => v === 1).length;

    setPreprocessParams({ low: 0, high: 100, gamma: 2.0 });
    const outHighGamma = ditherRGBA(rgba, 16, 16, 16, 16);
    const countHigh = Array.from(outHighGamma).filter((v) => v === 1).length;

    // 実装は invGamma = 1/gamma で v**invGamma を計算する
    // gamma < 1 → invGamma > 1 → 暗くなる (1 が減る)
    // gamma > 1 → invGamma < 1 → 明るくなる (1 が増える)
    expect(countHigh).toBeGreaterThan(countLow);
  });
});

