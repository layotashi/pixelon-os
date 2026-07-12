/**
 * core/clip.js — ノートクリップの共有モデル + JSON コーデックのテスト
 *
 * 往復 (serialize → parse) の同値性、ノートの正規化 (整列・範囲クランプ・
 * 不正ノート除去)、壊れた入力への頑健性を検証する。
 */
import { describe, it, expect } from "vitest";
import {
  CLIP_FORMAT,
  CLIP_VERSION,
  DEFAULT_STEPS_PER_BEAT,
  DEFAULT_STEPS,
  DEFAULT_VEL,
  createClip,
  serializeClip,
  parseClip,
} from "@/core/clip.js";

describe("createClip", () => {
  it("空入力は既定値の空クリップになる", () => {
    const c = createClip();
    expect(c).toEqual({
      stepsPerBeat: DEFAULT_STEPS_PER_BEAT,
      steps: DEFAULT_STEPS,
      notes: [],
    });
  });

  it("ノートを (start, pitch) 昇順に整列する", () => {
    const c = createClip({
      notes: [
        { pitch: 64, start: 4, len: 1 },
        { pitch: 60, start: 0, len: 2 },
        { pitch: 67, start: 0, len: 1 },
      ],
    });
    expect(c.notes.map((n) => [n.start, n.pitch])).toEqual([
      [0, 60],
      [0, 67],
      [4, 64],
    ]);
  });

  it("vel 未指定は既定ベロシティで補う", () => {
    const c = createClip({ notes: [{ pitch: 60, start: 0, len: 1 }] });
    expect(c.notes[0].vel).toBe(DEFAULT_VEL);
  });

  it("pitch / vel を範囲へクランプし start/len を丸める", () => {
    const c = createClip({
      notes: [{ pitch: 200, start: -5, len: 0, vel: 999 }],
    });
    expect(c.notes[0]).toEqual({ pitch: 127, start: 0, len: 1, vel: 127 });
  });

  it("数値でないフィールドを持つノートは捨てる", () => {
    const c = createClip({
      notes: [
        { pitch: "x", start: 0, len: 1 },
        { pitch: 60, start: 0, len: 1 },
        null,
        { start: 0, len: 1 }, // pitch 欠落
      ],
    });
    expect(c.notes).toHaveLength(1);
    expect(c.notes[0].pitch).toBe(60);
  });
});

describe("serializeClip / parseClip", () => {
  it("往復で同じクリップに戻る", () => {
    const src = {
      stepsPerBeat: 4,
      steps: 64,
      notes: [
        { pitch: 60, start: 0, len: 4, vel: 100 },
        { pitch: 67, start: 8, len: 2, vel: 100 },
      ],
    };
    const round = parseClip(serializeClip(src));
    expect(round).toEqual(createClip(src));
  });

  it("直列化 JSON は format / version を含む", () => {
    const obj = JSON.parse(serializeClip({ notes: [] }));
    expect(obj.format).toBe(CLIP_FORMAT);
    expect(obj.version).toBe(CLIP_VERSION);
  });

  it("壊れた JSON は null", () => {
    expect(parseClip("{ not json")).toBeNull();
    expect(parseClip("")).toBeNull();
  });

  it("format タグが違う JSON は null", () => {
    expect(parseClip(JSON.stringify({ format: "something-else", notes: [] }))).toBeNull();
  });

  it("format タグの無い最小 JSON も緩く受理する", () => {
    const c = parseClip(JSON.stringify({ notes: [{ pitch: 60, start: 0, len: 1 }] }));
    expect(c).not.toBeNull();
    expect(c.notes).toHaveLength(1);
  });
});
