/**
 * tabbar.test.js — TabBar ウィジェットのテスト
 *
 * ports.js をモックし、TabBar の初期状態・タブ切替・再計測を検証する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── ports.js モック ──
vi.mock("@/ui/ports.js", () => ({
  GLYPH_W: 5,
  GLYPH_H: 7,
  ICON_W: 7,
  ICON_H: 7,
  fillRect: vi.fn(),
  drawRoundRect: vi.fn(),
  drawRect: vi.fn(),
  hline: vi.fn(),
  vline: vi.fn(),
  pset: vi.fn(),
  setClip: vi.fn(),
  resetClip: vi.fn(),
  pushClip: vi.fn(),
  popClip: vi.fn(),
  drawText: vi.fn(),
  drawIcon: vi.fn(),
  drawTextIcon: vi.fn(),
  keyDown: vi.fn(() => false),
  keyHeld: vi.fn(() => false),
  getCharQueue: vi.fn(() => []),
  getPasteText: vi.fn(() => null),
  mouseHasShift: vi.fn(() => false),
  ctrlDown: vi.fn(() => false),
  BAYER_4x4: Array.from({ length: 16 }, () => 0),
  BAYER_8x8: Array.from({ length: 64 }, () => 0),
}));

import * as ports from "@/ui/ports.js";
import { _computeDerivedConstants, textWidth } from "@/ui/ui_helpers.js";
import { TabBar } from "@/ui/widgets/TabBar.js";

/** モック上の GLYPH_W/GLYPH_H を変更し、派生定数を再算出する */
function setFont(glyphW, glyphH) {
  ports.GLYPH_W = glyphW;
  ports.GLYPH_H = glyphH;
  _computeDerivedConstants();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  初期状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TabBar 初期状態", () => {
  beforeEach(() => setFont(5, 7));

  it("デフォルトで最初のタブがアクティブ", () => {
    const tb = new TabBar(0, 0, ["A", "B", "C"], () => {});
    expect(tb.activeIndex).toBe(0);
  });

  it("initial パラメータでアクティブタブを指定できる", () => {
    const tb = new TabBar(0, 0, ["A", "B", "C"], () => {}, 2);
    expect(tb.activeIndex).toBe(2);
  });

  it("_tabs 数がラベル数と一致する", () => {
    const tb = new TabBar(0, 0, ["X", "YY", "ZZZ"], () => {});
    expect(tb._tabs.length).toBe(3);
  });

  it("w が正の値を持つ", () => {
    const tb = new TabBar(0, 0, ["INST", "PIANO_ROLL"], () => {});
    expect(tb.w).toBeGreaterThan(0);
  });

  it("h が GLYPH_H + パディング + 下線を含む正の値", () => {
    const tb = new TabBar(0, 0, ["A"], () => {});
    // TAB_PAD_TOP(4) + GLYPH_H(7) + TAB_PAD_BOTTOM(3) + 1(underline) = 15
    expect(tb.h).toBe(15);
  });

  it("w はラベル幅の合計 + ギャップ", () => {
    const tb = new TabBar(0, 0, ["AB", "CD"], () => {});
    const wAB = textWidth("AB");
    const wCD = textWidth("CD");
    // TAB_GAP = 8
    expect(tb.w).toBe(wAB + 8 + wCD);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  setActive
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TabBar.setActive", () => {
  beforeEach(() => setFont(5, 7));

  it("有効なインデックスでタブを切り替えられる", () => {
    const tb = new TabBar(0, 0, ["A", "B", "C"], () => {});
    tb.setActive(2);
    expect(tb.activeIndex).toBe(2);
  });

  it("範囲外のインデックスは無視される (負)", () => {
    const tb = new TabBar(0, 0, ["A", "B"], () => {});
    tb.setActive(-1);
    expect(tb.activeIndex).toBe(0);
  });

  it("範囲外のインデックスは無視される (超過)", () => {
    const tb = new TabBar(0, 0, ["A", "B"], () => {});
    tb.setActive(5);
    expect(tb.activeIndex).toBe(0);
  });

  it("onChange コールバックは発火しない", () => {
    const fn = vi.fn();
    const tb = new TabBar(0, 0, ["A", "B"], fn);
    tb.setActive(1);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  update (クリックによるタブ切替)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TabBar.update", () => {
  beforeEach(() => setFont(5, 7));

  it("タブラベル上のクリックでタブが切り替わる", () => {
    const fn = vi.fn();
    const tb = new TabBar(0, 0, ["AB", "CD"], fn);
    const secondTabX = tb._tabs[1].x;

    tb.update({ type: "down", localX: secondTabX, localY: 5 });
    expect(tb.activeIndex).toBe(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it("既にアクティブなタブのクリックではコールバックが発火しない", () => {
    const fn = vi.fn();
    const tb = new TabBar(0, 0, ["AB", "CD"], fn);

    tb.update({ type: "down", localX: 0, localY: 5 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("タブ領域外のクリックは無視される", () => {
    const fn = vi.fn();
    const tb = new TabBar(0, 0, ["AB", "CD"], fn);

    tb.update({ type: "down", localX: 0, localY: -1 });
    expect(fn).not.toHaveBeenCalled();

    tb.update({ type: "down", localX: 0, localY: tb.h + 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("down 以外のイベントは無視される", () => {
    const fn = vi.fn();
    const tb = new TabBar(0, 0, ["AB", "CD"], fn);
    const secondTabX = tb._tabs[1].x;

    tb.update({ type: "hover", localX: secondTabX, localY: 5 });
    expect(tb.activeIndex).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  draw
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TabBar.draw", () => {
  beforeEach(() => {
    setFont(5, 7);
    vi.clearAllMocks();
  });

  it("全ラベルのテキストが描画される", () => {
    const tb = new TabBar(0, 0, ["AA", "BB", "CC"], () => {});
    tb.draw({ x: 10, y: 20 });

    expect(ports.drawText).toHaveBeenCalledTimes(3);
  });

  it("アクティブタブの下線が描画される", () => {
    const tb = new TabBar(0, 0, ["AA", "BB"], () => {});
    tb.draw({ x: 0, y: 0 });

    // hline はアクティブタブの下線のみ (1 回)
    expect(ports.hline).toHaveBeenCalledTimes(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  remeasure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TabBar.remeasure", () => {
  it("フォント変更後に h が更新される", () => {
    setFont(5, 7);
    const tb = new TabBar(0, 0, ["A", "B"], () => {});
    expect(tb.h).toBe(15); // 4 + 7 + 3 + 1

    setFont(5, 5);
    tb.remeasure();
    expect(tb.h).toBe(13); // 4 + 5 + 3 + 1
  });

  it("GLYPH_W 変更後に w が更新される", () => {
    setFont(5, 7);
    const tb = new TabBar(0, 0, ["AB"], () => {});
    const w5 = tb.w;

    setFont(4, 7);
    tb.remeasure();
    expect(tb.w).not.toBe(w5);
    expect(tb.w).toBe(textWidth("AB"));
  });

  it("remeasure はエラーなく動作する", () => {
    setFont(5, 7);
    const tb = new TabBar(0, 0, ["X", "Y", "Z"], () => {});
    expect(() => {
      setFont(5, 5);
      tb.remeasure();
    }).not.toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  focusable / cursorName
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TabBar プロパティ", () => {
  beforeEach(() => setFont(5, 7));

  it("focusable が true", () => {
    const tb = new TabBar(0, 0, ["A"], () => {});
    expect(tb.focusable).toBe(true);
  });

  it("cursorName が pointer", () => {
    const tb = new TabBar(0, 0, ["A"], () => {});
    expect(tb.cursorName).toBe("pointer");
  });
});

