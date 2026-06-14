/**
 * core/gif.js — GIF89a エンコーダ (1-bit 特化) のテスト
 *
 * LZW 圧縮の正当性、GIF バイナリ構造の妥当性を検証する。
 */
import { describe, it, expect } from "vitest";
import { lzwEncode, encodeGif } from "@/core/gif.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LZW 圧縮
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("lzwEncode", () => {
  it("空の入力でもクラッシュしない", () => {
    const result = lzwEncode(new Uint8Array(0), 2);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("全て同一値のピクセル列を圧縮できる", () => {
    const pixels = new Uint8Array(100).fill(0);
    const result = lzwEncode(pixels, 2);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    // 同一値の繰り返しは高い圧縮率が期待される
    // 100ピクセルの非圧縮 > 圧縮後バイト数
    expect(result.length).toBeLessThan(100);
  });

  it("交互パターンを圧縮できる", () => {
    const pixels = new Uint8Array(64);
    for (let i = 0; i < 64; i++) pixels[i] = i & 1;
    const result = lzwEncode(pixels, 2);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("1ピクセルでも正しく動作する", () => {
    const result = lzwEncode(new Uint8Array([1]), 2);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("サブブロックの末尾は 0x00 (Block Terminator) で終わる", () => {
    const pixels = new Uint8Array(50).fill(1);
    const result = lzwEncode(pixels, 2);
    expect(result[result.length - 1]).toBe(0x00);
  });

  it("サブブロックのチャンクは 255 バイト以下", () => {
    // 大きめのデータで 255 バイトを超えるサブブロックが生成されないことを確認
    const pixels = new Uint8Array(4096);
    for (let i = 0; i < pixels.length; i++) pixels[i] = i & 1;
    const result = lzwEncode(pixels, 2);

    // サブブロック構造を走査: [length][data...][length][data...]...[0x00]
    let pos = 0;
    while (pos < result.length) {
      const blockLen = result[pos];
      if (blockLen === 0) break; // Block Terminator
      expect(blockLen).toBeLessThanOrEqual(255);
      pos += 1 + blockLen;
    }
    expect(result[pos]).toBe(0x00);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LZW デコード検証 (ラウンドトリップ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GIF LZW をデコードしてピクセルインデックス配列を返す。
 * テスト専用のミニマル実装。
 * @param {Uint8Array} subBlocks  サブブロック形式の LZW データ
 * @param {number}     minCodeSize
 * @returns {number[]}
 */
function lzwDecode(subBlocks, minCodeSize) {
  // サブブロックからバイトストリームを抽出
  const bytes = [];
  let pos = 0;
  while (pos < subBlocks.length) {
    const blockLen = subBlocks[pos++];
    if (blockLen === 0) break;
    for (let i = 0; i < blockLen; i++) {
      bytes.push(subBlocks[pos++]);
    }
  }

  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  // 辞書: index → ピクセルインデックス配列
  let dict = [];
  function resetDict() {
    dict = [];
    for (let i = 0; i < clearCode; i++) dict[i] = [i];
    dict[clearCode] = []; // clear
    dict[eoiCode] = []; // eoi
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  }

  // ビットリーダー
  let bitBuf = 0;
  let bitCount = 0;
  let bytePos = 0;

  function readCode() {
    while (bitCount < codeSize) {
      if (bytePos >= bytes.length) return -1;
      bitBuf |= bytes[bytePos++] << bitCount;
      bitCount += 8;
    }
    const code = bitBuf & ((1 << codeSize) - 1);
    bitBuf >>= codeSize;
    bitCount -= codeSize;
    return code;
  }

  const output = [];
  resetDict();

  let code = readCode(); // should be clear code
  if (code !== clearCode) throw new Error("Expected clear code");

  code = readCode();
  if (code === eoiCode || code < 0) return output;
  output.push(...dict[code]);
  let prev = code;

  while (true) {
    code = readCode();
    if (code < 0 || code === eoiCode) break;
    if (code === clearCode) {
      resetDict();
      code = readCode();
      if (code === eoiCode || code < 0) break;
      output.push(...dict[code]);
      prev = code;
      continue;
    }

    let entry;
    if (code < nextCode) {
      entry = dict[code];
    } else if (code === nextCode) {
      entry = [...dict[prev], dict[prev][0]];
    } else {
      throw new Error(`Invalid LZW code: ${code}`);
    }

    output.push(...entry);

    if (nextCode < 4096) {
      dict[nextCode++] = [...dict[prev], entry[0]];
      // 標準 GIF デコーダのコードサイズ拡張: デコーダは辞書エントリ追加が
      // 1 ステップ遅れるため、>= で早期拡張してエンコーダの > と同期する
      if (nextCode >= 1 << codeSize && codeSize < 12) {
        codeSize++;
      }
    }

    prev = code;
  }

  return output;
}

describe("LZW ラウンドトリップ", () => {
  it("全て 0 のデータをエンコード→デコードで復元できる", () => {
    const original = new Uint8Array(256).fill(0);
    const encoded = lzwEncode(original, 2);
    const decoded = lzwDecode(encoded, 2);
    expect(decoded).toEqual(Array.from(original));
  });

  it("全て 1 のデータを復元できる", () => {
    const original = new Uint8Array(128).fill(1);
    const encoded = lzwEncode(original, 2);
    const decoded = lzwDecode(encoded, 2);
    expect(decoded).toEqual(Array.from(original));
  });

  it("交互パターンを復元できる", () => {
    const original = new Uint8Array(200);
    for (let i = 0; i < 200; i++) original[i] = i & 1;
    const encoded = lzwEncode(original, 2);
    const decoded = lzwDecode(encoded, 2);
    expect(decoded).toEqual(Array.from(original));
  });

  it("ランダムパターンを復元できる", () => {
    // 擬似ランダム (シード固定で再現可能)
    const original = new Uint8Array(500);
    let seed = 12345;
    for (let i = 0; i < 500; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      original[i] = seed & 1;
    }
    const encoded = lzwEncode(original, 2);
    const decoded = lzwDecode(encoded, 2);
    expect(decoded).toEqual(Array.from(original));
  });

  it("大きなデータ (辞書リセットを含む) を復元できる", () => {
    const original = new Uint8Array(10000);
    let seed = 42;
    for (let i = 0; i < 10000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      original[i] = seed & 1;
    }
    const encoded = lzwEncode(original, 2);
    const decoded = lzwDecode(encoded, 2);
    expect(decoded).toEqual(Array.from(original));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  encodeGif
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("encodeGif", () => {
  it("有効な GIF89a Blob を生成する", () => {
    const frame = new Uint8Array(4 * 4).fill(0); // 4×4 黒
    const blob = encodeGif([frame], 4, 4, [0, 0, 0], [255, 255, 255], 10);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/gif");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("GIF89a シグネチャで始まる", async () => {
    const frame = new Uint8Array(2 * 2).fill(1);
    const blob = encodeGif([frame], 2, 2, [0, 18, 0], [51, 255, 0], 10);
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // "GIF89a"
    expect(bytes[0]).toBe(0x47); // G
    expect(bytes[1]).toBe(0x49); // I
    expect(bytes[2]).toBe(0x46); // F
    expect(bytes[3]).toBe(0x38); // 8
    expect(bytes[4]).toBe(0x39); // 9
    expect(bytes[5]).toBe(0x61); // a
  });

  it("Trailer (0x3B) で終わる", async () => {
    const frame = new Uint8Array(8 * 8).fill(0);
    const blob = encodeGif([frame], 8, 8, [0, 0, 0], [255, 255, 255], 15);
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it("パレットが正しく埋め込まれる", async () => {
    const frame = new Uint8Array(2 * 2).fill(0);
    const bg = [0x1a, 0x08, 0x00];
    const fg = [0xff, 0xb0, 0x00];
    const blob = encodeGif([frame], 2, 2, bg, fg, 10);
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // GCT は Header (13bytes) の直後
    expect(bytes[13]).toBe(bg[0]);
    expect(bytes[14]).toBe(bg[1]);
    expect(bytes[15]).toBe(bg[2]);
    expect(bytes[16]).toBe(fg[0]);
    expect(bytes[17]).toBe(fg[1]);
    expect(bytes[18]).toBe(fg[2]);
  });

  it("画像サイズが Logical Screen Descriptor に反映される", async () => {
    const frame = new Uint8Array(320 * 180).fill(0);
    const blob = encodeGif([frame], 320, 180, [0, 0, 0], [255, 255, 255], 10);
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const w = bytes[6] | (bytes[7] << 8);
    const h = bytes[8] | (bytes[9] << 8);
    expect(w).toBe(320);
    expect(h).toBe(180);
  });

  it("scale > 1 で出力サイズが拡大される", async () => {
    const frame = new Uint8Array(4 * 4).fill(1);
    const blob = encodeGif([frame], 4, 4, [0, 0, 0], [255, 255, 255], 10, 2);
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const w = bytes[6] | (bytes[7] << 8);
    const h = bytes[8] | (bytes[9] << 8);
    expect(w).toBe(8);
    expect(h).toBe(8);
  });

  it("複数フレームを含む GIF を生成できる", () => {
    const frames = [];
    for (let i = 0; i < 10; i++) {
      const f = new Uint8Array(8 * 8);
      f.fill(i & 1);
      frames.push(f);
    }
    const blob = encodeGif(frames, 8, 8, [0, 0, 0], [255, 255, 255], 15);
    expect(blob).toBeInstanceOf(Blob);
    // 10フレーム分のデータが含まれるので 1 フレームより大きい
    const singleBlob = encodeGif(
      [frames[0]],
      8,
      8,
      [0, 0, 0],
      [255, 255, 255],
      15,
    );
    expect(blob.size).toBeGreaterThan(singleBlob.size);
  });

  it("Netscape Extension が含まれる (無限ループ)", async () => {
    const frame = new Uint8Array(2 * 2).fill(0);
    const blob = encodeGif([frame], 2, 2, [0, 0, 0], [255, 255, 255], 10);
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // "NETSCAPE2.0" を検索
    const netscape = [
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
    ];
    let found = false;
    for (let i = 0; i <= bytes.length - netscape.length; i++) {
      if (netscape.every((b, j) => bytes[i + j] === b)) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

