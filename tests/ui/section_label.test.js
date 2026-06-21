/**
 * tests/ui/section_label.test.js — 反転ラベル (Label.inverted) と SectionLabel。
 *
 * 検証対象:
 *   - 素の Label は従来どおり (inverted=false, w/h は文字寸法のまま) で回帰なし
 *   - padX/padY 設定で w/h が余白込みに再計算される
 *   - inverted=true の描画は前景レベル(1)で塗ってから背景レベル(0)でテキストを描く
 *   - SectionLabel は inverted + SECTION_PAD_* を備えた大項目見出しになる
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initPorts } from "@/ui/index.js";
import { Label } from "@/ui/widgets/Label.js";
import { SectionLabel } from "@/ui/widgets/SectionLabel.js";
import { SECTION_PAD } from "@/ui/ui_constants.js";

const GLYPH_W = 5;
const GLYPH_H = 7;
const tw = (s) => (s.length > 0 ? s.length * (GLYPH_W + 1) - 1 : 0);

// 描画コールを記録するスパイ付き ports。
const calls = { fill: [], text: [] };
beforeAll(() => {
  initPorts({
    gpu: {
      fillRect: (x, y, w, h, c) => calls.fill.push({ x, y, w, h, c }),
      drawRoundRect() {},
      drawRect() {},
      hline() {},
      vline() {},
      pset() {},
      setClip() {},
      resetClip() {},
      pushClip() {},
      popClip() {},
    },
    font: {
      GLYPH_W,
      GLYPH_H,
      drawText: (x, y, s, c) => calls.text.push({ x, y, s, c }),
    },
    icon: { ICON_W: 7, ICON_H: 7, drawIcon() {} },
    input: {
      keyDown: () => false,
      keyHeld: () => false,
      getCharQueue: () => [],
      getPasteText: () => "",
      mouseHasShift: () => false,
      ctrlDown: () => false,
    },
    textIcon: { drawTextIcon() {} },
    dither: { BAYER_4x4: [], BAYER_8x8: [] },
  });
});

describe("Label (回帰: 素のラベルは従来どおり)", () => {
  it("既定で inverted=false、w/h は余白なしの文字寸法", () => {
    const l = new Label(0, 0, "OUT:");
    expect(l.inverted).toBe(false);
    expect(l.w).toBe(tw("OUT:"));
    expect(l.h).toBe(GLYPH_H);
  });

  it("素のラベルは fillRect を呼ばず color でテキストを描く", () => {
    calls.fill.length = 0;
    calls.text.length = 0;
    new Label(3, 4, "AB").draw({ x: 0, y: 0 });
    expect(calls.fill).toHaveLength(0);
    expect(calls.text).toEqual([{ x: 3, y: 4, s: "AB", c: 1 }]);
  });
});

describe("Label.inverted / padding", () => {
  it("padX/padY で w/h が余白込みに再計算される", () => {
    const l = new Label(0, 0, "X");
    l.padX = 3;
    l.padY = 2;
    expect(l.w).toBe(tw("X") + 6);
    expect(l.h).toBe(GLYPH_H + 4);
  });

  it("inverted は前景(1)で塗ってから背景(0)テキスト、テキストは余白分ずらす", () => {
    calls.fill.length = 0;
    calls.text.length = 0;
    const l = new Label(10, 20, "HI");
    l.inverted = true;
    l.padX = 3;
    l.padY = 2;
    l.draw({ x: 0, y: 0 });
    expect(calls.fill).toEqual([
      { x: 10, y: 20, w: l.w, h: l.h, c: 1 },
    ]);
    expect(calls.text).toEqual([
      { x: 10 + 3, y: 20 + 2, s: "HI", c: 0 },
    ]);
  });
});

describe("SectionLabel", () => {
  it("inverted かつ四辺が同一の SECTION_PAD を備える", () => {
    const s = new SectionLabel(0, 0, "OUTPUT");
    expect(s.inverted).toBe(true);
    expect(s.padX).toBe(SECTION_PAD);
    expect(s.padY).toBe(SECTION_PAD);
    expect(s.padX).toBe(s.padY); // 左右=上下
    expect(s.w).toBe(tw("OUTPUT") + SECTION_PAD * 2);
    expect(s.h).toBe(GLYPH_H + SECTION_PAD * 2);
  });
});
