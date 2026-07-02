/**
 * tests/core/mp4_mux.test.js — 自作 MP4 muxer (ISO BMFF) の構造テスト。
 * muxMp4 は純関数なので node で Blob を解析し、ボックス木・オフセット・
 * サイズ表が仕様どおりかを検証する (エンコーダ不要 = ブラウザ不要)。
 */
import { describe, it, expect } from "vitest";
import { muxMp4 } from "../../js/core/mp4.js";

// ── ISO BMFF の最小パーサ (テスト専用) ──

/** [start,end) 範囲の直下ボックス一覧 { type, start, size, body } を返す */
function children(bytes, start, end) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    const size = dv.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    out.push({ type, start: p, size, body: p + 8 });
    if (size < 8) break;
    p += size;
  }
  return out;
}

function find(boxes, type) {
  return boxes.find((b) => b.type === type) || null;
}

/** ボックスパスをたどる (例: ["moov", "trak", "mdia"]) — 同型が複数なら index 指定 */
function descend(bytes, box, path) {
  let cur = box;
  for (const seg of path) {
    const [type, idx] = Array.isArray(seg) ? seg : [seg, 0];
    const kids = children(bytes, cur.body, cur.start + cur.size).filter((b) => b.type === type);
    if (kids.length <= idx) return null;
    cur = kids[idx];
  }
  return cur;
}

function u32At(bytes, off) {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(off);
}

// ── テストデータ ──

const V_SAMPLES = [
  { data: new Uint8Array([1, 2, 3]), key: true },
  { data: new Uint8Array([4, 5]), key: false },
  { data: new Uint8Array([6, 7, 8, 9]), key: false },
];
const AVCC = new Uint8Array([0x01, 0x64, 0x00, 0x1f]);
const AUDIO = {
  chunks: [new Uint8Array([0xaa, 0xab]), new Uint8Array([0xac, 0xad, 0xae])],
  asc: new Uint8Array([0x12, 0x08]), // AAC-LC 44100Hz mono
  sampleRate: 44100,
};

async function mux(audio) {
  const blob = muxMp4(V_SAMPLES, AVCC, 16, 16, 10, audio);
  return new Uint8Array(await blob.arrayBuffer());
}

// ── テスト ──

describe("muxMp4: トップレベル構造", () => {
  it("ftyp / moov / mdat の並びで、mdat が全サンプルを保持する", async () => {
    const bytes = await mux(AUDIO);
    const top = children(bytes, 0, bytes.length);
    expect(top.map((b) => b.type)).toEqual(["ftyp", "moov", "mdat"]);

    const mdat = find(top, "mdat");
    const vBytes = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const aBytes = [0xaa, 0xab, 0xac, 0xad, 0xae];
    expect([...bytes.slice(mdat.body, mdat.start + mdat.size)]).toEqual([...vBytes, ...aBytes]);
  });

  it("音声ありで trak が 2 本 (vide + soun)、next_track_ID = 3", async () => {
    const bytes = await mux(AUDIO);
    const moov = find(children(bytes, 0, bytes.length), "moov");
    const kids = children(bytes, moov.body, moov.start + moov.size);
    expect(kids.filter((b) => b.type === "trak").length).toBe(2);

    const mvhd = find(kids, "mvhd");
    expect(u32At(bytes, mvhd.body + 96)).toBe(3); // next_track_ID

    const hdlrType = (ti) => {
      const hdlr = descend(bytes, moov, [["trak", ti], "mdia", "hdlr"]);
      return String.fromCharCode(...bytes.slice(hdlr.body + 8, hdlr.body + 12));
    };
    expect(hdlrType(0)).toBe("vide");
    expect(hdlrType(1)).toBe("soun");
  });

  it("音声なしなら trak 1 本・next_track_ID = 2 (従来どおり)", async () => {
    const bytes = await mux(null);
    const moov = find(children(bytes, 0, bytes.length), "moov");
    const kids = children(bytes, moov.body, moov.start + moov.size);
    expect(kids.filter((b) => b.type === "trak").length).toBe(1);
    expect(u32At(bytes, find(kids, "mvhd").body + 96)).toBe(2);
  });
});

describe("muxMp4: stbl (サンプル表)", () => {
  it("stco が映像/音声チャンクの実データ位置を指す", async () => {
    const bytes = await mux(AUDIO);
    const top = children(bytes, 0, bytes.length);
    const moov = find(top, "moov");
    const mdat = find(top, "mdat");
    const stblPath = (ti) => [["trak", ti], "mdia", "minf", "stbl"];

    const vStco = descend(bytes, moov, [...stblPath(0), "stco"]);
    const aStco = descend(bytes, moov, [...stblPath(1), "stco"]);
    const vOffset = u32At(bytes, vStco.body + 8); // verflags(4) + entry_count(4)
    const aOffset = u32At(bytes, aStco.body + 8);
    expect(vOffset).toBe(mdat.body); // 映像チャンク = mdat データ先頭
    expect(aOffset).toBe(mdat.body + 9); // 音声チャンク = 映像 9 バイトの直後
    // オフセット位置の実バイトも確認
    expect(bytes[vOffset]).toBe(1);
    expect(bytes[aOffset]).toBe(0xaa);
  });

  it("stsz が各サンプルサイズ、音声 stts が 1024 サンプル刻み", async () => {
    const bytes = await mux(AUDIO);
    const moov = find(children(bytes, 0, bytes.length), "moov");

    const vStsz = descend(bytes, moov, [["trak", 0], "mdia", "minf", "stbl", "stsz"]);
    expect(u32At(bytes, vStsz.body + 8)).toBe(3); // sample_count
    expect([12, 16, 20].map((o) => u32At(bytes, vStsz.body + o))).toEqual([3, 2, 4]);

    const aStsz = descend(bytes, moov, [["trak", 1], "mdia", "minf", "stbl", "stsz"]);
    expect(u32At(bytes, aStsz.body + 8)).toBe(2);
    expect([12, 16].map((o) => u32At(bytes, aStsz.body + o))).toEqual([2, 3]);

    const aStts = descend(bytes, moov, [["trak", 1], "mdia", "minf", "stbl", "stts"]);
    expect(u32At(bytes, aStts.body + 8)).toBe(2); // sample_count
    expect(u32At(bytes, aStts.body + 12)).toBe(1024); // sample_delta (AAC AU)
  });

  it("音声 stsd に mp4a > esds があり AudioSpecificConfig を内包する", async () => {
    const bytes = await mux(AUDIO);
    const moov = find(children(bytes, 0, bytes.length), "moov");
    const stsd = descend(bytes, moov, [["trak", 1], "mdia", "minf", "stbl", "stsd"]);
    // stsd: verflags(4) + entry_count(4) の後に mp4a サンプルエントリ
    const mp4a = children(bytes, stsd.body + 8, stsd.start + stsd.size)[0];
    expect(mp4a.type).toBe("mp4a");
    // mp4a のサンプルエントリヘッダ 28 バイトの後に esds
    const esds = children(bytes, mp4a.body + 28, mp4a.start + mp4a.size)[0];
    expect(esds.type).toBe("esds");
    // esds のバイト列に ASC (0x12 0x08) が含まれる
    const body = bytes.slice(esds.body, esds.start + esds.size);
    const hasAsc = body.some((_, i) => body[i] === 0x12 && body[i + 1] === 0x08);
    expect(hasAsc).toBe(true);
  });
});
