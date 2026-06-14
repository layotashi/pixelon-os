/**
 * audio/playback_engine.js — renderToBuffer のテスト
 *
 * オフラインレンダラーが正しく PCM を合成するか検証する。
 * core/audio.js の AudioContext 関連をモックし、
 * SynthChannel のプロパティは直接指定する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── core/audio.js をモック ──
// renderToBuffer が使うのは midiToFreq, sampleWaveformFn のみ
// (initAudio, getAudioContext, getMasterGain はスケジューラ側で使用)
vi.mock("@/core/audio.js", () => {
  /** MIDI → Hz (A4=69=440Hz) */
  function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  /** 波形サンプル関数 (実装と同一) */
  function sampleWaveformFn(wf, t) {
    switch (wf) {
      case "saw":
        return 1 - 2 * t;
      case "tri":
        return t < 0.25 ? 4 * t : t < 0.75 ? 2 - 4 * t : 4 * t - 4;
      case "sq50":
        return t < 0.5 ? 1 : -1;
      case "sq25":
        return t < 0.25 ? 1 : -1;
      case "sq12":
        return t < 0.125 ? 1 : -1;
      case "sine":
        return Math.sin(2 * Math.PI * t);
      case "noise":
        return Math.random() * 2 - 1;
      default:
        return 0;
    }
  }

  /** Fourier 係数 (実装と同一: band-limited 合成用) */
  function fourierCoeff(wf, n) {
    switch (wf) {
      case "saw":
        return { a: 0, b: 2 / (Math.PI * n) };
      case "tri": {
        if (n % 2 === 0) return { a: 0, b: 0 };
        const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
        return { a: 0, b: (8 * sign) / (Math.PI * Math.PI * n * n) };
      }
      case "sq50":
        if (n % 2 === 0) return { a: 0, b: 0 };
        return { a: 0, b: 4 / (Math.PI * n) };
      case "sq25": {
        const k = (Math.PI * n) / 2;
        return {
          a: (2 * Math.sin(k)) / (Math.PI * n),
          b: (2 * (1 - Math.cos(k))) / (Math.PI * n),
        };
      }
      case "sq12": {
        const k = (Math.PI * n) / 4;
        return {
          a: (2 * Math.sin(k)) / (Math.PI * n),
          b: (2 * (1 - Math.cos(k))) / (Math.PI * n),
        };
      }
      case "sine":
        return n === 1 ? { a: 0, b: 1 } : { a: 0, b: 0 };
      default:
        return { a: 0, b: 0 };
    }
  }

  return {
    initAudio: vi.fn(),
    getAudioContext: vi.fn(() => null),
    getMasterGain: vi.fn(() => null),
    midiToFreq,
    sampleWaveformFn,
    fourierCoeff,
    SynthChannel: vi.fn(),
  };
});

import {
  transportSetPianoRollCallbacks,
  setBpm,
  setLoopStart,
  setLoopEnd,
  renderToBuffer,
} from "@/audio/playback_engine.js";

// ── テスト用 SynthChannel 風オブジェクト ──

