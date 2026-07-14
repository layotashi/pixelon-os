/**
 * roll_edit.test.js — ROLL の選択編集 (時間スケール / ペースト配置 / グリッド線判定)。
 *
 * 描画や WM 状態に依らない純関数を対象にする:
 *   - scaleNotesInTime: 選択ノート群を先頭ノート起点で時間方向へ倍/除。丸めず、成立しない
 *     (割り切れない・最小グリッド未満・枠外) ときは null を返す = 操作を実行しない。
 *   - pasteNotesAt: 基準グリッド線へノート群を配置 (右端はみ出しは詰め、枠外は捨てる)。
 *   - gridLineAtX: クリック X → 最寄りグリッド線 (セル中央しきい値)。既定桁幅 (=15) 前提。
 */
import { describe, it, expect } from "vitest";
import { scaleNotesInTime, pasteNotesAt, gridLineAtX, foldedRows } from "@/app/roll/roll.js";

const ROWS = 128; // ROLL の音高行数。row = ROWS-1-pitch

const COLS = 64; // ROLL の総列数 (4 小節 × 16 分)。枠外判定に使う

/** テスト用ノート簡易生成 */
const N = (col, len, row = 60, vel = 100) => ({ col, row, len, vel });

describe("scaleNotesInTime — 時間スケール (2 倍 / 1/2 倍)", () => {
  it("2 倍: 先頭ノートの開始列を起点に開始・長さを 2 倍する", () => {
    const sel = [N(0, 1), N(2, 2)];
    const out = scaleNotesInTime(sel, 2, COLS);
    expect(out).toEqual([
      { col: 0, row: 60, len: 2, vel: 100 },
      { col: 4, row: 60, len: 4, vel: 100 },
    ]);
  });

  it("起点は 0 ではなく選択先頭ノートの開始時刻", () => {
    const sel = [N(4, 1), N(6, 2)]; // origin = 4
    const out = scaleNotesInTime(sel, 2, COLS);
    // 4→4 (off0), 6→4+ (6-4)*2 = 8。長さは 2 倍
    expect(out).toEqual([
      { col: 4, row: 60, len: 2, vel: 100 },
      { col: 8, row: 60, len: 4, vel: 100 },
    ]);
  });

  it("順序と行/ベロシティは保ったまま倍にする", () => {
    const sel = [N(0, 2, 72, 90), N(2, 2, 48, 40)];
    const out = scaleNotesInTime(sel, 2, COLS);
    expect(out).toEqual([
      { col: 0, row: 72, len: 4, vel: 90 },
      { col: 4, row: 48, len: 4, vel: 40 },
    ]);
  });

  it("1/2 倍: すべての長さと起点からの距離が偶数なら成立する", () => {
    const sel = [N(0, 2), N(4, 4)]; // origin 0。off 0/4、len 2/4 いずれも偶数
    const out = scaleNotesInTime(sel, 0.5, COLS);
    expect(out).toEqual([
      { col: 0, row: 60, len: 1, vel: 100 },
      { col: 2, row: 60, len: 2, vel: 100 },
    ]);
  });

  it("1/2 倍: 長さが 1 のノートがあると最小グリッド未満になり null (丸めない)", () => {
    const sel = [N(0, 1)];
    expect(scaleNotesInTime(sel, 0.5, COLS)).toBeNull();
  });

  it("1/2 倍: 長さが奇数だと割り切れず null", () => {
    const sel = [N(0, 2), N(2, 3)]; // len 3 は 2 で割り切れない
    expect(scaleNotesInTime(sel, 0.5, COLS)).toBeNull();
  });

  it("1/2 倍: 起点からの距離が奇数だと割り切れず null", () => {
    const sel = [N(0, 2), N(3, 2)]; // off 3 は 2 で割り切れない
    expect(scaleNotesInTime(sel, 0.5, COLS)).toBeNull();
  });

  it("2 倍: 結果が右枠を越えるなら null (はみ出しは実行しない)", () => {
    const sel = [N(0, 2)];
    expect(scaleNotesInTime(sel, 2, 3)).toBeNull(); // 0+4 = 4 > 3
  });

  it("空の選択・不正な倍率は null", () => {
    expect(scaleNotesInTime([], 2, COLS)).toBeNull();
    expect(scaleNotesInTime([N(0, 1)], 0, COLS)).toBeNull();
  });

  it("浮動小数の誤差で成立判定がブレない (1/2 を整数演算で扱う)", () => {
    // 8/2, 4/2 は誤差なく 4,2。0.5 を掛ける実装だと 4 * 0.5 等でも今回は安全だが、
    // 割り切れ判定が整数で行われることを確認する。
    const sel = [N(0, 8), N(8, 4)];
    const out = scaleNotesInTime(sel, 0.5, COLS);
    expect(out).toEqual([
      { col: 0, row: 60, len: 4, vel: 100 },
      { col: 4, row: 60, len: 2, vel: 100 },
    ]);
  });
});

