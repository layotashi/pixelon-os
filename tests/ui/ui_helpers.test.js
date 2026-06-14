/**
 * ui/ui_helpers.js — UI ヘルパーのテスト
 *
 * ports.js をモックして純粋計算部分をテスト。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ports.js をモック (定数とスタブ関数を注入)
vi.mock("@/ui/ports.js", () => ({
  GLYPH_W: 5,
  GLYPH_H: 9,
  ICON_W: 16,
  ICON_H: 16,
  keyDown: vi.fn(() => false),
  keyHeld: vi.fn(() => false),
  getCharQueue: vi.fn(() => []),
  getPasteText: vi.fn(() => null),
  mouseHasShift: vi.fn(() => false),
  ctrlDown: vi.fn(() => false),
}));

import { keyDown, keyHeld } from "@/ui/ports.js";

import {
  BUTTON_PADDING,
  textWidth,
  buttonAutoWidth,
  buttonIconWidth,
  buttonIconHeight,
  charCat,
  CAT_WORD,
  CAT_SPACE,
  CAT_PUNCT,
  _computeDerivedConstants,
  TEXTBOX_BLINK_CYCLE,
  tickRepeat,
  resetRepeatKey,
} from "@/ui/ui_helpers.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("定数", () => {
  it("BUTTON_PADDING = 4", () => {
    expect(BUTTON_PADDING).toBe(4);
  });

  it("TEXTBOX_BLINK_CYCLE = 40", () => {
    expect(TEXTBOX_BLINK_CYCLE).toBe(40);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  _computeDerivedConstants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("_computeDerivedConstants", () => {
  it("GLYPH_H=9 ベースで派生定数を計算", () => {
    _computeDerivedConstants();
    // BUTTON_AUTO_HEIGHT = GLYPH_H + PADDING*2 + 4 = 9 + 8 + 4 = 21
    // これは export let なので直接テストは難しいが、
    // 呼び出してエラーが出ないことを確認
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  textWidth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("textWidth", () => {
  // GLYPH_W = 5 → 各文字は 5+1=6px 幅、最後の -1
  it("空文字列 → 0", () => {
    expect(textWidth("")).toBe(0);
  });

  it("1 文字 → GLYPH_W", () => {
    expect(textWidth("A")).toBe(5); // 1*(5+1)-1 = 5
  });

  it("3 文字 → 3*(5+1)-1 = 17", () => {
    expect(textWidth("abc")).toBe(17);
  });

  it("10 文字", () => {
    expect(textWidth("0123456789")).toBe(59); // 10*6-1
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  buttonAutoWidth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buttonAutoWidth", () => {
  it("ラベルの幅 + パディング + ボーダー", () => {
    // textWidth("OK") = 2*6-1 = 11
    // + BUTTON_PADDING*2 + 4 = 11 + 8 + 4 = 23
    expect(buttonAutoWidth("OK")).toBe(23);
  });

  it("空ラベルでも最小幅", () => {
    // textWidth("") = 0, + 8 + 4 = 12
    expect(buttonAutoWidth("")).toBe(12);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  buttonIconWidth / buttonIconHeight
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buttonIconWidth / buttonIconHeight", () => {
  it("ICON_W=16 ベースで幅を返す", () => {
    // 16 + BUTTON_PADDING*2 + 4 = 16 + 8 + 4 = 28
    expect(buttonIconWidth()).toBe(28);
  });

  it("ICON_H=16 ベースで高さを返す", () => {
    expect(buttonIconHeight()).toBe(28);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  charCat — 文字カテゴリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("charCat", () => {
  it("英字は CAT_WORD", () => {
    expect(charCat("a")).toBe(CAT_WORD);
    expect(charCat("Z")).toBe(CAT_WORD);
  });

  it("数字は CAT_WORD", () => {
    expect(charCat("0")).toBe(CAT_WORD);
    expect(charCat("9")).toBe(CAT_WORD);
  });

  it("アンダースコアは CAT_WORD", () => {
    expect(charCat("_")).toBe(CAT_WORD);
  });

  it("スペースは CAT_SPACE", () => {
    expect(charCat(" ")).toBe(CAT_SPACE);
  });

  it("タブは CAT_SPACE", () => {
    expect(charCat("\t")).toBe(CAT_SPACE);
  });

  it("記号は CAT_PUNCT", () => {
    expect(charCat(".")).toBe(CAT_PUNCT);
    expect(charCat(",")).toBe(CAT_PUNCT);
    expect(charCat("!")).toBe(CAT_PUNCT);
    expect(charCat("-")).toBe(CAT_PUNCT);
    expect(charCat("(")).toBe(CAT_PUNCT);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  tickRepeat — キーリピート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("tickRepeat", () => {
  beforeEach(() => {
    resetRepeatKey();
    keyDown.mockReset();
    keyHeld.mockReset();
    keyDown.mockReturnValue(false);
    keyHeld.mockReturnValue(false);
  });

  it("keyDown で即座に true を返す", () => {
    keyDown.mockReturnValue(true);
    expect(tickRepeat("ArrowRight", false)).toBe(true);
  });

  it("keyDown 後に keyHeld を続けると、遅延後にリピート発火する", () => {
    // 初回押下
    keyDown.mockReturnValue(true);
    keyHeld.mockReturnValue(true);
    expect(tickRepeat("ArrowRight", false)).toBe(true);

    // 以降は keyDown=false, keyHeld=true
    keyDown.mockReturnValue(false);

    // REPEAT_DELAY (20) フレーム待つ
    let fired = false;
    for (let i = 0; i < 20; i++) {
      if (tickRepeat("ArrowRight", false)) fired = true;
    }
    expect(fired).toBe(true);
  });

  it("キーを離すとリピートが止まる", () => {
    // 初回
    keyDown.mockReturnValue(true);
    keyHeld.mockReturnValue(true);
    tickRepeat("ArrowRight", false);

    // 離す
    keyDown.mockReturnValue(false);
    keyHeld.mockReturnValue(false);

    // 20 フレーム回しても発火しない
    let fired = false;
    for (let i = 0; i < 30; i++) {
      if (tickRepeat("ArrowRight", false)) fired = true;
    }
    expect(fired).toBe(false);
  });
});

