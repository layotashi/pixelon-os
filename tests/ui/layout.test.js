/**
 * ui/layout.js — UI レイアウトのテスト
 *
 * Box / HBox / VBox と measureWidgets をテストする。
 * 全関数が {x, y, w, h} のプレーンオブジェクトで動作する純粋計算。
 */
import { describe, it, expect } from "vitest";
import { measureWidgets, Box, HBox, VBox } from "@/ui/layout.js";
import { GAP, MIN_GAP } from "@/ui/ui_constants.js";

/** テスト用ウィジェットオブジェクトを生成 */
function widget(x, y, w, h) {
  return { x, y, w, h };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  measureWidgets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("measureWidgets", () => {
  // FOCUS_MARGIN = 2

  it("単一ウィジェットの境界を計測", () => {
    const w = widget(10, 20, 30, 40);
    const size = measureWidgets([w]);
    // maxR = 10 + 30 = 40, maxB = 20 + 40 = 60
    // + FOCUS_MARGIN(2) + pad(0)
    expect(size.w).toBe(42);
    expect(size.h).toBe(62);
  });

  it("複数ウィジェットの外接矩形を計測", () => {
    const w1 = widget(5, 10, 30, 20);
    const w2 = widget(50, 5, 40, 30);
    const size = measureWidgets([w1, w2]);
    // maxR = max(5+30, 50+40) = max(35, 90) = 90
    // maxB = max(10+20, 5+30) = max(30, 35) = 35
    expect(size.w).toBe(92); // 90 + 2
    expect(size.h).toBe(37); // 35 + 2
  });

  it("pad パラメータが加算される", () => {
    const w = widget(0, 0, 100, 50);
    const size = measureWidgets([w], 8);
    // 100 + 8 + 2 = 110, 50 + 8 + 2 = 60
    expect(size.w).toBe(110);
    expect(size.h).toBe(60);
  });

  it("visible=false のウィジェットは無視される", () => {
    const w1 = widget(0, 0, 100, 50);
    const w2 = widget(0, 0, 200, 200);
    w2.visible = false;
    const size = measureWidgets([w1, w2]);
    expect(size.w).toBe(102); // 100 + 2
    expect(size.h).toBe(52); // 50 + 2
  });

  it("空の配列で 0 + margin を返す", () => {
    const size = measureWidgets([]);
    expect(size.w).toBe(2); // 0 + FOCUS_MARGIN
    expect(size.h).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Box / HBox / VBox
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("HBox", () => {
  it("デフォルト gap は GAP(4)", () => {
    const box = HBox([]);
    expect(box.gap).toBe(GAP);
    expect(box.dir).toBe("h");
  });

  it("カスタム gap を指定できる", () => {
    const box = HBox([], 8);
    expect(box.gap).toBe(8);
  });

  it("MIN_GAP 未満の gap は MIN_GAP にクランプされる", () => {
    const box = HBox([], 1);
    expect(box.gap).toBe(MIN_GAP);
  });

  it("子を左→右に配置し垂直中央揃えする", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 30, 20); // 一番高い
    const c = widget(0, 0, 10, 14);
    const box = HBox([a, b, c]);
    box.layout(0, 0);

    // a: x=0, y=(20-10)>>1=5
    expect(a.x).toBe(0);
    expect(a.y).toBe(5);
    // b: x=0+20+4=24, y=(20-20)>>1=0
    expect(b.x).toBe(24);
    expect(b.y).toBe(0);
    // c: x=24+30+4=58, y=(20-14)>>1=3
    expect(c.x).toBe(58);
    expect(c.y).toBe(3);
  });

  it("w = 子幅合計 + gap*(n-1), h = 最大子高さ", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 30, 15);
    const box = HBox([a, b]);
    expect(box.w).toBe(20 + 30 + 4); // 54
    expect(box.h).toBe(15);
  });

  it("layout 開始位置のオフセットを反映する", () => {
    const a = widget(0, 0, 20, 10);
    const box = HBox([a]);
    box.layout(5, 10);

    expect(a.x).toBe(5);
    expect(a.y).toBe(10);
    expect(box.x).toBe(5);
    expect(box.y).toBe(10);
  });
});

describe("VBox", () => {
  it("デフォルト gap は GAP(4)", () => {
    const box = VBox([]);
    expect(box.gap).toBe(GAP);
    expect(box.dir).toBe("v");
  });

  it("子を上→下に配置する (左揃え)", () => {
    const a = widget(0, 0, 30, 10);
    const b = widget(0, 0, 20, 15);
    const c = widget(0, 0, 40, 8);
    const box = VBox([a, b, c]);
    box.layout(0, 0);

    // a: x=0, y=0
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    // b: x=0, y=0+10+4=14
    expect(b.x).toBe(0);
    expect(b.y).toBe(14);
    // c: x=0, y=14+15+4=33
    expect(c.x).toBe(0);
    expect(c.y).toBe(33);
  });

  it("w = 最大子幅, h = 子高さ合計 + gap*(n-1)", () => {
    const a = widget(0, 0, 30, 10);
    const b = widget(0, 0, 20, 15);
    const box = VBox([a, b]);
    expect(box.w).toBe(30);
    expect(box.h).toBe(10 + 15 + 4); // 29
  });
});

describe("Box ネスト", () => {
  it("VBox > HBox のネストで正しく配置する", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 30, 10);
    const c = widget(0, 0, 50, 12);
    const root = VBox([HBox([a, b]), c]);
    root.layout(2, 2);

    // HBox: w = 20+30+4 = 54, h = 10
    // HBox の子:
    //   a: x=2, y=2
    //   b: x=2+20+4=26, y=2
    expect(a.x).toBe(2);
    expect(a.y).toBe(2);
    expect(b.x).toBe(26);
    expect(b.y).toBe(2);
    // c: y = 2 + 10 + 4 = 16
    expect(c.x).toBe(2);
    expect(c.y).toBe(16);
  });

  it("HBox > VBox のネストで正しく配置する", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 20, 12);
    const c = widget(0, 0, 30, 30);
    const root = HBox([VBox([a, b]), c]);
    root.layout(0, 0);

    // VBox: w = 20, h = 10+12+4 = 26
    // root HBox: h = max(26, 30) = 30
    // VBox y offset: (30-26)>>1 = 2
    //   a: x=0, y=2
    //   b: x=0, y=2+10+4=16
    expect(a.x).toBe(0);
    expect(a.y).toBe(2);
    expect(b.x).toBe(0);
    expect(b.y).toBe(16);
    // c: x=0+20+4=24, y=(30-30)>>1=0
    expect(c.x).toBe(24);
    expect(c.y).toBe(0);
  });

  it("3段ネスト (VBox > HBox > VBox) で正しく配置する", () => {
    const a = widget(0, 0, 10, 5);
    const b = widget(0, 0, 10, 7);
    const c = widget(0, 0, 20, 16); // h = innerVBox.h = 5+7+4 = 16
    const innerV = VBox([a, b]);
    const root = VBox([HBox([innerV, c])]);
    root.layout(0, 0);

    // innerV: w=10, h=5+7+4=16
    // HBox: h = max(16,16) = 16
    // innerV は y=(16-16)>>1=0 → a: y=0, b: y=5+4=9
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(b.x).toBe(0);
    expect(b.y).toBe(9);
    // c: x=10+4=14, y=0
    expect(c.x).toBe(14);
    expect(c.y).toBe(0);
  });
});

