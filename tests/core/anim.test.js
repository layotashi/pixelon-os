/**
 * core/anim.js — イージング関数のテスト
 *
 * すべてのイージング関数は t=0 → 0, t=1 → 1 の境界値を満たす。
 * 中間値の単調性・範囲を各カテゴリごとにテストする。
 */
import { describe, it, expect } from "vitest";
import {
  clamp01,
  lerp,
  normalizeTime,
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeInSine,
  easeOutSine,
  easeInOutSine,
  easeInExpo,
  easeOutExpo,
  easeInOutExpo,
  easeInBack,
  easeOutBack,
  easeInOutBack,
  easeInElastic,
  easeOutElastic,
  easeInOutElastic,
  easeInBounce,
  easeOutBounce,
  easeInOutBounce,
  stepped,
  easings,
  easingNames,
} from "@/core/anim.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ユーティリティ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("clamp01", () => {
  it("0–1 の範囲内をそのまま返す", () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
  });

  it("負数を 0 にクランプ", () => {
    expect(clamp01(-0.1)).toBe(0);
    expect(clamp01(-100)).toBe(0);
  });

  it("1 超を 1 にクランプ", () => {
    expect(clamp01(1.1)).toBe(1);
    expect(clamp01(999)).toBe(1);
  });
});

