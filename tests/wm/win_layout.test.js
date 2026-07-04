/**
 * wm/win_layout.js — ウィンドウ寸法算出のテスト
 *
 * calcWindowSize (コンテンツ寸法 → 外寸) と recalcLayout (外寸 → 内部矩形) が
 * 互いに逆演算であること (characterization) を検証する。B-1 の wm.js 分割で
 * これらのレイアウト算出が win_layout.js へ移った際の挙動不変の安全網。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── モック: config ──
vi.mock("@/config.js", () => ({
  VRAM_WIDTH: 480,
  VRAM_HEIGHT: 360,
  getHeaderPad: () => 8,
  getContentPad: () => 6,
}));

// ── モック: font / icon ──
vi.mock("@/core/font.js", () => ({ GLYPH_H: 7 }));
vi.mock("@/core/icon.js", () => ({ ICON_H: 9 }));

// ── モック: scrollbar ──
vi.mock("@/ui/scrollbar.js", () => ({
  SCROLLBAR_SLOT_WIDTH: 6,
  scrollSetViewport: vi.fn(),
}));

import {
  calcWindowSize,
  recalcLayout,
  recalcLayoutConstants,
} from "@/wm/win_layout.js";

beforeEach(() => {
  recalcLayoutConstants();
});

/** 与えた外寸で win を作り recalcLayout してコンテンツ矩形を返す */
function contentOf(w, h, footer, scrollable) {
  const win = {
    x: 0,
    y: 0,
    w,
    h,
    footer,
    _scrollable: scrollable,
    _vScroll: null,
    fullscreen: false,
  };
  recalcLayout(win);
  return win._layout.contentRect;
}

describe("calcWindowSize ⇄ recalcLayout の逆演算", () => {
  // footer / scrollable の 4 組合せで、十分大きい cw/ch なら
  // calcWindowSize の外寸から recalcLayout したコンテンツ寸法が cw/ch に戻る。
  const cases = [
    { footer: false, scrollable: false },
    { footer: true, scrollable: false },
    { footer: false, scrollable: true },
    { footer: true, scrollable: true },
  ];

  for (const { footer, scrollable } of cases) {
    it(`footer=${footer} scrollable=${scrollable} で cw/ch が保存される`, () => {
      const cw = 200;
      const ch = 150;
      const { w, h } = calcWindowSize(cw, ch, footer, scrollable);
      const cr = contentOf(w, h, footer, scrollable);
      expect(cr.w).toBe(cw);
      expect(cr.h).toBe(ch);
    });
  }

  it("最小サイズを下回る要求は MIN_WIDTH / MIN_HEIGHT にクランプされる", () => {
    // 枠のオーバーヘッドを打ち消すため負のコンテンツ寸法で clamp を発火させる
    const { w, h } = calcWindowSize(-100, -100, false, false);
    expect(w).toBe(8); // MIN_WIDTH
    // MIN_HEIGHT = BORDER + HEADER_HEIGHT(=9+8*2=25) + SEP + 4 + BORDER = 32
    expect(h).toBe(32);
  });

  it("scrollable はスクロールバー幅ぶん外寸が広い", () => {
    const plain = calcWindowSize(200, 150, false, false);
    const scroll = calcWindowSize(200, 150, false, true);
    expect(scroll.w - plain.w).toBe(6); // SCROLLBAR_SLOT_WIDTH
    expect(scroll.h).toBe(plain.h);
  });

  it("footer は FOOTER_HEIGHT ぶん外寸が高い", () => {
    const plain = calcWindowSize(200, 150, false, false);
    const withFooter = calcWindowSize(200, 150, true, false);
    // FOOTER_HEIGHT = SEP(1) + PAD(2) + GLYPH_H(7) + PAD(2) = 12
    expect(withFooter.h - plain.h).toBe(12);
    expect(withFooter.w).toBe(plain.w);
  });
});
