/**
 * core/display_fx.js — 表示エフェクト (Vignette + Diagonal scanline) のテスト。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  rebuildLut,
  applyVramRgba,
  applyVignette,
  setDiagEnabled,
} from "@/core/display_fx.js";

const FG = [0x33, 0xff, 0x00]; // P1 Green
const BG = [0x00, 0x12, 0x00];

beforeEach(() => {
  setDiagEnabled(true);
  rebuildLut(FG, BG);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  applyVramRgba — 1:1 RGBA 展開
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyVramRgba", () => {
  it("出力サイズが VRAM と同じ (CELL 拡大なし)", () => {
    const w = 4,
      h = 3;
    const vram = new Uint8Array(w * h);
    const out = new Uint32Array(w * h);
    applyVramRgba(out, vram, w, h, 0);
    expect(out.length).toBe(w * h);
  });

  it("全消灯 VRAM に fg ドット色は含まれない", () => {
    const w = 4,
      h = 4;
    const vram = new Uint8Array(w * h);
    const out = new Uint32Array(w * h);
    applyVramRgba(out, vram, w, h, 0);
    const fgPacked = FG[0] | (FG[1] << 8) | (FG[2] << 16) | 0xff000000;
    for (let i = 0; i < out.length; i++) {
      expect(out[i] >>> 0).not.toBe(fgPacked >>> 0);
    }
  });

  it("全点灯 VRAM に bg ドット色は含まれない", () => {
    const w = 4,
      h = 4;
    const vram = new Uint8Array(w * h).fill(1);
    const out = new Uint32Array(w * h);
    applyVramRgba(out, vram, w, h, 0);
    const bgPacked = BG[0] | (BG[1] << 8) | (BG[2] << 16) | 0xff000000;
    for (let i = 0; i < out.length; i++) {
      expect(out[i] >>> 0).not.toBe(bgPacked >>> 0);
    }
  });

  it("VRAM 値 0 はドット位置で bg 色になる", () => {
    const w = 1,
      h = 1;
    const vram = new Uint8Array([0]);
    const out = new Uint32Array(1);
    // diagOff を 1000 にして dh[base]=0 (斜線なし) になる位置にする
    setDiagEnabled(false);
    rebuildLut(FG, BG);
    applyVramRgba(out, vram, w, h, 0);
    const bgPacked = (BG[0] | (BG[1] << 8) | (BG[2] << 16) | 0xff000000) >>> 0;
    expect(out[0] >>> 0).toBe(bgPacked);
  });

  it("VRAM 値 1 はドット位置で fg 色になる", () => {
    const w = 1,
      h = 1;
    const vram = new Uint8Array([1]);
    const out = new Uint32Array(1);
    setDiagEnabled(false);
    rebuildLut(FG, BG);
    applyVramRgba(out, vram, w, h, 0);
    const fgPacked = (FG[0] | (FG[1] << 8) | (FG[2] << 16) | 0xff000000) >>> 0;
    expect(out[0] >>> 0).toBe(fgPacked);
  });

  it("diagOff の変更で出力が変わる (Diagonal ON 時)", () => {
    const w = 16,
      h = 16;
    const vram = new Uint8Array(w * h).fill(1);
    const out1 = new Uint32Array(w * h);
    const out2 = new Uint32Array(w * h);
    applyVramRgba(out1, vram, w, h, 0);
    applyVramRgba(out2, vram, w, h, 3);
    let diffs = 0;
    for (let i = 0; i < out1.length; i++) {
      if (out1[i] !== out2[i]) diffs++;
    }
    expect(diffs).toBeGreaterThan(0);
  });

  it("Diagonal OFF 時は diagOff を変えても出力が変わらない", () => {
    setDiagEnabled(false);
    rebuildLut(FG, BG);
    const w = 16,
      h = 16;
    const vram = new Uint8Array(w * h).fill(1);
    const out1 = new Uint32Array(w * h);
    const out2 = new Uint32Array(w * h);
    applyVramRgba(out1, vram, w, h, 0);
    applyVramRgba(out2, vram, w, h, 7);
    for (let i = 0; i < out1.length; i++) {
      expect(out1[i]).toBe(out2[i]);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  applyVignette
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyVignette", () => {
  it("中心付近のピクセルは変化しない", () => {
    const w = 101,
      h = 101;
    const pixels = new Uint8Array(w * h * 4);
    const cx = 50,
      cy = 50;
    const idx = (cy * w + cx) * 4;
    pixels[idx] = 255;
    pixels[idx + 1] = 255;
    pixels[idx + 2] = 255;
    pixels[idx + 3] = 255;
    applyVignette(pixels, w, h);
    expect(pixels[idx]).toBe(255);
    expect(pixels[idx + 1]).toBe(255);
    expect(pixels[idx + 2]).toBe(255);
  });

  it("角のピクセルは暗化される", () => {
    const w = 100,
      h = 100;
    const pixels = new Uint8Array(w * h * 4);
    for (const [x, y] of [
      [0, 0],
      [99, 0],
      [0, 99],
      [99, 99],
    ]) {
      const idx = (y * w + x) * 4;
      pixels[idx] = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
      pixels[idx + 3] = 255;
    }
    applyVignette(pixels, w, h);
    for (const [x, y] of [
      [0, 0],
      [99, 0],
      [0, 99],
      [99, 99],
    ]) {
      const idx = (y * w + x) * 4;
      expect(pixels[idx]).toBeLessThan(255);
    }
  });

  it("アルファチャンネルは変更されない", () => {
    const w = 10,
      h = 10;
    const pixels = new Uint8Array(w * h * 4);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    applyVignette(pixels, w, h);
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  rebuildLut (パレット切替)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("rebuildLut", () => {
  it("パレット変更に追従する", () => {
    const w = 2,
      h = 2;
    const vram = new Uint8Array(w * h).fill(1);
    const out1 = new Uint32Array(w * h);
    rebuildLut(FG, BG);
    applyVramRgba(out1, vram, w, h, 0);

    const newFg = [0xff, 0x00, 0x00];
    const newBg = [0x00, 0x00, 0xff];
    rebuildLut(newFg, newBg);
    const out2 = new Uint32Array(w * h);
    applyVramRgba(out2, vram, w, h, 0);

    let diffs = 0;
    for (let i = 0; i < out1.length; i++) {
      if (out1[i] !== out2[i]) diffs++;
    }
    expect(diffs).toBeGreaterThan(0);
  });
});
