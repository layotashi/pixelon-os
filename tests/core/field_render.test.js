/**
 * core/field_render.js — 共有「場 → 1-bit」レンダラのテスト。
 *
 * 「面」系モード（dither/hatch/halftone/braille）が純関数として正しく動くことを、
 * 手計算した小入力で固定する。
 */
import { describe, it, expect } from "vitest";
import { bayerBit, renderField } from "@/core/field_render.js";

describe("bayerBit", () => {
  it("2x2 Bayer の閾値で 0/1 を返す", () => {
    // BAYER2=[0,2,3,1], th=(v+0.5)/4 → (0,0)=.125 (1,0)=.625 (0,1)=.875 (1,1)=.375
    expect(bayerBit(2, 0, 0, 0.6)).toBe(1);
    expect(bayerBit(2, 1, 0, 0.6)).toBe(0);
    expect(bayerBit(2, 0, 1, 0.6)).toBe(0);
    expect(bayerBit(2, 1, 1, 0.6)).toBe(1);
  });
  it("無効サイズは 4x4 既定", () => {
    expect(bayerBit(3, 0, 0, 0.5)).toBe(bayerBit(4, 0, 0, 0.5));
  });
});

describe("renderField", () => {
  it("dither: 2x2 一様 0.6 → Bayer パターン", () => {
    const f = new Float32Array([0.6, 0.6, 0.6, 0.6]);
    const out = new Uint8Array(4);
    renderField(f, 2, 2, out, "dither", { ditherSize: 2 });
    expect(Array.from(out)).toEqual([1, 0, 0, 1]);
  });

  it("非 dither は out を 0 クリアしてから描く", () => {
    const f = new Float32Array(9); // 全 0
    const out = new Uint8Array(9).fill(1); // 事前に 1 で汚す
    renderField(f, 3, 3, out, "hatch", { hatchPitch: 4 });
    expect(Array.from(out).every((v) => v === 0)).toBe(true);
  });

  it("dither は全画素を書く（fill 不要）", () => {
    const f = new Float32Array([1, 1, 1, 1]); // 全 1 → 全閾値超え
    const out = new Uint8Array(4);
    renderField(f, 2, 2, out, "dither", { ditherSize: 4 });
    expect(Array.from(out)).toEqual([1, 1, 1, 1]);
  });
});
