/**
 * roll_playhead.test.js — ROLL 再生位置線 (playhead) グリフの ASCII 仕様を検証する。
 *
 * 仕様 (凡例 . = 背景 / # = 前景):
 *   1px グリッド (拍/細分化線) … 黒 1px をグリッドに重ね、左右に白 1px → 合計 3px  `.#.`
 *   2px グリッド (小節線)       … 黒 2px をグリッドに重ね、左右に白 1px → 合計 4px  `.##.`
 *
 * gpu.fillRect だけを記録用に差し替え (他は実物のまま) して、drawPlayheadGlyph の
 * 出力矩形が仕様どおり「白 1px / 黒 gridThick / 白 1px」になることを確かめる。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rec = vi.hoisted(() => ({ rects: [] }));
vi.mock("@/core/gpu.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fillRect: (x, y, w, h, c) => rec.rects.push({ x, y, w, h, c }) };
});

import { drawPlayheadGlyph } from "@/app/roll/roll.js";

beforeEach(() => {
  rec.rects = [];
});

describe("drawPlayheadGlyph — ASCII 仕様", () => {
  it("1px グリッド: 黒 1px + 左右白 1px = 合計 3px (.#.)", () => {
    drawPlayheadGlyph(10, 0, 40, 1); // ox=10, gridThick=1
    const black = rec.rects.filter((r) => r.c === 1);
    const white = rec.rects.filter((r) => r.c === 0);
    expect(black).toHaveLength(1);
    expect(black[0]).toMatchObject({ x: 10, w: 1, h: 40 }); // グリッド線上の黒
    expect(white.map((r) => r.x).sort((a, b) => a - b)).toEqual([9, 11]); // 左右の白 1px
    expect(white.every((r) => r.w === 1)).toBe(true);
    // 合計幅 = 白1 + 黒1 + 白1 = 3px (x=9..11)
  });

  it("2px グリッド (小節線): 黒 2px + 左右白 1px = 合計 4px (.##.)", () => {
    drawPlayheadGlyph(10, 0, 40, 2); // ox=10, gridThick=2
    const black = rec.rects.filter((r) => r.c === 1);
    const white = rec.rects.filter((r) => r.c === 0);
    expect(black).toHaveLength(1);
    expect(black[0]).toMatchObject({ x: 10, w: 2, h: 40 }); // グリッド線上の黒 2px
    // 左白 x=9、右白 x=ox+gridThick=12
    expect(white.map((r) => r.x).sort((a, b) => a - b)).toEqual([9, 12]);
    expect(white.every((r) => r.w === 1)).toBe(true);
    // 合計幅 = 白1 + 黒2 + 白1 = 4px (x=9..12)
  });

  it("高さ 0 以下は描かない", () => {
    drawPlayheadGlyph(10, 0, 0, 1);
    expect(rec.rects).toHaveLength(0);
  });
});
