/**
 * @module core/mp4
 * mp4.js — 1bit フレーム列を H.264/MP4 として書き出す。
 *
 * ブラウザの WebCodecs `VideoEncoder` で各フレームを H.264 にエンコードし、
 * その出力 (AVCC 形式のアクセスユニット + avcC コンフィグ) を、この場で
 * 組み立てる最小限の MP4 コンテナ (ISO BMFF) に詰める。
 * GIF を自前エンコーダ (gif.js) で書いているのと同じ思想で、コンテナ部分は
 * 外部依存なしに自作する (エンコーダだけはブラウザ API を借りる)。
 *
 * 注意:
 *   - WebCodecs 非対応ブラウザでは使えない (isMp4Supported() で判定)。
 *   - H.264 は非可逆。1bit のシャープなディザは高ビットレートでも僅かに滲む。
 *     画質忠実が要るなら GIF/PNG が向く。MP4 の利点は滑らか・長尺・SNS ネイティブ。
 *
 * 構成 (単一ビデオトラック・音声なし):
 *   ftyp / moov(mvhd, trak(tkhd, mdia(mdhd, hdlr, minf(vmhd, dinf, stbl)))) / mdat
 */

/** WebCodecs による H.264/MP4 書き出しが使えるか */
export function isMp4Supported() {
  return (
    typeof window !== "undefined" &&
    typeof window.VideoEncoder === "function" &&
    typeof window.VideoFrame === "function"
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  バイト列ヘルパ (ビッグエンディアン)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function u16(n) {
  const a = new Uint8Array(2);
  new DataView(a.buffer).setUint16(0, n);
  return a;
}
function s16(n) {
  const a = new Uint8Array(2);
  new DataView(a.buffer).setInt16(0, n);
  return a;
}
function u32(n) {
  const a = new Uint8Array(4);
  new DataView(a.buffer).setUint32(0, n >>> 0);
  return a;
}
function str4(s) {
  return new Uint8Array([
    s.charCodeAt(0),
    s.charCodeAt(1),
    s.charCodeAt(2),
    s.charCodeAt(3),
  ]);
}
function concat(arrs) {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
/** [size][type][payload...] のボックスを作る */
function box(type, ...chunks) {
  const body = concat(chunks);
  return concat([u32(body.length + 8), str4(type), body]);
}
/** version + flags を先頭に持つ FullBox */
function fullbox(type, version, flags, ...chunks) {
  const vf = new Uint8Array([
    version & 0xff,
    (flags >> 16) & 0xff,
    (flags >> 8) & 0xff,
    flags & 0xff,
  ]);
  return box(type, vf, ...chunks);
}

/* prettier-ignore */
const UNITY_MATRIX = concat([
  u32(0x00010000), u32(0), u32(0),
  u32(0), u32(0x00010000), u32(0),
  u32(0), u32(0), u32(0x40000000),
]);

function toU8(d) {
  if (d instanceof Uint8Array) return d.slice();
  if (d instanceof ArrayBuffer) return new Uint8Array(d.slice(0));
  return new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MP4 muxer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * moov ボックスを構築する。stco の chunk offset は引数で受け取る。
 * (offset は固定長フィールドなので、値が変わっても moov の長さは不変。
 *  → 一度仮の値で長さを測り、本当の mdat オフセットで作り直せる)
 */
function buildMoov(sizes, keyframes, avcC, w, h, fps, stcoOffset) {
  const n = sizes.length;
  const dur = n; // タイムスケール = fps、1 サンプル = 1 単位

  const mvhd = fullbox(
    "mvhd", 0, 0,
    u32(0), u32(0), u32(fps), u32(dur),
    u32(0x00010000), // rate 1.0
    u16(0x0100), // volume 1.0
    u16(0), u32(0), u32(0), // reserved
    UNITY_MATRIX,
    u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), // pre_defined
    u32(2), // next_track_ID
  );

  const tkhd = fullbox(
    "tkhd", 0, 7, // enabled | in movie | in preview
    u32(0), u32(0), u32(1), u32(0), u32(dur),
    u32(0), u32(0), // reserved
    s16(0), s16(0), s16(0), u16(0), // layer, alt_group, volume, reserved
    UNITY_MATRIX,
    u32(w << 16), u32(h << 16), // 16.16 fixed
  );

  const mdhd = fullbox(
    "mdhd", 0, 0,
    u32(0), u32(0), u32(fps), u32(dur),
    u16(0x55c4), // language 'und'
    u16(0),
  );

  const hdlr = fullbox(
    "hdlr", 0, 0,
    u32(0), str4("vide"), u32(0), u32(0), u32(0),
    new Uint8Array([...new TextEncoder().encode("SYNESTA"), 0]),
  );

  const vmhd = fullbox("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0));
  const dref = fullbox("dref", 0, 0, u32(1), fullbox("url ", 0, 1));
  const dinf = box("dinf", dref);

  // stsd > avc1 > avcC
  const avcCbox = box("avcC", avcC);
  const avc1 = box(
    "avc1",
    new Uint8Array(6), u16(1), // reserved + data_reference_index
    new Uint8Array(16), // pre_defined / reserved
    u16(w), u16(h),
    u32(0x00480000), u32(0x00480000), // 72dpi
    u32(0), u16(1), // reserved, frame_count
    new Uint8Array(32), // compressorname
    u16(0x0018), s16(-1), // depth, pre_defined
    avcCbox,
  );
  const stsd = fullbox("stsd", 0, 0, u32(1), avc1);
  const stts = fullbox("stts", 0, 0, u32(1), u32(n), u32(1));
  const stsc = fullbox("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1));
  const stsz = fullbox("stsz", 0, 0, u32(0), u32(n), concat(sizes.map(u32)));
  const stco = fullbox("stco", 0, 0, u32(1), u32(stcoOffset));
  const stss = fullbox(
    "stss", 0, 0, u32(keyframes.length), concat(keyframes.map((k) => u32(k))),
  );

  const stbl = box("stbl", stsd, stts, stsc, stsz, stco, stss);
  const minf = box("minf", vmhd, dinf, stbl);
  const mdia = box("mdia", mdhd, hdlr, minf);
  const trak = box("trak", tkhd, mdia);
  return box("moov", mvhd, trak);
}

/** エンコード済みサンプル列 + avcC を MP4 Blob にまとめる */
function muxMp4(samples, avcC, w, h, fps) {
  const sizes = samples.map((s) => s.data.length);
  const keyframes = [];
  samples.forEach((s, i) => {
    if (s.key) keyframes.push(i + 1); // stss は 1 始まり
  });
  if (keyframes.length === 0) keyframes.push(1);

  const ftyp = box(
    "ftyp",
    str4("isom"), u32(0x200),
    str4("isom"), str4("iso2"), str4("avc1"), str4("mp41"),
  );

  // 1 回目: 仮オフセットで moov 長を確定 → mdat データ開始位置を算出
  let moov = buildMoov(sizes, keyframes, avcC, w, h, fps, 0);
  const mdatDataStart = ftyp.length + moov.length + 8;
  // 2 回目: 本当の chunk offset で作り直す (長さは不変)
  moov = buildMoov(sizes, keyframes, avcC, w, h, fps, mdatDataStart);

  const mdatBody = concat(samples.map((s) => s.data));
  const mdat = concat([u32(mdatBody.length + 8), str4("mdat"), mdatBody]);

  return new Blob([ftyp, moov, mdat], { type: "video/mp4" });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  エンコード
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 解像度に応じて対応する H.264 コーデック文字列を選ぶ (互換性の高い順に試す) */
async function pickCodec(w, h, fps, bitrate) {
  // baseline L3.1 → L4.0 → L5.1 → main/high L5.1。
  // 小さい絵は baseline 低レベル (最も再生互換が高い)、大きい絵は上のレベルへ。
  const candidates = [
    "avc1.42E01F",
    "avc1.42E028",
    "avc1.42E033",
    "avc1.4D4033",
    "avc1.640033",
  ];
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: w,
        height: h,
        bitrate,
        framerate: fps,
        avc: { format: "avc" },
      });
      if (support && support.supported) return codec;
    } catch (_) {
      /* 次の候補へ */
    }
  }
  return null;
}

/**
 * 1bit フレーム列を H.264/MP4 にエンコードする。
 *
 * @param {Uint8Array[]} frames  各要素が 0/1 の画素 (length = w*h)
 * @param {number} w  フレーム幅 (画素)
 * @param {number} h  フレーム高さ (画素)
 * @param {number[]} bgRgb  背景色 [r,g,b]
 * @param {number[]} fgRgb  前景色 [r,g,b]
 * @param {number} fps  フレームレート
 * @param {number} scale  拡大率 (出力解像度 = w*scale × h*scale、偶数に丸め)
 * @returns {Promise<Blob>}  MP4 Blob
 */
export async function encodeMp4(frames, w, h, bgRgb, fgRgb, fps, scale) {
  if (!isMp4Supported()) throw new Error("WebCodecs unavailable");
  if (!frames || frames.length === 0) throw new Error("no frames");

  // H.264 は偶数寸法が前提
  let outW = Math.max(2, Math.round(w * scale));
  let outH = Math.max(2, Math.round(h * scale));
  if (outW & 1) outW++;
  if (outH & 1) outH++;

  const bitrate = Math.min(
    60_000_000,
    Math.max(4_000_000, Math.round(outW * outH * fps * 0.3)),
  );
  const codec = await pickCodec(outW, outH, fps, bitrate);
  if (!codec) throw new Error("H.264 encode unsupported for this size");

  // 1bit → RGBA → 拡大描画用のキャンバス
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d");
  const img = sctx.createImageData(w, h);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = false; // ニアレストネイバー (1bit のドットを保つ)

  const samples = [];
  let description = null;
  let encErr = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const desc = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (desc && !description) description = toU8(desc);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === "key" });
    },
    error: (e) => {
      encErr = e;
    },
  });
  encoder.configure({
    codec,
    width: outW,
    height: outH,
    bitrate,
    framerate: fps,
    avc: { format: "avc" }, // AVCC (length-prefixed) で出力 → MP4 に直接詰められる
  });

  const frameDur = Math.round(1_000_000 / fps); // マイクロ秒
  for (let i = 0; i < frames.length; i++) {
    if (encErr) break;
    const f = frames[i];
    const d = img.data;
    for (let p = 0, j = 0; p < f.length; p++, j += 4) {
      if (f[p]) {
        d[j] = fgRgb[0];
        d[j + 1] = fgRgb[1];
        d[j + 2] = fgRgb[2];
      } else {
        d[j] = bgRgb[0];
        d[j + 1] = bgRgb[1];
        d[j + 2] = bgRgb[2];
      }
      d[j + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    octx.drawImage(src, 0, 0, w, h, 0, 0, outW, outH);
    const vf = new VideoFrame(out, { timestamp: i * frameDur, duration: frameDur });
    // 1 秒ごとにキーフレーム (短いループでもシーク/ループ復帰が安定)
    encoder.encode(vf, { keyFrame: i % fps === 0 });
    vf.close();
  }

  await encoder.flush();
  encoder.close();

  if (encErr) throw encErr;
  if (samples.length === 0) throw new Error("encoder produced no samples");
  if (!description) throw new Error("missing avcC description");

  return muxMp4(samples, description, outW, outH, fps);
}