describe("Box visible 制御", () => {
  it("visible=false の子はサイズ計算から除外される", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 100, 100);
    b.visible = false;
    const box = HBox([a, b]);
    expect(box.w).toBe(20); // b は除外
    expect(box.h).toBe(10);
  });

  it("visible=false の子はレイアウトから除外される", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 30, 10);
    const c = widget(0, 0, 40, 10);
    b.visible = false;
    const box = HBox([a, b, c]);
    box.layout(0, 0);

    expect(a.x).toBe(0);
    // b はスキップ → c は a の直後
    expect(c.x).toBe(24); // 0 + 20 + 4
  });

  it("visible=false の Box 子要素はサイズ計算から除外される", () => {
    const a = widget(0, 0, 20, 10);
    const inner = HBox([widget(0, 0, 100, 100)]);
    inner.visible = false;
    const root = VBox([a, inner]);
    expect(root.w).toBe(20);
    expect(root.h).toBe(10);
  });

  it("全子が visible=false なら w=0, h=0", () => {
    const a = widget(0, 0, 20, 10);
    a.visible = false;
    const box = HBox([a]);
    expect(box.w).toBe(0);
    expect(box.h).toBe(0);
  });
});

describe("Box visible 伝搬 (layout → リーフ widget.visible)", () => {
  it("非表示 Box のリーフウィジェットが layout 後に visible=false になる", () => {
    const a = widget(0, 0, 10, 10);
    const b = widget(0, 0, 10, 10);
    const row = HBox([a, b]);
    row.visible = false;
    const root = VBox([row]);
    root.layout(0, 0);

    expect(a.visible).toBe(false);
    expect(b.visible).toBe(false);
  });

  it("再表示した Box のリーフウィジェットが layout 後に visible=true に復元される", () => {
    const a = widget(0, 0, 10, 10);
    const b = widget(0, 0, 10, 10);
    const row = HBox([a, b]);
    const root = VBox([row]);

    // 非表示にしてレイアウト
    row.visible = false;
    root.layout(0, 0);
    expect(a.visible).toBe(false);
    expect(b.visible).toBe(false);

    // 再表示してレイアウト
    row.visible = true;
    root.layout(0, 0);
    expect(a.visible).toBe(true);
    expect(b.visible).toBe(true);
  });

  it("ネストされた非表示 Box のリーフも再帰的に隠れる", () => {
    const leaf = widget(0, 0, 10, 10);
    const inner = HBox([leaf]);
    const outer = VBox([inner]);
    outer.visible = false;
    const root = VBox([outer]);
    root.layout(0, 0);

    expect(leaf.visible).toBe(false);
  });

  it("親 Box が表示で子 Box が非表示なら、子のリーフだけ隠れる", () => {
    const a = widget(0, 0, 10, 10);
    const b = widget(0, 0, 10, 10);
    const rowA = HBox([a]);
    const rowB = HBox([b]);
    rowB.visible = false;
    const root = VBox([rowA, rowB]);
    root.layout(0, 0);

    expect(a.visible).toBe(true);
    expect(b.visible).toBe(false);
  });

  it("非表示後に表示した Box の子は正しい座標に配置される", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 30, 10);
    const row = HBox([a, b]);
    const root = VBox([row]);

    // 非表示→表示のサイクル
    row.visible = false;
    root.layout(2, 2);
    row.visible = true;
    root.layout(2, 2);

    expect(a.x).toBe(2);
    expect(a.y).toBe(2);
    expect(b.x).toBe(26); // 2 + 20 + 4
    expect(b.y).toBe(2);
  });

  it("直接ウィジェット子 (非 Box) の visible=false は _vis で除外される", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 30, 10);
    b.visible = false;
    const root = VBox([a, b]);
    root.layout(0, 0);

    // b は _vis() で除外されるだけ。b.visible は false のまま
    expect(b.visible).toBe(false);
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
  });
});