describe("pasteNotesAt — 基準グリッド線へ配置", () => {
  const clip = [
    { dCol: 0, row: 60, len: 2, vel: 100 },
    { dCol: 4, row: 62, len: 1, vel: 100 },
  ];

  it("基準列 refCol を先頭に、相対位置を保って配置する", () => {
    const out = pasteNotesAt(clip, 8, COLS);
    expect(out).toEqual([
      { col: 8, row: 60, len: 2, vel: 100 },
      { col: 12, row: 62, len: 1, vel: 100 },
    ]);
  });

  it("右端をはみ出す長さは詰める", () => {
    const out = pasteNotesAt([{ dCol: 0, row: 60, len: 4, vel: 100 }], 62, COLS);
    expect(out).toEqual([{ col: 62, row: 60, len: 2, vel: 100 }]); // 64-62 = 2
  });

  it("開始が枠外に出るノートは捨てる", () => {
    const out = pasteNotesAt([{ dCol: 10, row: 60, len: 1, vel: 100 }], 60, COLS);
    expect(out).toEqual([]); // col 70 >= 64
  });
});

describe("foldedRows — FOLD の表示行に全 4 トラックのノート行を含める", () => {
  it("選択トラックのノート行 + 非選択トラックのノート行を昇順で和集合にする", () => {
    const selNotes = [{ row: 60 }, { row: 55 }];
    const others = [
      { notes: [{ pitch: ROWS - 1 - 40 }] }, // row 40
      { notes: [{ pitch: ROWS - 1 - 70 }] }, // row 70
    ];
    expect(foldedRows(selNotes, others)).toEqual([40, 55, 60, 70]);
  });

  it("重複する行は 1 度だけ (選択と非選択が同じ行でも二重にならない)", () => {
    const selNotes = [{ row: 50 }];
    const others = [{ notes: [{ pitch: ROWS - 1 - 50 }] }]; // 同じ row 50
    expect(foldedRows(selNotes, others)).toEqual([50]);
  });

  it("非選択トラックにしかノートが無くても、その行が表示される (ゴーストが隠れない)", () => {
    const selNotes = []; // 選択トラックは空
    const others = [{ notes: [{ pitch: ROWS - 1 - 62 }, { pitch: ROWS - 1 - 48 }] }];
    expect(foldedRows(selNotes, others)).toEqual([48, 62]);
  });

  it("全トラック空なら空配列", () => {
    expect(foldedRows([], [{ notes: [] }, { notes: [] }])).toEqual([]);
  });
});

describe("gridLineAtX — セル中央しきい値でグリッド線を選ぶ (既定桁幅)", () => {
  // 既定 cellW=15、列 0 の本体は X=[2,17) でセル中央は 9.5。中央より左=左線(0)、以上=右線(1)。
  it("原点は先頭グリッド線 0", () => {
    expect(gridLineAtX(0)).toBe(0);
  });
  it("セル中央より左は左側のグリッド線", () => {
    expect(gridLineAtX(9)).toBe(0);
  });
  it("セル中央より右は右側のグリッド線", () => {
    expect(gridLineAtX(10)).toBe(1);
  });
  it("大きく右へ出ても最終グリッド線 (COLS) を超えない", () => {
    expect(gridLineAtX(100000)).toBe(COLS);
  });
});
