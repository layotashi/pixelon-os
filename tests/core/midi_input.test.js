/**
 * core/midi_input.js — Web MIDI 入力テスト
 *
 * parseMidiMessage の正規化 (Note On/Off・vel0=Off・チャンネル無視・対象外) を検証する。
 * initMidiInput は navigator.requestMIDIAccess に依存するため、非対応環境 (Node) では
 * isMidiSupported が false になることのみ確認する。
 */
import { describe, it, expect } from "vitest";
import {
  parseMidiMessage,
  isMidiSupported,
  getMidiInputCount,
} from "@/core/midi_input.js";

describe("parseMidiMessage", () => {
  it("Note On (0x90, vel>0) → kind:on とベロシティ正規化", () => {
    const m = parseMidiMessage([0x90, 60, 127]);
    expect(m).toEqual({ kind: "on", note: 60, velocity: 1 });
  });

  it("Note On のベロシティは 0..1 に正規化される", () => {
    expect(parseMidiMessage([0x90, 64, 64]).velocity).toBeCloseTo(64 / 127, 5);
  });

  it("Note On vel=0 は Note Off として扱う", () => {
    expect(parseMidiMessage([0x90, 60, 0])).toEqual({
      kind: "off",
      note: 60,
      velocity: 0,
    });
  });

  it("Note Off (0x80) → kind:off", () => {
    expect(parseMidiMessage([0x80, 60, 64])).toEqual({
      kind: "off",
      note: 60,
      velocity: 0,
    });
  });

  it("チャンネルは無視する (下位ニブルをマスク)", () => {
    // 0x95 = Note On ch5, 0x83 = Note Off ch3
    expect(parseMidiMessage([0x95, 62, 100]).kind).toBe("on");
    expect(parseMidiMessage([0x83, 62, 0]).kind).toBe("off");
  });

  it("対象外メッセージ (CC/Pitch Bend) は null", () => {
    expect(parseMidiMessage([0xb0, 7, 100])).toBeNull(); // Control Change
    expect(parseMidiMessage([0xe0, 0, 64])).toBeNull(); // Pitch Bend
  });

  it("データ長が 2 でも安全 (velocity 既定 0 → Off 判定)", () => {
    expect(parseMidiMessage([0x90, 60])).toEqual({
      kind: "off",
      note: 60,
      velocity: 0,
    });
  });
});

describe("環境判定", () => {
  it("Node (Web MIDI 非対応) では isMidiSupported が false", () => {
    expect(isMidiSupported()).toBe(false);
  });

  it("未初期化では入力デバイス数 0", () => {
    expect(getMidiInputCount()).toBe(0);
  });
});
