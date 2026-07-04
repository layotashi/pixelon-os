/**
 * scrollbar.test.js — ステッパーボタン (端の ▲▼/◀▶) の入力ロジック。
 *
 * ボタンのクリック 1 段・オートリピート・押下状態・短バー/非スクロール時の
 * フォールバック (ボタン非表示=従来のトラック挙動) を検証する。描画は ports を
 * モックしてスモークのみ。純粋ロジックなので回帰ガードとして軽い。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/ui/ports.js", () => ({
  fillRect: vi.fn(),
  vline: vi.fn(),
  hline: vi.fn(),
  pset: vi.fn(),
}));

import {
  createScrollState,
  handleVScrollInput,
  handleHScrollInput,
  scrollIsDragging,
  scrollDragReset,
  drawVScrollbarSlot,
  SCROLLBAR_W,
} from "@/ui/scrollbar.js";

// トラック: [0, LEN)。ボタン: 上/左=[0,7)、下/右=[LEN-7, LEN)。
const LONG = 40; // >= MIN_TRACK_FOR_BUTTONS(21) → ボタンあり
const SHORT = 15; // < 21 → ボタン無し
const BTN = SCROLLBAR_W; // 7

/** スクロール可能な状態 (offset を途中に置く) */
function scrollable(offset = 10) {
  const s = createScrollState(5, 20); // viewport<content → max=15
  s.offset = offset;
  return s;
}

describe("ステッパーボタン: クリックで 1 段", () => {
  it("上ボタンで 1 行ぶん戻る (offset-1)", () => {
    const s = scrollable(10);
    handleVScrollInput(s, "down", 3, 0, LONG); // 上ボタン領域 [0,7)
    expect(s.offset).toBe(9);
    expect(s._btnHeld).toBe(-1);
    expect(scrollIsDragging(s)).toBe(true); // 押下中はバーが掴んでいる扱い
  });

  it("下ボタンで 1 行ぶん進む (offset+1)", () => {
    const s = scrollable(10);
    handleVScrollInput(s, "down", LONG - 3, 0, LONG); // 下ボタン領域 [33,40)
    expect(s.offset).toBe(11);
    expect(s._btnHeld).toBe(1);
  });

  it("step を渡すとその量だけ動く (px 単位スクロール等)", () => {
    const s = scrollable(10);
    handleVScrollInput(s, "down", LONG - 3, 0, LONG, 4);
    expect(s.offset).toBe(14);
  });

  it("横バーも左右ボタンで対称に動く", () => {
    const s = scrollable(10);
    handleHScrollInput(s, "down", 3, 0, LONG); // 左ボタン
    expect(s.offset).toBe(9);
  });
});

describe("ステッパーボタン: オートリピート", () => {
  it("押しっぱなしでディレイ後に反復スクロールする", () => {
    const s = scrollable(10);
    handleVScrollInput(s, "down", LONG - 3, 0, LONG); // 下ボタン → 11
    expect(s.offset).toBe(11);
    // ディレイ (20) 未満の held では動かない
    for (let i = 0; i < 19; i++) handleVScrollInput(s, "held", LONG - 3, 0, LONG);
    expect(s.offset).toBe(11);
    // 20 フレーム目で 1 段反復
    handleVScrollInput(s, "held", LONG - 3, 0, LONG);
    expect(s.offset).toBe(12);
  });

  it("ボタンから外れている間はリピートしない (一時停止)", () => {
    const s = scrollable(10);
    handleVScrollInput(s, "down", 3, 0, LONG); // 上ボタン → 9
    // マウスがサム区間 (ボタン外) にある held は反復しない
    for (let i = 0; i < 30; i++) handleVScrollInput(s, "held", 20, 0, LONG);
    expect(s.offset).toBe(9);
  });

  it("up で押下状態が解除される", () => {
    const s = scrollable(10);
    handleVScrollInput(s, "down", 3, 0, LONG);
    handleVScrollInput(s, "up", 3, 0, LONG);
    expect(s._btnHeld).toBe(0);
    expect(scrollIsDragging(s)).toBe(false);
  });

  it("scrollDragReset で押下状態がクリアされる", () => {
    const s = scrollable(10);
    handleVScrollInput(s, "down", 3, 0, LONG);
    scrollDragReset(s);
    expect(s._btnHeld).toBe(0);
    expect(s._btnRepeat).toBe(0);
  });
});

describe("フォールバック: ボタン非表示条件", () => {
  it("短いトラックではボタンを出さない (押下状態にならない)", () => {
    const s = scrollable(10);
    handleVScrollInput(s, "down", 3, 0, SHORT); // 上端をクリックしてもボタン扱いしない
    expect(s._btnHeld).toBe(0); // ボタン非表示 → トラックジャンプ扱い
  });

  it("スクロール不要ならボタン無し・押下状態にならない", () => {
    const s = createScrollState(20, 10); // content<viewport → max=0
    s.offset = 0;
    handleVScrollInput(s, "down", 3, 0, LONG);
    expect(s._btnHeld).toBe(0);
    expect(s.offset).toBe(0);
  });
});

describe("描画スモーク", () => {
  it("drawVScrollbarSlot がボタンあり/なし双方で例外を投げない", () => {
    expect(() => drawVScrollbarSlot(scrollable(10), 0, 0, LONG)).not.toThrow();
    expect(() => drawVScrollbarSlot(scrollable(10), 0, 0, SHORT)).not.toThrow();
    const noScroll = createScrollState(20, 10);
    expect(() => drawVScrollbarSlot(noScroll, 0, 0, LONG)).not.toThrow();
  });
});
