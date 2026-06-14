/**
 * core/pbm.js — PBM P1 エンコード / デコードのテスト
 */
import { describe, it, expect } from "vitest";
import { encodePBM, decodePBM } from "@/core/pbm.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  encodePBM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("encodePBM", () => {
  it("2×2 の白黒パターンをエンコードできる", () => {
    const buf = new Uint8Array([1, 0, 0, 1]);
    const text = encodePBM(buf, 2, 2);
    expect(text).toBe("P1\n2 2\n1 0\n0 1\n");
  });

  it("1×1 (単一ピクセル) をエンコードできる", () => {
    const buf = new Uint8Array([0]);
    const text = encodePBM(buf, 1, 1);
    expect(text).toBe("P1\n1 1\n0\n");
  });

  it("3×1 (横一列) をエンコードできる", () => {
    const buf = new Uint8Array([1, 1, 0]);
    const text = encodePBM(buf, 3, 1);
    expect(text).toBe("P1\n3 1\n1 1 0\n");
  });

  it("全黒バッファをエンコードできる", () => {
    const buf = new Uint8Array([1, 1, 1, 1]);
    const text = encodePBM(buf, 2, 2);
    expect(text).toBe("P1\n2 2\n1 1\n1 1\n");
  });

  it("全白バッファをエンコードできる", () => {
    const buf = new Uint8Array([0, 0, 0, 0]);
    const text = encodePBM(buf, 2, 2);
    expect(text).toBe("P1\n2 2\n0 0\n0 0\n");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  decodePBM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("decodePBM", () => {
  it("2×2 の PBM をデコードできる", () => {
    const text = "P1\n2 2\n1 0\n0 1\n";
    const result = decodePBM(text);
    expect(result).not.toBeNull();
    expect(result.w).toBe(2);
    expect(result.h).toBe(2);
    expect(Array.from(result.buf)).toEqual([1, 0, 0, 1]);
  });

  it("コメント付き PBM をデコードできる", () => {
    const text = "P1\n# comment\n2 2\n1 0\n0 1\n";
    const result = decodePBM(text);
    expect(result).not.toBeNull();
    expect(result.w).toBe(2);
    expect(result.h).toBe(2);
    expect(Array.from(result.buf)).toEqual([1, 0, 0, 1]);
  });

  it("マジックナンバーが不正なら null を返す", () => {
    expect(decodePBM("P2\n2 2\n0 0 0 0")).toBeNull();
    expect(decodePBM("")).toBeNull();
    expect(decodePBM("hello")).toBeNull();
  });

  it("サイズが不正なら null を返す", () => {
    expect(decodePBM("P1\n0 2\n")).toBeNull();
    expect(decodePBM("P1\n-1 2\n")).toBeNull();
    expect(decodePBM("P1\nabc def\n")).toBeNull();
  });

  it("空白区切りの柔軟なフォーマットを受け付ける", () => {
    // タブ/複数スペース/改行が混在
    const text = "P1  3\t1\n1  0  1";
    const result = decodePBM(text);
    expect(result).not.toBeNull();
    expect(result.w).toBe(3);
    expect(result.h).toBe(1);
    expect(Array.from(result.buf)).toEqual([1, 0, 1]);
  });

  it("ピクセルデータが足りない場合は 0 で埋められる", () => {
    // 2×2 だが 3px 分しかない
    const text = "P1\n2 2\n1 0 1";
    const result = decodePBM(text);
    expect(result).not.toBeNull();
    expect(result.w).toBe(2);
    expect(result.h).toBe(2);
    // 不足分は Uint8Array のデフォルト値 0
    expect(Array.from(result.buf)).toEqual([1, 0, 1, 0]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ラウンドトリップ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PBM roundtrip", () => {
  it("エンコード → デコードで元データを復元できる", () => {
    const w = 4;
    const h = 3;
    const original = new Uint8Array([1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0]);
    const text = encodePBM(original, w, h);
    const result = decodePBM(text);
    expect(result).not.toBeNull();
    expect(result.w).toBe(w);
    expect(result.h).toBe(h);
    expect(Array.from(result.buf)).toEqual(Array.from(original));
  });

  it("大きなバッファ (128×96) でもラウンドトリップが成立する", () => {
    const w = 128;
    const h = 96;
    const original = new Uint8Array(w * h);
    // チェッカーボードパターン
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        original[y * w + x] = (x + y) % 2;
      }
    }
    const text = encodePBM(original, w, h);
    const result = decodePBM(text);
    expect(result).not.toBeNull();
    expect(result.w).toBe(w);
    expect(result.h).toBe(h);
    expect(Array.from(result.buf)).toEqual(Array.from(original));
  });
});