describe("Box leaves", () => {
  it("リーフウィジェットを平坦な配列で返す", () => {
    const a = widget(0, 0, 10, 10);
    const b = widget(0, 0, 10, 10);
    const c = widget(0, 0, 10, 10);
    const root = VBox([HBox([a, b]), c]);
    const result = root.leaves();
    expect(result).toEqual([a, b, c]);
  });

  it("visible=false のウィジェットも含む (WidgetGroup で非表示管理するため)", () => {
    const a = widget(0, 0, 10, 10);
    const b = widget(0, 0, 10, 10);
    b.visible = false;
    const box = HBox([a, b]);
    expect(box.leaves()).toEqual([a, b]);
  });

  it("空の Box は空配列を返す", () => {
    const box = VBox([]);
    expect(box.leaves()).toEqual([]);
  });

  it("深いネストでも全リーフを収集する", () => {
    const a = widget(0, 0, 10, 10);
    const b = widget(0, 0, 10, 10);
    const c = widget(0, 0, 10, 10);
    const root = VBox([HBox([VBox([a]), b]), c]);
    expect(root.leaves()).toEqual([a, b, c]);
  });
});

describe("Box measure", () => {
  // FOCUS_MARGIN = 2

  it("layout 後のバウンディングボックスを返す", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 30, 15);
    const box = HBox([a, b]);
    box.layout(2, 2); // FOCUS_MARGIN 開始

    // box.x=2, box.w=20+30+4=54 → w = 2+54+0+2 = 58
    // box.y=2, box.h=15         → h = 2+15+0+2 = 19
    const size = box.measure();
    expect(size.w).toBe(58);
    expect(size.h).toBe(19);
  });

  it("pad パラメータが加算される", () => {
    const a = widget(0, 0, 50, 30);
    const box = VBox([a]);
    box.layout(2, 2);

    const size = box.measure(4);
    // w = 2 + 50 + 4 + 2 = 58
    // h = 2 + 30 + 4 + 2 = 38
    expect(size.w).toBe(58);
    expect(size.h).toBe(38);
  });

  it("空の Box の measure は開始位置 + margin のみ", () => {
    const box = HBox([]);
    box.layout(2, 2);
    const size = box.measure();
    // w = 2 + 0 + 0 + 2 = 4
    expect(size.w).toBe(4);
    expect(size.h).toBe(4);
  });
});

