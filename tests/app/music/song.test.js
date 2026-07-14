/**
 * song.test.js — 共有 4 トラック・ソングモデル (app/music/song.js) の検証。
 *
 * 音源 (ChipSynth/PolySynth) の生成は AudioContext を要するため触れず、
 * データモデル (トラック既定 / 選択の排他 / patch 更新 / clip 保持 / 通知) を検証する。
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as song from "@/app/music/song.js";

describe("song モデル (4 トラック固定)", () => {
  beforeEach(() => song._resetSong());

  it("トラック数は 4、既定の選択は 0", () => {
    expect(song.getTrackCount()).toBe(4);
    expect(song.getSelectedIndex()).toBe(0);
  });

  it("トラック既定 (名前 / 波形): LEAD=sq25 / CHORD=sq12 / BASS=tri / DRUM=noise", () => {
    expect(song.getTrack(0).name).toBe("LEAD");
    expect(song.getTrack(1).name).toBe("CHORD");
    expect(song.getTrack(2).name).toBe("BASS");
    expect(song.getTrack(3).name).toBe("DRUM");
    expect(song.getPatch(0).waveform).toBe("sq25");
    expect(song.getPatch(1).waveform).toBe("sq12");
    expect(song.getPatch(2).waveform).toBe("tri");
    expect(song.getPatch(3).waveform).toBe("noise");
  });

  it("全トラックの ADSR = MIN/MIN/MAX/MIN、VOL=50、VOICES=16", () => {
    for (let i = 0; i < 4; i++) {
      expect(song.getPatch(i)).toMatchObject({
        a: 0,
        d: 0,
        s: 100,
        r: 0,
        volume: 50,
        maxVoices: 16,
      });
    }
  });

  it("setSelectedIndex: 範囲外・同一は無視する", () => {
    song.setSelectedIndex(2);
    expect(song.getSelectedIndex()).toBe(2);
    song.setSelectedIndex(99);
    expect(song.getSelectedIndex()).toBe(2);
    song.setSelectedIndex(-1);
    expect(song.getSelectedIndex()).toBe(2);
    song.setSelectedIndex(2); // 同一
    expect(song.getSelectedIndex()).toBe(2);
  });

  it("onSelectionChange: (next, prev) を通知し、同一選択では発火しない", () => {
    const calls = [];
    song.onSelectionChange((n, p) => calls.push([n, p]));
    song.setSelectedIndex(1);
    song.setSelectedIndex(1); // 無視
    song.setSelectedIndex(3);
    expect(calls).toEqual([
      [1, 0],
      [3, 1],
    ]);
  });

  it("updatePatch: 指定キーだけ更新し他は保持する (音源未生成でも patch に残る)", () => {
    song.updatePatch(0, { waveform: "saw", volume: 80 });
    expect(song.getPatch(0)).toMatchObject({ waveform: "saw", volume: 80, a: 0 });
    song.updatePatch(0, { a: 500 });
    expect(song.getPatch(0)).toMatchObject({ waveform: "saw", volume: 80, a: 500 });
  });

  it("getPatch はコピーを返す (外部変更がモデルに漏れない)", () => {
    const p = song.getPatch(0);
    p.volume = 999;
    expect(song.getPatch(0).volume).toBe(50);
  });

  it("clip はトラックごとに独立して保持される", () => {
    const n0 = [{ pitch: 60, start: 0, len: 4, vel: 100 }];
    const n1 = [{ pitch: 48, start: 8, len: 2, vel: 90 }];
    song.setClipNotes(0, n0);
    song.setClipNotes(1, n1);
    expect(song.getClip(0).notes).toEqual(n0);
    expect(song.getClip(1).notes).toEqual(n1);
    expect(song.getClip(2).notes).toEqual([]);
    // steps / stepsPerBeat は保持される
    expect(song.getClip(0).steps).toBeGreaterThan(0);
    expect(song.getClip(0).stepsPerBeat).toBeGreaterThan(0);
  });

  it("peekInstrument は音源生成前は null を返す (強制生成しない)", () => {
    expect(song.peekInstrument(0)).toBe(null);
    expect(song.peekInstrument(3)).toBe(null);
  });
});
