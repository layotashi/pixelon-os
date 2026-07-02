/**
 * tests/ui/layout_visibility.test.js — Box 子の可視性切替で
 * リーフのストレッチ幅が正しく追従するかを検証する。
 *
 * 回帰防止対象: Box.layout が maxW を計算するタイミングで、
 * 「直前まで隠れていて再表示された Box」の内部リーフがまだ
 * visible=false のままだと、その HBox.w が 0 に縮退し、
 * 結果として VBox 全体の maxW が過小評価され、HSep などの
 * ストレッチ対象が縮んでしまうバグ (隠れていた行 Box の再表示で再現)。
 */
import { describe, it, expect } from "vitest";
import { HBox, VBox } from "@/ui/layout.js";
import { FOCUS_MARGIN } from "@/ui/ui_constants.js";

class FakeWidget {
  constructor(w, h) {
    this.x = 0;
    this.y = 0;
    this.w = w;
    this.h = h;
    this.visible = true;
  }
}
class FakeHSep extends FakeWidget {
  constructor() {
    super(0, 1);
  }
}

describe("Box.layout 可視性カスケード", () => {
  it("hidden Box が再表示されたとき maxW が正しく再計算される", () => {
    // DISPLAY_TUNING を模した構造:
    //   pgRow (常時表示, narrow)
    //   sep0 (toggle で hide / show)
    //   wideRow (toggle で hide / show, pgRow より広い)
    //   sep1 (toggle で hide / show)
    const pgRow = HBox([new FakeWidget(50, 9), new FakeWidget(20, 11)]);
    const sep0 = new FakeHSep();
    const wideRow = HBox([
      new FakeWidget(60, 9),
      new FakeWidget(80, 11),
      new FakeWidget(20, 9),
    ]);
    const sep1 = new FakeHSep();
    const root = VBox([pgRow, sep0, wideRow, sep1]);

    // 初期: 全 visible → HSep は wideRow の幅にストレッチされる
    root.layout(FOCUS_MARGIN, FOCUS_MARGIN);
    const initialW = sep0.w;
    expect(initialW).toBeGreaterThan(pgRow.w);
    expect(sep1.w).toBe(initialW);

    // hide: wideRow と両 HSep を隠す → pgRow だけが visible
    sep0.visible = false;
    wideRow.visible = false;
    sep1.visible = false;
    root.layout(FOCUS_MARGIN, FOCUS_MARGIN);

    // show: 元の状態に戻す → maxW は wideRow.w に戻り、HSep も伸びるべき
    sep0.visible = true;
    wideRow.visible = true;
    sep1.visible = true;
    root.layout(FOCUS_MARGIN, FOCUS_MARGIN);

    expect(sep0.w).toBe(initialW);
    expect(sep1.w).toBe(initialW);
  });

  it("ネストした非表示 Box のリーフは _setLeavesVisible(true) で誤って復活しない", () => {
    // 親が visible、内側の Box が hidden、その先の leaf が hidden のままであるべき。
    // _setLeavesVisible(true) が再帰的に伝播してネスト非表示 Box の leaf まで
    // 可視化してしまう副作用を防ぐ。
    const innerLeaf = new FakeWidget(10, 10);
    const innerHidden = HBox([innerLeaf]);
    innerHidden.visible = false;

    const visibleLeaf = new FakeWidget(20, 10);
    const visibleSibling = HBox([visibleLeaf]);

    const root = VBox([visibleSibling, innerHidden]);
    root.layout(FOCUS_MARGIN, FOCUS_MARGIN);

    expect(innerLeaf.visible).toBe(false);
    expect(visibleLeaf.visible).toBe(true);

    // 2 回目の layout でも同じ
    root.layout(FOCUS_MARGIN, FOCUS_MARGIN);
    expect(innerLeaf.visible).toBe(false);
    expect(visibleLeaf.visible).toBe(true);
  });

  it("再表示時に直接子の HSep の幅が正しく拡張される (行 Box 再表示のミニチュア)", () => {
    const wideRow = HBox([new FakeWidget(100, 10)]);
    const narrowRow = HBox([new FakeWidget(30, 10)]);
    const sep = new FakeHSep();
    const root = VBox([wideRow, sep, narrowRow]);
    root.layout(0, 0);
    const wideInitial = sep.w;
    expect(wideInitial).toBe(wideRow.w);

    // wideRow を一時的に hide してから show
    wideRow.visible = false;
    sep.visible = false;
    root.layout(0, 0);
    wideRow.visible = true;
    sep.visible = true;
    root.layout(0, 0);

    expect(sep.w).toBe(wideInitial);
  });

  it("複数階層の Box 構造で wide な孫の Box が hide→show されても上位 sep が正しい幅になる", () => {
    // 2 階層構造: tuningRoot > [pgRow, sep, effectGroup]
    // effectGroup は内側に wide な行を持つ
    // effectGroup を OFF→ON しても sep が縮みっぱなしにならないこと
    const pgRow = HBox([new FakeWidget(50, 9), new FakeWidget(20, 11)]);
    const sep = new FakeHSep();
    const effectRow = HBox([
      new FakeWidget(60, 9),
      new FakeWidget(80, 11),
      new FakeWidget(20, 9),
    ]);
    const root = VBox([pgRow, sep, effectRow]);

    root.layout(0, 0);
    const initialW = sep.w;
    expect(initialW).toBe(effectRow.w);

    // effectRow を hide
    effectRow.visible = false;
    sep.visible = false;
    root.layout(0, 0);

    // re-show
    effectRow.visible = true;
    sep.visible = true;
    root.layout(0, 0);

    expect(sep.w).toBe(initialW);
  });
});
