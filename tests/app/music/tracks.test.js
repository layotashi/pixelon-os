/**
 * tracks.test.js — トラック・レジストリ (音楽アプリ間連携の土台) の契約。
 *
 * SYNTH が音源を登録し ROLL が発音先として参照する、疎結合連携の要。
 * add/upsert/get/default/remove と変更通知の振る舞いを固定する。
 * レジストリはモジュール・グローバルなので各テストの冒頭で空にする。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  addTrack,
  removeTrack,
  getTracks,
  getTrack,
  getDefaultTrack,
  onChange,
} from "@/app/music/tracks.js";

/** ダミー instrument (呼び出しを記録する) */
function fakeInstrument() {
  return { noteOn: vi.fn(), noteOff: vi.fn(), allNotesOff: vi.fn() };
}

beforeEach(() => {
  for (const t of getTracks()) removeTrack(t.id);
});

describe("tracks registry", () => {
  it("空のときは default / get が null", () => {
    expect(getTracks()).toEqual([]);
    expect(getDefaultTrack()).toBeNull();
    expect(getTrack("SYNTH")).toBeNull();
  });

  it("追加したトラックを id / default で引ける", () => {
    const inst = fakeInstrument();
    const track = addTrack({ id: "SYNTH", name: "SYNTH", instrument: inst });
    expect(getTrack("SYNTH")).toBe(track);
    expect(getDefaultTrack()).toBe(track);
    expect(getTracks()).toHaveLength(1);
  });

  it("default は先頭 (登録順) のトラック", () => {
    const a = addTrack({ id: "A", name: "A", instrument: fakeInstrument() });
    addTrack({ id: "B", name: "B", instrument: fakeInstrument() });
    expect(getDefaultTrack()).toBe(a);
  });

  it("同 id の追加は置換 (増やさない)", () => {
    addTrack({ id: "SYNTH", name: "old", instrument: fakeInstrument() });
    addTrack({ id: "SYNTH", name: "new", instrument: fakeInstrument() });
    expect(getTracks()).toHaveLength(1);
    expect(getTrack("SYNTH").name).toBe("new");
  });

  it("remove で取り除ける", () => {
    addTrack({ id: "SYNTH", name: "SYNTH", instrument: fakeInstrument() });
    removeTrack("SYNTH");
    expect(getTrack("SYNTH")).toBeNull();
    expect(getDefaultTrack()).toBeNull();
  });

  it("getTracks はコピー (外部変更がレジストリに漏れない)", () => {
    addTrack({ id: "SYNTH", name: "SYNTH", instrument: fakeInstrument() });
    const list = getTracks();
    list.push({ id: "X" });
    expect(getTracks()).toHaveLength(1);
  });

  it("onChange は add / remove で発火する", () => {
    const cb = vi.fn();
    onChange(cb);
    addTrack({ id: "SYNTH", name: "SYNTH", instrument: fakeInstrument() });
    expect(cb).toHaveBeenCalledTimes(1);
    removeTrack("SYNTH");
    expect(cb).toHaveBeenCalledTimes(2);
    removeTrack("SYNTH"); // 存在しない id は通知しない
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("instrument は PolySynth 互換のインタフェースを持つ", () => {
    const inst = fakeInstrument();
    addTrack({ id: "SYNTH", name: "SYNTH", instrument: inst });
    const t = getDefaultTrack();
    t.instrument.noteOn(60, 0.8, 0);
    t.instrument.noteOff(60);
    t.instrument.allNotesOff();
    expect(inst.noteOn).toHaveBeenCalledWith(60, 0.8, 0);
    expect(inst.noteOff).toHaveBeenCalledWith(60);
    expect(inst.allNotesOff).toHaveBeenCalled();
  });
});
