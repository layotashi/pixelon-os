/**
 * empty_items.test.js — 空入力ガードのテスト
 *
 * ListBox, DropDown, Label に空の items / テキストを渡した際に
 * Math.max(...[]) → -Infinity でクラッシュしないことを確認する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── モック: ports.js ──
vi.mock("@/ui/ports.js", () => ({
    GLYPH_W: 5,
    GLYPH_H: 7,
    ICON_W: 7,
    ICON_H: 7,
    fillRect: vi.fn(),
    drawRoundRect: vi.fn(),
    drawRect: vi.fn(),
    drawText: vi.fn(),
    drawIcon: vi.fn(),
    drawTextIcon: vi.fn(),
    hline: vi.fn(),
    vline: vi.fn(),
    pset: vi.fn(),
    setClip: vi.fn(),
    resetClip: vi.fn(),
    pushClip: vi.fn(),
    popClip: vi.fn(),
    keyDown: vi.fn(() => false),
    keyHeld: vi.fn(() => false),
    getCharQueue: vi.fn(() => []),
    getPasteText: vi.fn(() => null),
    mouseHasShift: vi.fn(() => false),
    ctrlDown: vi.fn(() => false),
}));

// ── モック: scrollbar.js ──
vi.mock("@/ui/scrollbar.js", () => ({
    SCROLLBAR_SLOT_WIDTH: 10,
    SCROLLBAR_W: 7,
    SCROLLBAR_MARGIN: 1,
    createScrollState(vp, ct) {
        return {
            offset: 0,
            viewport: vp,
            content: ct,
            _thumbDrag: false,
            _dragStartPos: 0,
            _dragStartOffset: 0,
        };
    },
    scrollSetContent: vi.fn(),
    scrollEnsureVisible: vi.fn(),
    scrollDragReset: vi.fn(),
    scrollIsDragging: vi.fn(() => false),
    drawVScrollbarSlot: vi.fn(),
    vScrollbarSlotThumbArea: vi.fn(() => ({ x: 0, y: 0, w: 10, h: 100 })),
    handleVScrollInput: vi.fn(),
    scrollBy: vi.fn(),
}));

import { _computeDerivedConstants } from "@/ui/ui_helpers.js";
import { ListBox } from "@/ui/widgets/ListBox.js";
import { DropDown } from "@/ui/widgets/DropDown.js";
import { Label } from "@/ui/widgets/Label.js";

// 派生定数を初期化
beforeEach(() => {
    _computeDerivedConstants();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ListBox — 空 items
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ListBox 空 items ガード", () => {
    it("空の items 配列でクラッシュしない", () => {
        const lb = new ListBox(0, 0, 5, [], 0, null);
        expect(lb.w).toBeGreaterThan(0);
        expect(lb.h).toBeGreaterThan(0);
        expect(Number.isFinite(lb.w)).toBe(true);
    });

    it("空 items での remeasure() がクラッシュしない", () => {
        const lb = new ListBox(0, 0, 5, ["A", "B"], 0, null);
        lb.items = [];
        lb.remeasure();
        expect(Number.isFinite(lb.w)).toBe(true);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DropDown — 空 items
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DropDown 空 items ガード", () => {
    it("空の items 配列でクラッシュしない", () => {
        const dd = new DropDown(0, 0, [], 0, null);
        expect(dd.w).toBeGreaterThan(0);
        expect(dd.h).toBeGreaterThan(0);
        expect(Number.isFinite(dd.w)).toBe(true);
    });

    it("空 items での remeasure() がクラッシュしない", () => {
        const dd = new DropDown(0, 0, ["X", "Y"], 0, null);
        dd.items = [];
        dd.remeasure();
        expect(Number.isFinite(dd.w)).toBe(true);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Label — 空テキスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Label 空テキスト ガード", () => {
    it("空文字列で w が -Infinity にならない", () => {
        const lbl = new Label(0, 0, "");
        expect(lbl.w).toBe(0);
        expect(Number.isFinite(lbl.w)).toBe(true);
        expect(lbl.h).toBe(7); // GLYPH_H
    });

    it("空テキストでの remeasure() が正常に動作する", () => {
        const lbl = new Label(0, 0, "Hello");
        lbl.text = "";
        lbl.remeasure();
        expect(lbl.w).toBe(0);
        expect(Number.isFinite(lbl.w)).toBe(true);
    });

    it("通常テキストでは従来通り正しい幅を返す", () => {
        const lbl = new Label(0, 0, "AB");
        // textWidth("AB") = 2*(5+1)-1 = 11
        expect(lbl.w).toBe(11);
    });
});