describe("lerp", () => {
  it("t=0 で a, t=1 で b", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it("t=0.5 で中間値", () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it("負の範囲でも正しく補間", () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });
});

describe("normalizeTime", () => {
  it("elapsed=0 → 0", () => {
    expect(normalizeTime(0, 1000)).toBe(0);
  });

  it("elapsed=duration → 1", () => {
    expect(normalizeTime(1000, 1000)).toBe(1);
  });

  it("中間値を正しく返す", () => {
    expect(normalizeTime(500, 1000)).toBeCloseTo(0.5);
  });

  it("duration が 0 以下なら 1 を返す", () => {
    expect(normalizeTime(0, 0)).toBe(1);
    expect(normalizeTime(100, -1)).toBe(1);
  });

  it("elapsed > duration は 1 にクランプ", () => {
    expect(normalizeTime(2000, 1000)).toBe(1);
  });

  it("elapsed < 0 は 0 にクランプ", () => {
    expect(normalizeTime(-100, 1000)).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  全イージング関数の共通テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Back / Elastic を除く、0–1 範囲に収まるイージング群
const standardEasings = [
  ["linear", linear],
  ["easeInQuad", easeInQuad],
  ["easeOutQuad", easeOutQuad],
  ["easeInOutQuad", easeInOutQuad],
  ["easeInCubic", easeInCubic],
  ["easeOutCubic", easeOutCubic],
  ["easeInOutCubic", easeInOutCubic],
  ["easeInQuart", easeInQuart],
  ["easeOutQuart", easeOutQuart],
  ["easeInOutQuart", easeInOutQuart],
  ["easeInSine", easeInSine],
  ["easeOutSine", easeOutSine],
  ["easeInOutSine", easeInOutSine],
  ["easeInExpo", easeInExpo],
  ["easeOutExpo", easeOutExpo],
  ["easeInOutExpo", easeInOutExpo],
  ["easeInBounce", easeInBounce],
  ["easeOutBounce", easeOutBounce],
  ["easeInOutBounce", easeInOutBounce],
];

// オーバーシュートするイージング
const overshootEasings = [
  ["easeInBack", easeInBack],
  ["easeOutBack", easeOutBack],
  ["easeInOutBack", easeInOutBack],
  ["easeInElastic", easeInElastic],
  ["easeOutElastic", easeOutElastic],
  ["easeInOutElastic", easeInOutElastic],
];

describe("全イージング関数の境界値", () => {
  const allEasings = [...standardEasings, ...overshootEasings];

  it.each(allEasings)("%s: t=0 → 0", (_name, fn) => {
    expect(fn(0)).toBeCloseTo(0, 10);
  });

  it.each(allEasings)("%s: t=1 → 1", (_name, fn) => {
    expect(fn(1)).toBeCloseTo(1, 10);
  });
});

describe("標準イージングの範囲 (0–1)", () => {
  it.each(standardEasings)("%s: 中間値が 0–1 に収まる", (_name, fn) => {
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const v = fn(t);
      expect(v).toBeGreaterThanOrEqual(-0.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });
});

describe("オーバーシュート系のテスト", () => {
  it("easeInBack: t=0.5 付近で負になる", () => {
    // Back は開始時にオーバーシュートする
    expect(easeInBack(0.2)).toBeLessThan(0);
  });

  it("easeOutBack: t=0.8 付近で 1 を超える", () => {
    expect(easeOutBack(0.8)).toBeGreaterThan(1);
  });

  it("easeInElastic: 中間で振動する", () => {
    const values = [];
    for (let i = 1; i < 10; i++) {
      values.push(easeInElastic(i / 10));
    }
    const hasNegative = values.some((v) => v < 0);
    expect(hasNegative).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  easeIn vs easeOut の対称性テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("In/Out 対称性", () => {
  const pairs = [
    [easeInQuad, easeOutQuad],
    [easeInCubic, easeOutCubic],
    [easeInQuart, easeOutQuart],
    [easeInSine, easeOutSine],
    [easeInExpo, easeOutExpo],
    [easeInBounce, easeOutBounce],
  ];

  it.each(pairs)("easeIn(t) + easeOut(1-t) ≈ 1", (easeIn, easeOut) => {
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      expect(easeIn(t) + easeOut(1 - t)).toBeCloseTo(1, 5);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  InOut 対称性: f(0.5-d) + f(0.5+d) ≈ 1
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("InOut 中央対称性", () => {
  const inoutFns = [
    ["easeInOutQuad", easeInOutQuad],
    ["easeInOutCubic", easeInOutCubic],
    ["easeInOutQuart", easeInOutQuart],
    ["easeInOutSine", easeInOutSine],
    ["easeInOutExpo", easeInOutExpo],
  ];

  it.each(inoutFns)("%s: f(0.5-d) + f(0.5+d) ≈ 1", (_name, fn) => {
    for (let i = 1; i < 5; i++) {
      const d = i / 10;
      expect(fn(0.5 - d) + fn(0.5 + d)).toBeCloseTo(1, 5);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  stepped ラッパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("stepped", () => {
  it("ステップ数に応じて離散化される", () => {
    const fn = stepped(linear, 4);
    expect(fn(0)).toBe(0);
    expect(fn(0.1)).toBe(0); // 0.1 * 4 = 0.4 → floor → 0 → 0/4 = 0
    expect(fn(0.3)).toBe(0.25); // 0.3 * 4 = 1.2 → floor → 1 → 1/4 = 0.25
    expect(fn(0.5)).toBe(0.5); // 0.5 * 4 = 2.0 → floor → 2 → 2/4 = 0.5
    expect(fn(0.9)).toBe(0.75); // 0.9 * 4 = 3.6 → floor → 3 → 3/4 = 0.75
  });

  it("t=1 で正確に 1 を返す", () => {
    const fn = stepped(linear, 8);
    expect(fn(1)).toBe(1);
  });

  it("t=0.999... も 1 未満", () => {
    const fn = stepped(linear, 4);
    expect(fn(0.999)).toBeLessThan(1);
  });

  it("非線形イージングでも離散化される", () => {
    const fn = stepped(easeInQuad, 2);
    // easeInQuad(0.5) = 0.25 → floor(0.25*2)/2 = 0/2 = 0
    expect(fn(0.5)).toBe(0);
    // easeInQuad(0.8) = 0.64 → floor(0.64*2)/2 = 1/2 = 0.5
    expect(fn(0.8)).toBe(0.5);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  辞書・名前一覧
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("easings 辞書", () => {
  it("全 25 関数が登録されている", () => {
    expect(Object.keys(easings).length).toBe(25);
  });

  it("easingNames と辞書のキーが一致", () => {
    expect(easingNames).toEqual(Object.keys(easings));
  });

  it("辞書の値がすべて関数", () => {
    for (const fn of Object.values(easings)) {
      expect(typeof fn).toBe("function");
    }
  });

  it("辞書経由で呼んでも同じ結果", () => {
    expect(easings.linear(0.5)).toBe(linear(0.5));
    expect(easings.easeInQuad(0.5)).toBe(easeInQuad(0.5));
  });
});

