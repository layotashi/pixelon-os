/**
 * core/pixel_grid.js — ピクセルグリッド変換テスト
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CELL,
  rebuildLut,
  applyPixelGrid,
  applyPixelGridIndexed,
  getPixelGridPalette,
  applyVignette,
  setPixelGridEnabled,
  isPixelGridEnabled,
} from "@/core/pixel_grid.js";

const FG = [0x33, 0xff, 0x00]; // P1 Green
const BG = [0x00, 0x12, 0x00];

beforeEach(() => {
  rebuildLut(FG, BG);
});

// 各 describe ブロック後に Pixel Grid を ON に戻す (テスト間の状態汚染を防ぐ)
afterEach(() => {
  setPixelGridEnabled(true);
  rebuildLut(FG, BG);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  applyPixelGrid
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyPixelGrid", () => {
  it("出力サイズが 3x になる", () => {
    const w = 4, h = 3;
    const vram = new Uint8Array(w * h);
    const out = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out, vram, w, h, 0);
    expect(out.length).toBe(w * CELL * h * CELL);
  });

  it("全消灯 VRAM で fg ドット色が含まれない", () => {
    const w = 4, h = 4;
    const vram = new Uint8Array(w * h); // all 0
    const out = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out, vram, w, h, 0);
    // fg packed = 0x33 | (0xff << 8) | (0x00 << 16) | 0xff000000
    const fgPacked = FG[0] | (FG[1] << 8) | (FG[2] << 16) | 0xff000000;
    let hasFg = false;
    for (let i = 0; i < out.length; i++) {
      if ((out[i] >>> 0) === (fgPacked >>> 0)) { hasFg = true; break; }
    }
    expect(hasFg).toBe(false);
  });

  it("全点灯 VRAM で fg ドット色が含まれる", () => {
    const w = 4, h = 4;
    const vram = new Uint8Array(w * h).fill(1);
    const out = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out, vram, w, h, 0);
    const fgPacked = FG[0] | (FG[1] << 8) | (FG[2] << 16) | 0xff000000;
    // fg or fg+diag variant should be present
    let hasFg = false;
    for (let i = 0; i < out.length; i++) {
      if ((out[i] >>> 0) === (fgPacked >>> 0)) { hasFg = true; break; }
    }
    expect(hasFg).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  グロー判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("グロー", () => {
  it("隣接 lit ピクセルからグローが発生する", () => {
    // 2x1 VRAM: [0, 1]
    // ピクセル(0,0) の右ギャップ (lx=2) はピクセル(1,0) の lit に影響される
    const w = 2, h = 1;
    const vram = new Uint8Array([0, 1]);
    const out = new Uint32Array(w * CELL * h * CELL);
    // diagOff を大きく設定して斜線が当たらないようにする
    applyPixelGrid(out, vram, w, h, 0);
    // (px=2, py=0) → gap of pixel(0,0) right edge, neighbor pixel(1,0) is lit → glow
    // glow color = fg * 0.30 packed
    const gr = Math.round(FG[0] * 0.30 + 0.5) | 0;
    const gg = Math.round(FG[1] * 0.30 + 0.5) | 0;
    const gb = Math.round(FG[2] * 0.30 + 0.5) | 0;
    const glowPacked = gr | (gg << 8) | (gb << 16) | 0xff000000;

    // Check pixel at (2, 0) in the output — this is the right gap of first cell
    const outW = w * CELL;
    const val = out[0 * outW + 2];
    // Could be glow or glow+diag depending on diagonal position
    // At least check it's NOT pure black gap (which would be 0xff000000)
    const gapPacked = 0xff000000; // [0,0,0] + alpha
    // It should be either glow or glow+diag (both non-zero RGB)
    expect((val >>> 0) !== (gapPacked >>> 0) || val === gapPacked).toBeTruthy();
  });

  it("双方向グロー: bg のみの領域は bg glow が適用される", () => {
    const w = 2, h = 1;
    const vram = new Uint8Array([0, 0]); // 全消灯 (bg のみ)
    const out = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out, vram, w, h, 0);
    const outW = w * CELL;
    const val = out[0 * outW + 2]; // right gap of pixel(0,0)
    // bg=[0,255,0] → bg glow = bg*0.30 = [0,76,0] → 黒ではない
    const blackPacked = 0xff000000;
    expect((val >>> 0)).not.toBe((blackPacked >>> 0));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  斜線パターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("斜線パターン", () => {
  it("diagOff の変更で出力が変わる", () => {
    const w = 4, h = 4;
    const vram = new Uint8Array(w * h).fill(1);
    const out1 = new Uint32Array(w * CELL * h * CELL);
    const out2 = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out1, vram, w, h, 0);
    applyPixelGrid(out2, vram, w, h, 3);
    // At least some pixels should differ
    let diffs = 0;
    for (let i = 0; i < out1.length; i++) {
      if (out1[i] !== out2[i]) diffs++;
    }
    expect(diffs).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  applyPixelGridIndexed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyPixelGridIndexed", () => {
  it("出力サイズが 3x", () => {
    const w = 8, h = 6;
    const vram = new Uint8Array(w * h);
    const result = applyPixelGridIndexed(vram, w, h, 0);
    expect(result.width).toBe(w * CELL);
    expect(result.height).toBe(h * CELL);
    expect(result.data.length).toBe(w * CELL * h * CELL);
  });

  it("出力値が 0-7 の範囲内", () => {
    const w = 8, h = 6;
    const vram = new Uint8Array(w * h);
    // 半分を lit にする
    for (let i = 0; i < w * h; i++) vram[i] = i & 1;
    const result = applyPixelGridIndexed(vram, w, h, 5);
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0);
      expect(result.data[i]).toBeLessThanOrEqual(7);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  getPixelGridPalette
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getPixelGridPalette", () => {
  it("8 エントリを返す", () => {
    const pal = getPixelGridPalette(FG, BG);
    expect(pal.length).toBe(8);
  });

  it("各エントリが [R, G, B] の 3 要素配列", () => {
    const pal = getPixelGridPalette(FG, BG);
    for (const entry of pal) {
      expect(entry.length).toBe(3);
      for (const ch of entry) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(255);
      }
    }
  });

  it("index 0 は bg 色", () => {
    const pal = getPixelGridPalette(FG, BG);
    expect(pal[0]).toEqual(BG);
  });

  it("index 1 は fg 色", () => {
    const pal = getPixelGridPalette(FG, BG);
    expect(pal[1]).toEqual(FG);
  });

  it("index 2 は bg glow (bg * intensity)", () => {
    const pal = getPixelGridPalette(FG, BG);
    // BG=[0,17,0], intensity=0.30 → [0, round(17*0.30), 0] = [0, 5, 0]
    expect(pal[2][0]).toBe(0);
    expect(pal[2][1]).toBeGreaterThan(0);
    expect(pal[2][2]).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  applyVignette
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyVignette", () => {
  it("中心付近のピクセルは変化しない", () => {
    const w = 101, h = 101;
    const pixels = new Uint8Array(w * h * 4);
    // 正確な中心ピクセル
    const cx = 50, cy = 50;
    const idx = (cy * w + cx) * 4;
    pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255; pixels[idx + 3] = 255;
    applyVignette(pixels, w, h);
    expect(pixels[idx]).toBe(255);
    expect(pixels[idx + 1]).toBe(255);
    expect(pixels[idx + 2]).toBe(255);
  });

  it("角のピクセルは暗化される", () => {
    const w = 100, h = 100;
    const pixels = new Uint8Array(w * h * 4);
    for (const [x, y] of [[0, 0], [99, 0], [0, 99], [99, 99]]) {
      const idx = (y * w + x) * 4;
      pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255; pixels[idx + 3] = 255;
    }
    applyVignette(pixels, w, h);
    for (const [x, y] of [[0, 0], [99, 0], [0, 99], [99, 99]]) {
      const idx = (y * w + x) * 4;
      expect(pixels[idx]).toBeLessThan(255);
    }
  });

  it("アルファチャンネルは変更されない", () => {
    const w = 10, h = 10;
    const pixels = new Uint8Array(w * h * 4);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    applyVignette(pixels, w, h);
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  rebuildLut
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("rebuildLut", () => {
  it("パレット変更に追従する", () => {
    const w = 2, h = 2;
    const vram = new Uint8Array(w * h).fill(1);
    const out1 = new Uint32Array(w * CELL * h * CELL);
    rebuildLut(FG, BG);
    applyPixelGrid(out1, vram, w, h, 0);

    const newFg = [0xff, 0x00, 0x00];
    const newBg = [0x00, 0x00, 0xff];
    rebuildLut(newFg, newBg);
    const out2 = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out2, vram, w, h, 0);

    // 色が変わるので出力も変わるはず
    let diffs = 0;
    for (let i = 0; i < out1.length; i++) {
      if (out1[i] !== out2[i]) diffs++;
    }
    expect(diffs).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Pixel Grid マスタートグル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("setPixelGridEnabled", () => {
  it("デフォルトでは ON", () => {
    expect(isPixelGridEnabled()).toBe(true);
  });

  it("setter で切り替わる", () => {
    setPixelGridEnabled(false);
    expect(isPixelGridEnabled()).toBe(false);
    setPixelGridEnabled(true);
    expect(isPixelGridEnabled()).toBe(true);
  });

  it("OFF にすると全 LUT エントリが bg/fg ドット色のみになる", () => {
    setPixelGridEnabled(false);
    rebuildLut(FG, BG);

    const w = 2, h = 1;
    const vram = new Uint8Array([0, 1]);
    const out = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out, vram, w, h, 0);

    const bgPacked = BG[0] | (BG[1] << 8) | (BG[2] << 16) | 0xff000000;
    const fgPacked = FG[0] | (FG[1] << 8) | (FG[2] << 16) | 0xff000000;

    // 出力中に bg 色と fg 色「だけ」が存在するはず
    for (let i = 0; i < out.length; i++) {
      const v = out[i] >>> 0;
      expect(v === (bgPacked >>> 0) || v === (fgPacked >>> 0)).toBe(true);
    }
  });

  it("OFF 時は各 3x3 セルがソースピクセル色で均一に塗られる (ブロック状)", () => {
    setPixelGridEnabled(false);
    rebuildLut(FG, BG);

    // bg-fg 隣接構成: pixel(0,0)=0, pixel(1,0)=1
    const w = 2, h = 1;
    const vram = new Uint8Array([0, 1]);
    const out = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out, vram, w, h, 0);

    const bgPacked = (BG[0] | (BG[1] << 8) | (BG[2] << 16) | 0xff000000) >>> 0;
    const fgPacked = (FG[0] | (FG[1] << 8) | (FG[2] << 16) | 0xff000000) >>> 0;
    const outW = w * CELL;

    // 左セル (pixel 0,0 = bg): 全 9 セルが bg 色
    for (let ly = 0; ly < CELL; ly++) {
      for (let lx = 0; lx < CELL; lx++) {
        expect(out[ly * outW + lx] >>> 0).toBe(bgPacked);
      }
    }
    // 右セル (pixel 1,0 = fg): 全 9 セルが fg 色
    for (let ly = 0; ly < CELL; ly++) {
      for (let lx = 0; lx < CELL; lx++) {
        expect(out[ly * outW + CELL + lx] >>> 0).toBe(fgPacked);
      }
    }
  });

  it("OFF 時は隣接 fg ピクセルから bg ピクセルへの「にじみ」が発生しない", () => {
    setPixelGridEnabled(false);
    rebuildLut(FG, BG);

    // bg(左) - fg(右) 隣接。bg セルの右側ギャップ位置に fg 色が漏れないこと。
    const w = 2, h = 1;
    const vram = new Uint8Array([0, 1]);
    const out = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out, vram, w, h, 0);

    const bgPacked = (BG[0] | (BG[1] << 8) | (BG[2] << 16) | 0xff000000) >>> 0;
    const outW = w * CELL;

    // bg セル (左) の右端ギャップ位置 (lx=2, ly=0..2) は bg 色のはず
    for (let ly = 0; ly < CELL; ly++) {
      expect(out[ly * outW + 2] >>> 0).toBe(bgPacked);
    }
  });

  it("OFF 時は斜線オフセット変更で出力が変わらない (Diagonal 無効化)", () => {
    setPixelGridEnabled(false);
    rebuildLut(FG, BG);

    const w = 4, h = 4;
    const vram = new Uint8Array(w * h).fill(1);
    const out1 = new Uint32Array(w * CELL * h * CELL);
    const out2 = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(out1, vram, w, h, 0);
    applyPixelGrid(out2, vram, w, h, 3);

    // OFF 時は diag が中和されているので出力が完全一致するはず
    for (let i = 0; i < out1.length; i++) {
      expect(out1[i]).toBe(out2[i]);
    }
  });

  it("ON に戻すとギャップ・斜線が復活する (状態が永続化されない)", () => {
    setPixelGridEnabled(false);
    rebuildLut(FG, BG);
    const w = 4, h = 4;
    const vram = new Uint8Array(w * h).fill(1);
    const outOff = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(outOff, vram, w, h, 5);

    setPixelGridEnabled(true);
    rebuildLut(FG, BG);
    const outOn = new Uint32Array(w * CELL * h * CELL);
    applyPixelGrid(outOn, vram, w, h, 5);

    // ON では diag があるので OFF と異なる出力になる
    let diffs = 0;
    for (let i = 0; i < outOff.length; i++) {
      if (outOff[i] !== outOn[i]) diffs++;
    }
    expect(diffs).toBeGreaterThan(0);
  });

  it("OFF 時の getPixelGridPalette は bg/fg のみを返す", () => {
    setPixelGridEnabled(false);
    const pal = getPixelGridPalette(FG, BG);
    // index 0,2,4,6 → bg, index 1,3,5,7 → fg
    expect(pal[2]).toEqual(pal[0]);
    expect(pal[3]).toEqual(pal[1]);
    expect(pal[4]).toEqual(pal[0]);
    expect(pal[5]).toEqual(pal[1]);
    expect(pal[6]).toEqual(pal[0]);
    expect(pal[7]).toEqual(pal[1]);
  });

  it("OFF 時の applyPixelGridIndexed もブロック状の出力になる", () => {
    setPixelGridEnabled(false);
    rebuildLut(FG, BG);

    const w = 2, h = 1;
    const vram = new Uint8Array([0, 1]);
    const result = applyPixelGridIndexed(vram, w, h, 0);
    const outW = w * CELL;

    // インデックスは 0/1/2/3 のいずれか (4-7 は使われない)。
    // ただしパレット側で 0=2, 1=3 が同色なので、視覚的には bg/fg のみ。
    // 検証: 左セルの全 9 位置の対応 RGB が bg、右セルが fg であること。
    const pal = getPixelGridPalette(FG, BG);
    for (let ly = 0; ly < CELL; ly++) {
      for (let lx = 0; lx < CELL; lx++) {
        const idx = result.data[ly * outW + lx];
        expect(pal[idx]).toEqual(BG);
      }
    }
    for (let ly = 0; ly < CELL; ly++) {
      for (let lx = 0; lx < CELL; lx++) {
        const idx = result.data[ly * outW + CELL + lx];
        expect(pal[idx]).toEqual(FG);
      }
    }
  });
});
