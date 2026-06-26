/**
 * core/art_export.js — 出力パイプラインの純関数（合成・再標本化）のテスト。
 *
 * DOM/Canvas を使う downloadPng / exportVideo は実機（headless）で検証する。
 * ここでは「art → base 中央合成（額縁マット）」と「NN 再標本化」を手計算で固定する。
 */
import { describe, it, expect } from "vitest";
import { composeMatte, resampleNN } from "@/core/art_export.js";

describe("composeMatte", () => {
  it("art を base 中央へ配置し周囲は 0（額縁）", () => {
    // 2x2 の art を 4x4 base へ → 各辺 1px マット
    const art = new Uint8Array([1, 1, 1, 1]);
    const out = composeMatte(art, 2, 2, 4, 4);
    // 中央 2x2 が 1、周囲 0
    expect(Array.from(out)).toEqual([
      0, 0, 0, 0,
      0, 1, 1, 0,
      0, 1, 1, 0,
      0, 0, 0, 0,
    ]);
  });

  it("マット 0（同寸）はそのまま", () => {
    const art = new Uint8Array([1, 0, 0, 1]);
    const out = composeMatte(art, 2, 2, 2, 2);
    expect(Array.from(out)).toEqual([1, 0, 0, 1]);
  });

  it("非正方（横長）も上下左右対称に中央寄せ", () => {
    // 2x1 art → 4x3 base: x0=(4-2)/2=1, y0=(3-1)/2=1
    const art = new Uint8Array([1, 1]);
    const out = composeMatte(art, 2, 1, 4, 3);
    expect(Array.from(out)).toEqual([
      0, 0, 0, 0,
      0, 1, 1, 0,
      0, 0, 0, 0,
    ]);
  });
});

describe("resampleNN", () => {
  it("同寸はそのまま返す（参照同一）", () => {
    const src = new Uint8Array([1, 0, 0, 1]);
    expect(resampleNN(src, 2, 2, 2, 2)).toBe(src);
  });

  it("2x2 → 4x4 は各ピクセルを 2x2 に複製", () => {
    const src = new Uint8Array([1, 0, 0, 1]);
    const out = resampleNN(src, 2, 2, 4, 4);
    expect(Array.from(out)).toEqual([
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 1, 1,
      0, 0, 1, 1,
    ]);
  });

  it("4x4 → 2x2 は最近傍で間引く", () => {
    // src 行0: 1 2 3 4 風 → NN で (0,0)=src[0], (1,0)=src[2]
    const src = new Uint8Array([
      1, 0, 0, 1,
      0, 0, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0,
    ]);
    const out = resampleNN(src, 4, 4, 2, 2);
    // y=0→sy=0 行: x=0→sx0=src[0]=1, x=1→sx2=src[2]=0
    // y=1→sy=2 行: x=0→src[8]=1, x=1→src[10]=0
    expect(Array.from(out)).toEqual([1, 0, 1, 0]);
  });
});
