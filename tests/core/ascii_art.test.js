/**
 * core/ascii_art.js — ASCII Art 変換エンジンのテスト
 *
 * tone ramp 構築、density 計算、RGBA→文字変換、サイズ算出を検証。
 * font.js のグリフデータは DOM (Image/Canvas) に依存するため、
 * テスト用の合成ランプを使用して純粋なロジックを検証する。
 */
import { describe, it, expect } from "vitest";
import {
  calcDensity,
  calcAsciiSize,
  findNearest,
  asciiRGBA,
  getRampString,
  CELL_W,
  CELL_H,
} from "@/core/ascii_art.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  calcDensity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("calcDensity", () => {
  it("全ゼログリフ → density 0", () => {
    const glyph = new Uint8Array(35); // 5×7 全ゼロ
    expect(calcDensity(glyph)).toBe(0);
  });

  it("全 1 グリフ → density 1", () => {
    const glyph = new Uint8Array(35).fill(1);
    expect(calcDensity(glyph)).toBe(1);
  });

  it("半分塗り → density ≈ 0.5", () => {
    const glyph = new Uint8Array(20); // 長さ 20
    glyph.fill(1, 0, 10); // 10 個が 1
    expect(calcDensity(glyph)).toBe(0.5);
  });

  it("1 ピクセルだけ塗り → density = 1/35", () => {
    const glyph = new Uint8Array(35);
    glyph[0] = 1;
    expect(calcDensity(glyph)).toBeCloseTo(1 / 35, 10);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  findNearest
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("findNearest", () => {
  const ramp = [
    { ch: " ", density: 0.0 },
    { ch: ".", density: 0.1 },
    { ch: ":", density: 0.2 },
    { ch: "+", density: 0.4 },
    { ch: "#", density: 0.7 },
    { ch: "@", density: 1.0 },
  ];

  it("density 0 → 最も疎な文字 (スペース)", () => {
    expect(findNearest(ramp, 0.0)).toBe(" ");
  });

  it("density 1 → 最も密な文字 (@)", () => {
    expect(findNearest(ramp, 1.0)).toBe("@");
  });

  it("density 0.05 → 等距離のため高密度側 (.)", () => {
    // 0.05 は 0.0 と 0.1 の中間。等距離時は高密度側を返す
    expect(findNearest(ramp, 0.05)).toBe(".");
  });

  it("density 0.09 → . が最近傍", () => {
    expect(findNearest(ramp, 0.09)).toBe(".");
  });

  it("density 0.55 → + と # の等距離 → 高密度側 (#)", () => {
    // 0.55 は 0.4 と 0.7 の中間。等距離時は高密度側を返す
    expect(findNearest(ramp, 0.55)).toBe("#");
  });

  it("density 0.56 → # が最近傍", () => {
    expect(findNearest(ramp, 0.56)).toBe("#");
  });

  it("ランプが 1 要素 → 常にその文字", () => {
    const single = [{ ch: "X", density: 0.5 }];
    expect(findNearest(single, 0.0)).toBe("X");
    expect(findNearest(single, 1.0)).toBe("X");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  getRampString
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getRampString", () => {
  it("ランプの文字を連結した文字列を返す", () => {
    const ramp = [
      { ch: " ", density: 0 },
      { ch: ".", density: 0.1 },
      { ch: "@", density: 1.0 },
    ];
    expect(getRampString(ramp)).toBe(" .@");
  });

  it("空ランプ → 空文字列", () => {
    expect(getRampString([])).toBe("");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  calcAsciiSize
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("calcAsciiSize", () => {
  it("正方形画像 → 文字セルのアスペクト比を考慮", () => {
    // 100×100 の画像、最大 40×40
    // cellAspect = 6/8 = 0.75
    // adjustedAspect = (100/100) / 0.75 = 1.333...
    // rows が制約 → rows=40, cols=round(40*1.333)=53 → clamp to 40
    // cols が制約 → cols=40, rows=round(40/1.333)=30
    const { cols, rows } = calcAsciiSize(100, 100, 40, 40);
    expect(cols).toBe(40);
    expect(rows).toBe(30);
  });

  it("横長画像 → cols が制約になる", () => {
    const { cols, rows } = calcAsciiSize(200, 100, 40, 30);
    // adjustedAspect = (200/100) / 0.75 = 2.667
    // adjustedAspect * maxRows = 2.667 * 30 = 80 > 40 → cols が制約
    // cols=40, rows=round(40/2.667)=15
    expect(cols).toBe(40);
    expect(rows).toBe(15);
  });

  it("縦長画像 → rows が制約になる", () => {
    const { cols, rows } = calcAsciiSize(100, 200, 40, 30);
    // adjustedAspect = (100/200) / 0.75 = 0.667
    // adjustedAspect * maxRows = 0.667 * 30 = 20 <= 40 → rows が制約
    // rows=30, cols=round(30*0.667)=20
    expect(cols).toBe(20);
    expect(rows).toBe(30);
  });

  it("最小値は 1×1", () => {
    const { cols, rows } = calcAsciiSize(1, 1000, 1, 1);
    expect(cols).toBeGreaterThanOrEqual(1);
    expect(rows).toBeGreaterThanOrEqual(1);
  });

  it("結果が maxCols, maxRows を超えない", () => {
    const { cols, rows } = calcAsciiSize(1000, 1, 20, 20);
    expect(cols).toBeLessThanOrEqual(20);
    expect(rows).toBeLessThanOrEqual(20);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  asciiRGBA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("asciiRGBA", () => {
  // テスト用ランプ (3 段階)
  const testRamp = [
    { ch: " ", density: 0.0 },
    { ch: "+", density: 0.5 },
    { ch: "@", density: 1.0 },
  ];

  /**
   * 単色 RGBA データを生成する。
   * @param {number} w  幅
   * @param {number} h  高さ
   * @param {number} r  赤 (0–255)
   * @param {number} g  緑 (0–255)
   * @param {number} b  青 (0–255)
   * @returns {Uint8ClampedArray}
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

  it("全黒画像 → 最も疎 (スペース)", () => {
    const rgba = solidRGBA(4, 4, 0, 0, 0);
    const lines = asciiRGBA(rgba, 4, 4, 2, 2, { ramp: testRamp });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("  ");
    expect(lines[1]).toBe("  ");
  });

  it("全白画像 → 最も密 (@)", () => {
    const rgba = solidRGBA(4, 4, 255, 255, 255);
    const lines = asciiRGBA(rgba, 4, 4, 2, 2, { ramp: testRamp });
    expect(lines[0]).toBe("@@");
    expect(lines[1]).toBe("@@");
  });

  it("invert=true → 全白が反転してスペースになる", () => {
    const rgba = solidRGBA(4, 4, 255, 255, 255);
    const lines = asciiRGBA(rgba, 4, 4, 2, 2, {
      ramp: testRamp,
      invert: true,
    });
    expect(lines[0]).toBe("  ");
  });

  it("水平グラデーション → 左が暗く右が明るい", () => {
    // 4px 幅, 1px 高さ。左:黒, 右:白
    const w = 4;
    const h = 1;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let x = 0; x < w; x++) {
      const v = (x / (w - 1)) * 255;
      rgba[x * 4] = v;
      rgba[x * 4 + 1] = v;
      rgba[x * 4 + 2] = v;
      rgba[x * 4 + 3] = 255;
    }
    // 2 列 × 1 行: 左ブロック (0,1) = 暗, 右ブロック (2,3) = 明
    const lines = asciiRGBA(rgba, w, h, 2, 1, {
      ramp: testRamp,
      low: 0,
      high: 100,
    });
    expect(lines).toHaveLength(1);
    // 左は暗い (スペースまたは +), 右は明るい (@ または +)
    const left = lines[0][0];
    const right = lines[0][1];
    expect(testRamp.findIndex((e) => e.ch === left)).toBeLessThan(
      testRamp.findIndex((e) => e.ch === right),
    );
  });

  it("出力サイズが cols × rows と一致する", () => {
    const rgba = solidRGBA(10, 10, 128, 128, 128);
    const lines = asciiRGBA(rgba, 10, 10, 5, 3, { ramp: testRamp });
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toHaveLength(5);
    }
  });

  it("空ランプ → 全スペース", () => {
    const rgba = solidRGBA(4, 4, 128, 128, 128);
    const lines = asciiRGBA(rgba, 4, 4, 2, 2, { ramp: [] });
    expect(lines[0]).toBe("  ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数エクスポート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("constants", () => {
  it("CELL_W = GLYPH_W + 1 = 6", () => {
    expect(CELL_W).toBe(6);
  });

  it("CELL_H = GLYPH_H + 1 = 8", () => {
    expect(CELL_H).toBe(8);
  });
});
