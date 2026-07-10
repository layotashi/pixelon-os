/**
 * tests/core/av_sync.test.js — 録画の時間基準 (映像フレーム ↔ PCM サンプル) のテスト。
 *
 * ここが守るべき不変条件は 1 つ:
 *   「n フレーム書き出したなら、音声もちょうど n/fps 秒ぶんである」
 * これが成り立つかぎり、映像と音声は原点も速度も一致する (= ずれない)。
 */
import { describe, it, expect } from "vitest";
import {
  framesDueAt,
  pcmLengthForFrames,
  fitPcmToVideo,
} from "@/core/av_sync.js";

describe("framesDueAt", () => {
  it("経過 0 で 1 フレーム目を出す", () => {
    expect(framesDueAt(0, 60)).toBe(1);
  });

  it("経過秒 × fps + 1 の累積フレーム数を返す", () => {
    expect(framesDueAt(1, 60)).toBe(61);
    expect(framesDueAt(0.5, 60)).toBe(31);
    expect(framesDueAt(2.5, 30)).toBe(76);
  });

  it("不正な入力では 0 を返す", () => {
    expect(framesDueAt(-1, 60)).toBe(0);
    expect(framesDueAt(NaN, 60)).toBe(0);
    expect(framesDueAt(1, 0)).toBe(0);
  });

  // 「前回捕捉時刻からの差分」で数えると tick 粒度の切り捨てが累積し、実効 fps が
  // 落ちて早回しになる (GIF 録画で実際に起きた)。絶対経過時間で数えれば累積しない。
  it("tick 間隔が fps 間隔と割り切れなくても平均 fps に収束する", () => {
    const fps = 50;
    const tick = 1 / 60; // 60Hz の rAF に対して 50fps 指定 (割り切れない)
    let frames = 0;
    for (let i = 1; i <= 600; i++) {
      // 10 秒ぶんの tick
      frames = framesDueAt(i * tick, fps);
    }
    // 10 秒 → 500 フレーム前後 (境界の ±1 は許容)
    expect(Math.abs(frames - 501)).toBeLessThanOrEqual(1);
  });

  it("tick が遅れても取りこぼしたフレーム数を取り戻す", () => {
    // 1 tick 飛んだ (33ms 空いた) 場合、次の tick で 2 フレームぶん要求される
    expect(framesDueAt(2 / 60, 60) - framesDueAt(0 / 60, 60)).toBe(2);
  });
});

describe("pcmLengthForFrames", () => {
  it("フレーム数 / fps 秒ぶんのサンプル数を返す", () => {
    expect(pcmLengthForFrames(60, 60, 48000)).toBe(48000);
    expect(pcmLengthForFrames(30, 60, 48000)).toBe(24000);
    expect(pcmLengthForFrames(90, 60, 44100)).toBe(66150);
  });

  it("フレーム 0 では 0", () => {
    expect(pcmLengthForFrames(0, 60, 48000)).toBe(0);
  });
});

describe("fitPcmToVideo", () => {
  const SR = 48000;
  const FPS = 60;

  it("長い PCM は映像長ちょうどに切る (停止は最終フレームより後になるため通常こちら)", () => {
    const pcm = new Float32Array(SR); // 1.0 秒
    const out = fitPcmToVideo(pcm, 30, FPS, SR); // 映像は 0.5 秒
    expect(out.length).toBe(SR / 2);
  });

  it("短い PCM は無音で埋める", () => {
    const pcm = new Float32Array(100).fill(0.5);
    const out = fitPcmToVideo(pcm, 60, FPS, SR); // 映像 1.0 秒 = 48000 サンプル
    expect(out.length).toBe(SR);
    expect(out[0]).toBe(0.5);
    expect(out[99]).toBe(0.5);
    expect(out[100]).toBe(0); // 埋めた無音
  });

  it("先頭サンプルを保つ (原点をずらさない)", () => {
    const pcm = new Float32Array(SR);
    pcm[0] = 1;
    pcm[1] = -1;
    const out = fitPcmToVideo(pcm, 30, FPS, SR);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(-1);
  });

  it("長さが一致していれば入力をそのまま返す", () => {
    const pcm = new Float32Array(SR);
    expect(fitPcmToVideo(pcm, 60, FPS, SR)).toBe(pcm);
  });

  it("不変条件: 出力サンプル数 / sampleRate === フレーム数 / fps", () => {
    for (const frames of [1, 7, 60, 137, 3600]) {
      for (const sr of [44100, 48000]) {
        const out = fitPcmToVideo(new Float32Array(sr * 10), frames, FPS, sr);
        expect(out.length / sr).toBeCloseTo(frames / FPS, 4);
      }
    }
  });
});
