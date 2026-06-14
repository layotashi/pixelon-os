/**
 * tests/ui/widgetgroup_autolayout.test.js — WidgetGroup の auto-layout のテスト。
 *
 * 回帰防止対象: ウィジェットの派生サイズが setter で更新されたあと、
 * 親 Box の layout を明示的に呼び直さなくても draw/update/measure を介して
 * 自動で再レイアウトされ、HSep などの stretch 幅・兄弟位置が追従する。
 *
 * オリジナルバグの最小再現:
 *   1. CAPTURE の Target DropDown が短い items で初期化
 *   2. items が長い値に差し替えられて DropDown.w が伸びる
 *   3. 旧設計では親 Box の layout が手動で再呼ばれず、同じ VBox 内の HSep
 *      が古い狭い stretch 幅のままだった
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initPorts, WidgetGroup, HBox, VBox, FOCUS_MARGIN } from "@/ui/index.js";
import { DropDown } from "@/ui/widgets/DropDown.js";
import { Label } from "@/ui/widgets/Label.js";
import { HSep } from "@/ui/widgets/HSep.js";

beforeAll(() => {
  initPorts({
    gpu: {
      fillRect() {},
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
    font: { GLYPH_W: 5, GLYPH_H: 7, drawText() {} },
    icon: { ICON_W: 7, ICON_H: 7, drawIcon() {} },
    input: {
      keyDown() { return false; },
      keyHeld() { return false; },
      getCharQueue() { return []; },
      getPasteText() { return ""; },
      mouseHasShift() { return false; },
      ctrlDown() { return false; },
    },
    textIcon: { drawTextIcon() {} },
    dither: { BAYER_4x4: [], BAYER_8x8: [] },
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Box ツリー受け取りモード
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("WidgetGroup(root) — Box ツリー API", () => {
  it("コンストラクタで初回 layout が実行される", () => {
    const lbl = new Label(0, 0, "A");
    const root = VBox([lbl]);
    new WidgetGroup(root);
    // layout 後は x が FOCUS_MARGIN に設定されているはず
    expect(root.x).toBe(FOCUS_MARGIN);
    expect(root.y).toBe(FOCUS_MARGIN);
  });

  it("カスタム origin を opts で指定できる", () => {
    const lbl = new Label(0, 0, "A");
    const root = VBox([lbl]);
    new WidgetGroup(root, { x: 12, y: 24 });
    expect(root.x).toBe(12);
    expect(root.y).toBe(24);
  });

  it("配列を渡したときは従来通り auto-layout なし", () => {
    const lbl = new Label(0, 0, "A");
    const grp = new WidgetGroup([lbl]);
    expect(grp.widgets).toEqual([lbl]);
    expect(grp._layoutRoot).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  オリジナルバグの再現と修正検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("auto-layout cascade — DropDown items 増加で HSep stretch 幅が追従", () => {
  it("draw() 前に DropDown が伸びると HSep もそれに合わせて広がる", () => {
    // CAPTURE 画面の最小再現: Target DropDown + 区切り線
    const dd = new DropDown(0, 0, ["Full screen"], 0);
    const sep = new HSep(0, 0, 0);
    const lblBelow = new Label(0, 0, "Capture:");

    const root = VBox([dd, sep, lblBelow]);
    const group = new WidgetGroup(root);

    // 初期状態: HSep は DropDown と lblBelow の max 幅にストレッチ
    const initialSepW = sep.w;
    expect(initialSepW).toBeGreaterThan(0);

    // items を長い項目に差し替え → DropDown.w が伸びる (前回コミットの setter)
    dd.items = ["Full screen", "DISPLAY_TUNING"];
    const grownDdW = dd.w;
    expect(grownDdW).toBeGreaterThan(initialSepW);

    // draw() 呼び出しが auto-layout をトリガーする
    group.draw({ x: 0, y: 0 });

    // ★ HSep の stretch 幅が DropDown の新幅に追従していること
    expect(sep.w).toBeGreaterThanOrEqual(grownDdW);
  });

  it("update() でも同じく auto-layout される", () => {
    const dd = new DropDown(0, 0, ["A"], 0);
    const sep = new HSep(0, 0, 0);
    const root = VBox([dd, sep]);
    const group = new WidgetGroup(root);

    const wInitial = sep.w;
    dd.items = ["A", "EXTREMELY_LONG_ITEM_NAME_FOR_TEST"];

    group.update({ type: "hover", localX: 0, localY: 0 });

    expect(sep.w).toBeGreaterThan(wInitial);
  });

  it("measure() でも同じく auto-layout される", () => {
    const dd = new DropDown(0, 0, ["A"], 0);
    const sep = new HSep(0, 0, 0);
    const root = VBox([dd, sep]);
    const group = new WidgetGroup(root);

    const sizeInitial = group.measure();
    dd.items = ["A", "LONGER_ITEMS"];
    const sizeAfter = group.measure();

    // VBox 全体の w が伸びている
    expect(sizeAfter.w).toBeGreaterThan(sizeInitial.w);
    // HSep の w も同じく伸びている
    expect(sep.w).toBeGreaterThanOrEqual(sizeAfter.w - 2 * FOCUS_MARGIN);
  });

  it("HBox 内で兄弟 widget の x も追従する", () => {
    // 横並びの場合: 左の widget が伸びると右の widget の x が押し出される
    const left = new Label(0, 0, "A");
    const right = new Label(0, 0, "B");
    const root = HBox([left, right]);
    const group = new WidgetGroup(root);

    const rightXInitial = right.x;
    left.text = "MUCH_LONGER_TEXT";
    group.draw({ x: 0, y: 0 });

    expect(right.x).toBeGreaterThan(rightXInitial);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  setLayoutOrigin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("setLayoutOrigin", () => {
  it("layout 原点を動的に変更できる", () => {
    const lbl = new Label(0, 0, "A");
    const root = VBox([lbl]);
    const group = new WidgetGroup(root);
    expect(root.x).toBe(FOCUS_MARGIN);

    group.setLayoutOrigin(50, 100);
    expect(root.x).toBe(50);
    expect(root.y).toBe(100);
  });
});
