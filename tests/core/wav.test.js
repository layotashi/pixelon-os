/**
 * core/wav.js — WAV コーデックテスト
 *
 * エンコード・デコードのラウンドトリップ検証、
 * WAV ヘッダの構造検証、エラーハンドリングのテスト。
 */
import { describe, it, expect } from "vitest";
import { encodeWav, decodeWav } from "@/core/wav.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 440Hz 正弦波を生成 */
function generateSine(sampleRate, durationSec, freq = 440) {
  const len = (sampleRate * durationSec) | 0;
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    buf[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return buf;
}

/** DataView から ASCII 文字列を読む */
function readStr(view, offset, len) {
  let s = "";
  for (let i = 0; i < len; i++)
    s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  encodeWav
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("encodeWav", () => {
  // ── ヘッダ構造検証 ──
  describe("WAV ヘッダ構造", () => {
    it("RIFF ヘッダが正しい", () => {
      const samples = new Float32Array([0, 0.5, -0.5, 1]);
      const buf = encodeWav(samples, 44100, 16);
      const view = new DataView(buf);

      expect(readStr(view, 0, 4)).toBe("RIFF");
      expect(view.getUint32(4, true)).toBe(buf.byteLength - 8);
      expect(readStr(view, 8, 4)).toBe("WAVE");
    });

    it("fmt チャンクが正しい (モノラル 16-bit)", () => {
      const samples = new Float32Array([0, 0.5, -0.5, 1]);
      const buf = encodeWav(samples, 44100, 16);
      const view = new DataView(buf);

      expect(readStr(view, 12, 4)).toBe("fmt ");
      expect(view.getUint32(16, true)).toBe(16); // chunk size
      expect(view.getUint16(20, true)).toBe(1); // PCM
      expect(view.getUint16(22, true)).toBe(1); // mono
      expect(view.getUint32(24, true)).toBe(44100); // sampleRate
      expect(view.getUint32(28, true)).toBe(44100 * 2); // byteRate (mono 16bit)
      expect(view.getUint16(32, true)).toBe(2); // blockAlign
      expect(view.getUint16(34, true)).toBe(16); // bitsPerSample
    });

    it("fmt チャンクが正しい (ステレオ 16-bit)", () => {
      const L = new Float32Array([0, 0.5]);
      const R = new Float32Array([0, -0.5]);
      const buf = encodeWav([L, R], 48000, 16);
      const view = new DataView(buf);

      expect(view.getUint16(22, true)).toBe(2); // stereo
      expect(view.getUint32(24, true)).toBe(48000); // sampleRate
      expect(view.getUint32(28, true)).toBe(48000 * 4); // byteRate
      expect(view.getUint16(32, true)).toBe(4); // blockAlign
    });

    it("data チャンクヘッダが正しい", () => {
      const samples = new Float32Array([0, 0.5, -0.5, 1]);
      const buf = encodeWav(samples, 44100, 16);
      const view = new DataView(buf);

      expect(readStr(view, 36, 4)).toBe("data");
      expect(view.getUint32(40, true)).toBe(4 * 2); // 4 samples × 2 bytes
    });

    it("ファイルサイズが正しい", () => {
      const samples = new Float32Array(100);
      const buf16 = encodeWav(samples, 44100, 16);
      expect(buf16.byteLength).toBe(44 + 100 * 2); // header(44) + data

      const buf8 = encodeWav(samples, 44100, 8);
      expect(buf8.byteLength).toBe(44 + 100 * 1);
    });
  });

  // ── 16-bit PCM 値の検証 ──
  describe("16-bit PCM 値", () => {
    it("無音 (0.0) → 0", () => {
      const buf = encodeWav(new Float32Array([0]), 44100, 16);
      const view = new DataView(buf);
      expect(view.getInt16(44, true)).toBe(0);
    });

    it("+1.0 → 32767", () => {
      const buf = encodeWav(new Float32Array([1.0]), 44100, 16);
      const view = new DataView(buf);
      expect(view.getInt16(44, true)).toBe(32767);
    });

    it("-1.0 → -32768", () => {
      const buf = encodeWav(new Float32Array([-1.0]), 44100, 16);
      const view = new DataView(buf);
      expect(view.getInt16(44, true)).toBe(-32768);
    });
  });

  // ── 8-bit PCM 値の検証 ──
  describe("8-bit PCM 値", () => {
    it("無音 (0.0) ≈ 128", () => {
      const buf = encodeWav(new Float32Array([0]), 44100, 8);
      const u8 = new Uint8Array(buf);
      expect(u8[44]).toBe(128);
    });

    it("+1.0 → 255", () => {
      const buf = encodeWav(new Float32Array([1.0]), 44100, 8);
      const u8 = new Uint8Array(buf);
      expect(u8[44]).toBe(255);
    });

    it("-1.0 → 0", () => {
      const buf = encodeWav(new Float32Array([-1.0]), 44100, 8);
      const u8 = new Uint8Array(buf);
      expect(u8[44]).toBe(0);
    });
  });

  // ── クランプ ──
  describe("クランプ", () => {
    it("1.0 超の値は +1.0 にクランプされる", () => {
      const buf = encodeWav(new Float32Array([5.0]), 44100, 16);
      const view = new DataView(buf);
      expect(view.getInt16(44, true)).toBe(32767);
    });

    it("-1.0 未満の値は -1.0 にクランプされる", () => {
      const buf = encodeWav(new Float32Array([-5.0]), 44100, 16);
      const view = new DataView(buf);
      expect(view.getInt16(44, true)).toBe(-32768);
    });
  });

  // ── エラー ──
  describe("エラーハンドリング", () => {
    it("sampleRate が 0 で例外", () => {
      expect(() => encodeWav(new Float32Array([0]), 0)).toThrow("sampleRate");
    });

    it("sampleRate が負で例外", () => {
      expect(() => encodeWav(new Float32Array([0]), -44100)).toThrow(
        "sampleRate",
      );
    });

    it("bitDepth が 24 で例外", () => {
      expect(() => encodeWav(new Float32Array([0]), 44100, 24)).toThrow(
        "bitDepth",
      );
    });

    it("空のサンプルで例外", () => {
      expect(() => encodeWav(new Float32Array(0), 44100)).toThrow("empty");
    });

    it("3ch 配列で例外", () => {
      const ch = new Float32Array([0]);
      expect(() => encodeWav([ch, ch, ch], 44100)).toThrow("channel count");
    });

    it("ステレオで長さ不一致の場合に例外", () => {
      const L = new Float32Array(10);
      const R = new Float32Array(20);
      expect(() => encodeWav([L, R], 44100)).toThrow("equal length");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  decodeWav
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("decodeWav", () => {
  // ── エラーハンドリング ──
  describe("エラーハンドリング", () => {
    it("null で例外", () => {
      expect(() => decodeWav(null)).toThrow();
    });

    it("短すぎるバッファで例外", () => {
      expect(() => decodeWav(new ArrayBuffer(10))).toThrow("too short");
    });

    it("RIFF ヘッダなしで例外", () => {
      const buf = new ArrayBuffer(44);
      const view = new DataView(buf);
      // "XXXX" を書き込む
      for (let i = 0; i < 4; i++) view.setUint8(i, 0x58);
      expect(() => decodeWav(buf)).toThrow("RIFF");
    });

    it("WAVE 識別子なしで例外", () => {
      const buf = new ArrayBuffer(44);
      const view = new DataView(buf);
      // "RIFF" を書き込む
      const riff = "RIFF";
      for (let i = 0; i < 4; i++) view.setUint8(i, riff.charCodeAt(i));
      view.setUint32(4, 36, true);
      // "XXXX" を書き込む (WAVE の代わり)
      for (let i = 0; i < 4; i++) view.setUint8(8 + i, 0x58);
      expect(() => decodeWav(buf)).toThrow("WAVE");
    });
  });

  // ── 基本デコード ──
  describe("基本デコード", () => {
    it("モノラル 16-bit をデコードできる", () => {
      const original = new Float32Array([0, 0.5, -0.5, 1, -1]);
      const wav = encodeWav(original, 44100, 16);
      const result = decodeWav(wav);

      expect(result.sampleRate).toBe(44100);
      expect(result.channels).toBe(1);
      expect(result.bitDepth).toBe(16);
      expect(result.samples).toHaveLength(1);
      expect(result.samples[0]).toHaveLength(5);
    });

    it("モノラル 8-bit をデコードできる", () => {
      const original = new Float32Array([0, 0.5, -0.5]);
      const wav = encodeWav(original, 22050, 8);
      const result = decodeWav(wav);

      expect(result.sampleRate).toBe(22050);
      expect(result.channels).toBe(1);
      expect(result.bitDepth).toBe(8);
      expect(result.samples).toHaveLength(1);
      expect(result.samples[0]).toHaveLength(3);
    });

    it("ステレオ 16-bit をデコードできる", () => {
      const L = new Float32Array([0, 0.5, -0.5]);
      const R = new Float32Array([1, -1, 0]);
      const wav = encodeWav([L, R], 48000, 16);
      const result = decodeWav(wav);

      expect(result.sampleRate).toBe(48000);
      expect(result.channels).toBe(2);
      expect(result.bitDepth).toBe(16);
      expect(result.samples).toHaveLength(2);
      expect(result.samples[0]).toHaveLength(3);
      expect(result.samples[1]).toHaveLength(3);
    });

    it("duration が正しい", () => {
      const samples = generateSine(44100, 0.5);
      const wav = encodeWav(samples, 44100, 16);
      const result = decodeWav(wav);
      expect(result.duration).toBeCloseTo(0.5, 2);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ラウンドトリップ (encode → decode)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ラウンドトリップ", () => {
  it("モノラル 16-bit: encode → decode で値が復元する", () => {
    const original = generateSine(44100, 0.1);
    const wav = encodeWav(original, 44100, 16);
    const { samples } = decodeWav(wav);
    const decoded = samples[0];

    expect(decoded).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      // 16-bit 量子化誤差は ±1/32768 以内
      expect(decoded[i]).toBeCloseTo(original[i], 3);
    }
  });

  it("モノラル 8-bit: encode → decode で値が復元する (低精度)", () => {
    const original = generateSine(8000, 0.05);
    const wav = encodeWav(original, 8000, 8);
    const { samples } = decodeWav(wav);
    const decoded = samples[0];

    expect(decoded).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      // 8-bit 量子化誤差は ±1/128 以内
      expect(decoded[i]).toBeCloseTo(original[i], 1);
    }
  });

  it("ステレオ 16-bit: encode → decode で LR が復元する", () => {
    const L = generateSine(44100, 0.05, 440);
    const R = generateSine(44100, 0.05, 880);
    const wav = encodeWav([L, R], 44100, 16);
    const { samples } = decodeWav(wav);

    expect(samples).toHaveLength(2);
    for (let i = 0; i < L.length; i++) {
      expect(samples[0][i]).toBeCloseTo(L[i], 3);
      expect(samples[1][i]).toBeCloseTo(R[i], 3);
    }
  });

  it("無音データのラウンドトリップ", () => {
    const silence = new Float32Array(1000); // all zeros
    const wav = encodeWav(silence, 44100, 16);
    const { samples } = decodeWav(wav);

    for (let i = 0; i < silence.length; i++) {
      expect(samples[0][i]).toBe(0);
    }
  });

  it("最大値・最小値のラウンドトリップ", () => {
    const extreme = new Float32Array([1.0, -1.0, 0, 1.0, -1.0]);
    const wav = encodeWav(extreme, 44100, 16);
    const { samples } = decodeWav(wav);

    expect(samples[0][0]).toBeCloseTo(1.0, 3);
    expect(samples[0][1]).toBeCloseTo(-1.0, 3);
    expect(samples[0][2]).toBe(0);
  });

  it("異なるサンプルレートでのラウンドトリップ", () => {
    const rates = [8000, 22050, 44100, 48000, 96000];
    for (const rate of rates) {
      const original = generateSine(rate, 0.01);
      const wav = encodeWav(original, rate, 16);
      const result = decodeWav(wav);
      expect(result.sampleRate).toBe(rate);
      expect(result.samples[0]).toHaveLength(original.length);
    }
  });
});

