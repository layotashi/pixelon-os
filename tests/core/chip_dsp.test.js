/**
 * core/chip_dsp.js — チップ音源の純ロジックの契約テスト。
 *
 * 波形メモリ生成・16 段音量量子化・再生位置数式・微小窓のノート発火 (ループ跨ぎ含む) を固定する。
 * ここは AudioContext/AudioWorklet 非依存の純関数なので Node で直接検証できる。ワークレット
 * (chip_worklet.js) は同じ数式をミラー実装するため、ここが「発火タイミングの正典」になる。
 */
import { describe, it, expect } from "vitest";
import {
  TABLE_SIZE,
  VOLUME_STEPS,
  CHIP_WAVEFORMS,
  buildWavetable,
  buildWavetables,
  quantizeVolume16,
  beatAtTime,
  notesOnsetsInWindow,
} from "@/core/chip_dsp.js";
import { sampleWaveformFn, waveformGain } from "@/core/audio.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  波形メモリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildWavetable", () => {
  it("既定長 TABLE_SIZE のテーブルを返す", () => {
    const t = buildWavetable("saw");
    expect(t).toBeInstanceOf(Float32Array);
    expect(t).toHaveLength(TABLE_SIZE);
  });

  it("各サンプルは sampleWaveformFn(i/size) × 正規化ゲイン (波形メモリの定義)", () => {
    const size = 16;
    const t = buildWavetable("sq50", size);
    const g = waveformGain("sq50");
    for (let i = 0; i < size; i++) {
      expect(t[i]).toBeCloseTo(sampleWaveformFn("sq50", i / size) * g, 6);
    }
  });

  it("saw は先頭 (正規化ゲイン) から下降し中央で 0 を通る", () => {
    const t = buildWavetable("saw", 4);
    expect(t[0]).toBeCloseTo(waveformGain("saw"), 6); // (1 - 2*0) × gain
    expect(t[2]).toBeCloseTo(0, 6); // (1 - 2*0.5) × gain = 0
  });

  it("パルス波は非対称な DC ブースト分だけ強く正規化される (sq12 < sq25 < sq50)", () => {
    // DC 除去後ピーク sq50=1 / sq25=1.5 / sq12=1.75 に反比例してゲインが下がる。
    expect(waveformGain("sq50")).toBeGreaterThan(waveformGain("sq25"));
    expect(waveformGain("sq25")).toBeGreaterThan(waveformGain("sq12"));
    // sq50 と saw/tri/sine/noise は同じ天井 (対称波・ノイズは DC≈0)。
    expect(waveformGain("saw")).toBeCloseTo(waveformGain("sq50"), 6);
    expect(waveformGain("noise")).toBeCloseTo(waveformGain("sq50"), 6);
  });
});