function makeMockChannel(opts = {}) {
  return {
    _waveform: opts.waveform || "sq50",
    _startPhase: opts.startPhase || 0,
    _adsrA: opts.adsrA !== undefined ? opts.adsrA : 0.001,
    _adsrD: opts.adsrD !== undefined ? opts.adsrD : 0.01,
    _adsrS: opts.adsrS !== undefined ? opts.adsrS : 1.0,
    _adsrR: opts.adsrR !== undefined ? opts.adsrR : 0.01,
    _volume: opts.volume !== undefined ? opts.volume : 1.0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("renderToBuffer", () => {
  beforeEach(() => {
    // デフォルト: 空トラック
    transportSetPianoRollCallbacks({
      getTracks: () => [],
      setPlayheadPos: () => {},
    });
    setBpm(120);
    setLoopStart(0);
    setLoopEnd(16); // 1 小節
  });

  it("ノートがない場合でもバッファを返す (全ゼロ)", () => {
    const { samples, sampleRate, duration } = renderToBuffer({
      sampleRate: 8000,
    });
    expect(sampleRate).toBe(8000);
    expect(duration).toBeGreaterThan(0);
    expect(samples.length).toBeGreaterThan(0);
    // 全サンプルがゼロ
    expect(samples.every((s) => s === 0)).toBe(true);
  });

  it("開始=終了 の場合は空バッファを返す", () => {
    const { samples } = renderToBuffer({
      sampleRate: 8000,
      startStep: 0,
      endStep: 0,
    });
    expect(samples.length).toBe(0);
  });

  it("矩形波ノートを含むバッファは非ゼロ", () => {
    const ch = makeMockChannel({ waveform: "sq50" });
    transportSetPianoRollCallbacks({
      getTracks: () => [
        {
          notes: [{ pitch: 69, start: 0, duration: 4 }], // A4, 1 beat
          channel: ch,
        },
      ],
      setPlayheadPos: () => {},
    });

    const { samples, sampleRate } = renderToBuffer({ sampleRate: 8000 });
    expect(sampleRate).toBe(8000);

    // ノートが鳴っている部分に非ゼロサンプルがある
    const hasNonZero = samples.some((s) => Math.abs(s) > 0.01);
    expect(hasNonZero).toBe(true);
  });

  it("サンプルが -1.0 ~ +1.0 にクリップされる", () => {
    // 音量最大で複数トラックを重ねてクリッピングを誘発
    const ch1 = makeMockChannel({ waveform: "sq50", volume: 1.0 });
    const ch2 = makeMockChannel({ waveform: "sq50", volume: 1.0 });
    transportSetPianoRollCallbacks({
      getTracks: () => [
        { notes: [{ pitch: 69, start: 0, duration: 4 }], channel: ch1 },
        { notes: [{ pitch: 69, start: 0, duration: 4 }], channel: ch2 },
      ],
      setPlayheadPos: () => {},
    });

    const { samples } = renderToBuffer({ sampleRate: 8000 });
    for (let i = 0; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(-1.0);
      expect(samples[i]).toBeLessThanOrEqual(1.0);
    }
  });

  it("音量 0 のチャンネルは無音", () => {
    const ch = makeMockChannel({ waveform: "sq50", volume: 0 });
    transportSetPianoRollCallbacks({
      getTracks: () => [
        { notes: [{ pitch: 60, start: 0, duration: 4 }], channel: ch },
      ],
      setPlayheadPos: () => {},
    });

    const { samples } = renderToBuffer({ sampleRate: 8000 });
    expect(samples.every((s) => s === 0)).toBe(true);
  });

  it("ループ範囲外のノートは無視される", () => {
    const ch = makeMockChannel({ waveform: "sq50" });
    transportSetPianoRollCallbacks({
      getTracks: () => [
        {
          notes: [{ pitch: 60, start: 20, duration: 4 }], // ループ外
          channel: ch,
        },
      ],
      setPlayheadPos: () => {},
    });
    setLoopStart(0);
    setLoopEnd(16);

    const { samples } = renderToBuffer({ sampleRate: 8000 });
    expect(samples.every((s) => s === 0)).toBe(true);
  });

  it("opts.startStep / endStep でループ範囲を上書きできる", () => {
    const ch = makeMockChannel({ waveform: "sq50" });
    transportSetPianoRollCallbacks({
      getTracks: () => [
        { notes: [{ pitch: 69, start: 4, duration: 4 }], channel: ch },
      ],
      setPlayheadPos: () => {},
    });

    // デフォルトループ範囲 (0-16) ではノート含まれる → 非ゼロ
    const r1 = renderToBuffer({ sampleRate: 8000, startStep: 0, endStep: 16 });
    expect(r1.samples.some((s) => Math.abs(s) > 0.01)).toBe(true);

    // ノート範囲外 (0-2) に絞る → 全ゼロ
    const r2 = renderToBuffer({ sampleRate: 8000, startStep: 0, endStep: 2 });
    expect(r2.samples.every((s) => s === 0)).toBe(true);
  });

  it("BPM を変えると出力バッファの長さが変わる", () => {
    setBpm(120);
    const r120 = renderToBuffer({
      sampleRate: 8000,
      startStep: 0,
      endStep: 16,
    });
    setBpm(60);
    const r60 = renderToBuffer({
      sampleRate: 8000,
      startStep: 0,
      endStep: 16,
    });

    // BPM 60 は BPM 120 の 2 倍の長さ
    expect(r60.samples.length).toBeGreaterThan(r120.samples.length * 1.9);
    expect(r60.samples.length).toBeLessThan(r120.samples.length * 2.1);
  });

  it("サンプリングレートを変えると出力バッファの長さが変わる", () => {
    const r8k = renderToBuffer({
      sampleRate: 8000,
      startStep: 0,
      endStep: 16,
    });
    const r16k = renderToBuffer({
      sampleRate: 16000,
      startStep: 0,
      endStep: 16,
    });

    expect(r16k.samples.length).toBeGreaterThan(r8k.samples.length * 1.9);
    expect(r16k.samples.length).toBeLessThan(r8k.samples.length * 2.1);
  });

  it("サイン波ノートが滑らかな波形を生成する", () => {
    const ch = makeMockChannel({
      waveform: "sine",
      adsrA: 0,
      adsrD: 0,
      adsrS: 1.0,
      adsrR: 0,
      volume: 1.0,
    });
    transportSetPianoRollCallbacks({
      getTracks: () => [
        {
          notes: [{ pitch: 69, start: 0, duration: 16 }], // A4 全域
          channel: ch,
        },
      ],
      setPlayheadPos: () => {},
    });

    const { samples } = renderToBuffer({ sampleRate: 44100 });
    // サイン波: 連続するサンプル間の差が小さい (ジャンプなし)
    let maxDiff = 0;
    for (let i = 1; i < Math.min(samples.length, 1000); i++) {
      const diff = Math.abs(samples[i] - samples[i - 1]);
      if (diff > maxDiff) maxDiff = diff;
    }
    // 440Hz @ 44100Hz のサイン波: 1サンプルあたり最大変化 ≈ sin change ≈ 小さい
    expect(maxDiff).toBeLessThan(0.15);
  });

  it("ADSR Release で音がフェードアウトする", () => {
    const ch = makeMockChannel({
      waveform: "sq50",
      adsrA: 0,
      adsrD: 0,
      adsrS: 1.0,
      adsrR: 0.5, // 500ms release
      volume: 1.0,
    });
    transportSetPianoRollCallbacks({
      getTracks: () => [
        {
          notes: [{ pitch: 69, start: 0, duration: 4 }], // 1 beat = 0.5s @ 120bpm
          channel: ch,
        },
      ],
      setPlayheadPos: () => {},
    });
    setBpm(120);

    const { samples, sampleRate } = renderToBuffer({
      sampleRate: 8000,
      startStep: 0,
      endStep: 16,
    });

    // ノートオン中 (0~0.5s) の RMS
    const onEnd = Math.floor(0.5 * sampleRate);
    let onRms = 0;
    for (let i = 0; i < onEnd; i++) onRms += samples[i] * samples[i];
    onRms = Math.sqrt(onRms / onEnd);

    // リリース後半 (0.75~1.0s) の RMS
    const relStart = Math.floor(0.75 * sampleRate);
    const relEnd = Math.floor(1.0 * sampleRate);
    let relRms = 0;
    const relCount = relEnd - relStart;
    for (let i = relStart; i < relEnd && i < samples.length; i++) {
      relRms += samples[i] * samples[i];
    }
    relRms = Math.sqrt(relRms / relCount);

    // リリース後半の方がノートオン中より小さい
    expect(relRms).toBeLessThan(onRms);
  });

  it("ノイズ波形は決定的 (同一パラメータで同じ結果)", () => {
    const ch = makeMockChannel({
      waveform: "noise",
      adsrA: 0,
      adsrD: 0,
      adsrS: 1.0,
      adsrR: 0,
      volume: 1.0,
    });
    const getTracks = () => [
      { notes: [{ pitch: 60, start: 0, duration: 4 }], channel: ch },
    ];
    transportSetPianoRollCallbacks({
      getTracks,
      setPlayheadPos: () => {},
    });

    const r1 = renderToBuffer({ sampleRate: 8000, startStep: 0, endStep: 8 });
    const r2 = renderToBuffer({ sampleRate: 8000, startStep: 0, endStep: 8 });

    expect(r1.samples.length).toBe(r2.samples.length);
    for (let i = 0; i < r1.samples.length; i++) {
      expect(r1.samples[i]).toBe(r2.samples[i]);
    }
  });

  it("複数トラックのノートがミックスされる", () => {
    const ch1 = makeMockChannel({ waveform: "sq50", volume: 0.5 });
    const ch2 = makeMockChannel({ waveform: "sine", volume: 0.5 });
    transportSetPianoRollCallbacks({
      getTracks: () => [
        { notes: [{ pitch: 69, start: 0, duration: 4 }], channel: ch1 },
        { notes: [{ pitch: 60, start: 0, duration: 4 }], channel: ch2 },
      ],
      setPlayheadPos: () => {},
    });

    const { samples } = renderToBuffer({ sampleRate: 8000 });
    // ミックスされたバッファに非ゼロサンプルがある
    expect(samples.some((s) => Math.abs(s) > 0.01)).toBe(true);
  });

  it("duration を正しく返す", () => {
    setBpm(120); // 1 beat = 0.5s, steps_per_beat = 4, 1 step = 0.125s
    const { duration } = renderToBuffer({
      sampleRate: 8000,
      startStep: 0,
      endStep: 16,
    });
    // 16 steps × 0.125s = 2.0s
    expect(duration).toBeCloseTo(2.0, 2);
  });
});