describe("Box 単一子", () => {
  it("HBox に単一子を配置", () => {
    const a = widget(0, 0, 40, 20);
    const box = HBox([a]);
    box.layout(5, 10);
    expect(a.x).toBe(5);
    expect(a.y).toBe(10);
    expect(box.w).toBe(40);
    expect(box.h).toBe(20);
  });

  it("VBox に単一子を配置", () => {
    const a = widget(0, 0, 40, 20);
    const box = VBox([a]);
    box.layout(5, 10);
    expect(a.x).toBe(5);
    expect(a.y).toBe(10);
    expect(box.w).toBe(40);
    expect(box.h).toBe(20);
  });
});

describe("Box gap クランプ", () => {
  it("HBox gap=0 は MIN_GAP にクランプされる", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 30, 10);
    const box = HBox([a, b], 0);
    expect(box.gap).toBe(MIN_GAP);
    box.layout(0, 0);
    expect(a.x).toBe(0);
    expect(b.x).toBe(20 + MIN_GAP); // MIN_GAP 分の間隔
    expect(box.w).toBe(20 + 30 + MIN_GAP);
  });

  it("VBox gap=0 は MIN_GAP にクランプされる", () => {
    const a = widget(0, 0, 20, 10);
    const b = widget(0, 0, 20, 15);
    const box = VBox([a, b], 0);
    expect(box.gap).toBe(MIN_GAP);
    box.layout(0, 0);
    expect(a.y).toBe(0);
    expect(b.y).toBe(10 + MIN_GAP);
    expect(box.h).toBe(10 + 15 + MIN_GAP);
  });

  it("gap=MIN_GAP はそのまま受け入れられる", () => {
    const box = HBox([], MIN_GAP);
    expect(box.gap).toBe(MIN_GAP);
  });

  it("gap > MIN_GAP はそのまま受け入れられる", () => {
    const box = VBox([], MIN_GAP + 2);
    expect(box.gap).toBe(MIN_GAP + 2);
  });
});