describe("buildWavetables", () => {
  it("全調性波形のテーブルを返す (noise は含まない)", () => {
    const tables = buildWavetables(8);
    for (const wf of CHIP_WAVEFORMS) {
      expect(tables[wf]).toBeInstanceOf(Float32Array);
      expect(tables[wf]).toHaveLength(8);
    }
    expect(tables.noise).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  16 段音量量子化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("quantizeVolume16", () => {
  it("0 と 1 の端は保つ", () => {
    expect(quantizeVolume16(0)).toBe(0);
    expect(quantizeVolume16(1)).toBe(1);
  });

  it("範囲外はクランプする", () => {
    expect(quantizeVolume16(-0.5)).toBe(0);
    expect(quantizeVolume16(2)).toBe(1);
  });

  it("15 分割の格子にスナップする", () => {
    const max = VOLUME_STEPS - 1; // 15
    expect(quantizeVolume16(1 / max)).toBeCloseTo(1 / max, 6);
    // 1/max のちょうど半分 → 最近傍 (0 か 1/max) に丸まる
    expect(quantizeVolume16(0.4 / max)).toBe(0);
    expect(quantizeVolume16(0.6 / max)).toBeCloseTo(1 / max, 6);
  });

  it("出力は必ず 16 段のいずれか", () => {
    const max = VOLUME_STEPS - 1;
    for (let i = 0; i <= 20; i++) {
      const q = quantizeVolume16(i / 20);
      const level = Math.round(q * max);
      expect(q).toBeCloseTo(level / max, 6);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  再生位置 (beat) — transport.update と同一数式
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("beatAtTime", () => {
  const base = {
    startBeat: 0,
    startTime: 0,
    bpm: 120, // 2 beat/sec
    loopStart: 0,
    loopEnd: 16,
    loopOn: true,
  };

  it("経過時刻 × テンポで進む", () => {
    expect(beatAtTime(1, base)).toBeCloseTo(2, 6); // 1 秒 = 2 beat
    expect(beatAtTime(0, base)).toBeCloseTo(0, 6);
  });

  it("ループ有効なら範囲内へ折り返す", () => {
    // 0..4 beat ループ、raw 6 beat → 2 に折返し
    const clock = { ...base, loopEnd: 4 };
    expect(beatAtTime(3, clock)).toBeCloseTo(2, 6); // 3 秒 = 6 beat → 2
  });

  it("ループ OFF なら折り返さない", () => {
    const clock = { ...base, loopOn: false };
    expect(beatAtTime(10, clock)).toBeCloseTo(20, 6);
  });

  it("アンカー (startBeat/startTime) を尊重する", () => {
    const clock = { ...base, startBeat: 4, startTime: 2, loopOn: false };
    expect(beatAtTime(2, clock)).toBeCloseTo(4, 6); // 開始時点
    expect(beatAtTime(3, clock)).toBeCloseTo(6, 6); // +1 秒 = +2 beat
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  微小窓のノート発火 (ワークレット process() 量子相当)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("notesOnsetsInWindow", () => {
  const clock = {
    startBeat: 0,
    startTime: 0,
    bpm: 120, // 2 beat/sec → 1 step(16分,4/拍) = 0.125 秒
    loopStart: 0,
    loopEnd: 16, // 64 step
    loopOn: true,
  };
  const stepsPerBeat = 4;

  it("窓に先頭が入るノートを on/off 時刻付きで返す", () => {
    // step 4 = beat 1 = 0.5 秒。len 4 step = 1 beat = 0.5 秒 → off 1.0 秒
    const pattern = { notes: [{ midi: 60, startStep: 4, lenSteps: 4, vel: 100 }], stepsPerBeat };
    const hits = notesOnsetsInWindow(pattern, clock, 0.49, 0.51);
    expect(hits).toHaveLength(1);
    expect(hits[0].midi).toBe(60);
    expect(hits[0].onTime).toBeCloseTo(0.5, 6);
    expect(hits[0].offTime).toBeCloseTo(1.0, 6);
  });

  it("窓に入らないノートは返さない", () => {
    const pattern = { notes: [{ midi: 60, startStep: 4, lenSteps: 4, vel: 100 }], stepsPerBeat };
    expect(notesOnsetsInWindow(pattern, clock, 0.0, 0.1)).toHaveLength(0);
    expect(notesOnsetsInWindow(pattern, clock, 0.6, 0.7)).toHaveLength(0);
  });

  it("密な連続ステップを取り違えず 1 発ずつ拾う", () => {
    // step0=0.0s, step1=0.125s, step2=0.25s
    const pattern = {
      notes: [
        { midi: 60, startStep: 0, lenSteps: 1, vel: 100 },
        { midi: 62, startStep: 1, lenSteps: 1, vel: 100 },
        { midi: 64, startStep: 2, lenSteps: 1, vel: 100 },
      ],
      stepsPerBeat,
    };
    const w0 = notesOnsetsInWindow(pattern, clock, -0.01, 0.01);
    const w1 = notesOnsetsInWindow(pattern, clock, 0.12, 0.13);
    const w2 = notesOnsetsInWindow(pattern, clock, 0.24, 0.26);
    expect(w0.map((h) => h.midi)).toEqual([60]);
    expect(w1.map((h) => h.midi)).toEqual([62]);
    expect(w2.map((h) => h.midi)).toEqual([64]);
  });

  it("ループ末尾→先頭を跨ぐ窓で次周の先頭ノートを先読み発火する", () => {
    // loop 0..16 beat = 8 秒。step0 の音は 8 秒 (2 周目先頭) にも鳴るべき。
    const pattern = { notes: [{ midi: 48, startStep: 0, lenSteps: 2, vel: 80 }], stepsPerBeat };
    const hits = notesOnsetsInWindow(pattern, clock, 7.99, 8.01);
    expect(hits).toHaveLength(1);
    expect(hits[0].midi).toBe(48);
    expect(hits[0].onTime).toBeCloseTo(8.0, 6); // 2 周目の先頭
  });

  it("非ループでは 1 度だけ発火し、周回では繰り返さない", () => {
    const noLoop = { ...clock, loopOn: false };
    const pattern = { notes: [{ midi: 60, startStep: 0, lenSteps: 2, vel: 100 }], stepsPerBeat };
    expect(notesOnsetsInWindow(pattern, noLoop, -0.01, 0.01)).toHaveLength(1);
    // 1 周期後 (8 秒) には鳴らない
    expect(notesOnsetsInWindow(pattern, noLoop, 7.99, 8.01)).toHaveLength(0);
  });

  it("ループ範囲外に置かれたノートはループ中は鳴らない", () => {
    // loop 0..4 beat (step0..15)。step 20 のノートは範囲外
    const shortLoop = { ...clock, loopEnd: 4 };
    const pattern = { notes: [{ midi: 72, startStep: 20, lenSteps: 2, vel: 100 }], stepsPerBeat };
    // step20 = beat5 = 2.5 秒相当だが、折返しで実際には鳴らない
    const hits = notesOnsetsInWindow(pattern, shortLoop, 0, 100);
    expect(hits).toHaveLength(0);
  });
});
