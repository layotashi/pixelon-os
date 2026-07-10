/**
 * @module core/av_sync
 * av_sync.js — 録画の時間基準 (映像フレーム番号 ↔ PCM サンプル番号) を定める純関数群。
 *
 * 録画で音と絵がずれる原因は、たいてい「映像と音声が別々の時計で刻まれている」ことにある。
 * ここでは唯一の時計を **オーディオのサンプル時計** と決め、映像フレーム番号をそこから導く。
 *
 *   映像フレーム i の提示時刻 = i / fps          (CFR — mp4.js の stts が前提とする形)
 *   PCM サンプル k の時刻     = k / sampleRate
 *
 * 両者は同じ原点 (録音開始 = オーディオ時刻 t0) を持つので、フレーム数とサンプル数を
 * この関係で揃えるかぎり、rAF のジッタ・コマ落ち・エンコーダの遅延に関係なく同期する。
 *
 * framesDueAt が「経過時間から今あるべき累積フレーム数」を返すのは、gif.js 側の捕捉と
 * 同じ考え方 (capture.js の commitGifRecording を参照)。前回捕捉時刻からの差分ではなく
 * 開始からの絶対経過時間で数えることで、tick 粒度の切り捨てが累積しない。
 */

/**
 * 開始からの経過秒に対して「今あるべき累積フレーム数」を返す。
 * 経過 0 でフレーム 1 本目 (index 0) を出すため +1 している。
 * @param {number} elapsedSec  録画開始からの経過 (秒。オーディオ時計基準)
 * @param {number} fps  映像フレームレート
 * @returns {number} 累積フレーム数 (0 以上)
 */
export function framesDueAt(elapsedSec, fps) {
  if (!(elapsedSec >= 0) || !(fps > 0)) return 0;
  return Math.floor(elapsedSec * fps) + 1;
}

/**
 * frameCount フレーム (fps) の映像とちょうど同じ長さになる PCM サンプル数。
 * @param {number} frameCount
 * @param {number} fps
 * @param {number} sampleRate
 * @returns {number}
 */
export function pcmLengthForFrames(frameCount, fps, sampleRate) {
  if (!(frameCount > 0) || !(fps > 0) || !(sampleRate > 0)) return 0;
  return Math.round((frameCount / fps) * sampleRate);
}

/**
 * PCM を映像の長さちょうどに揃える (長ければ切り、短ければ無音で埋める)。
 * 録音停止は最後のフレーム描画より必ず後になるため、通常は数 ms ぶん切る側に働く。
 * @param {Float32Array} samples  録音開始と同じ原点を持つモノラル PCM
 * @param {number} frameCount  書き出す映像フレーム数
 * @param {number} fps
 * @param {number} sampleRate
 * @returns {Float32Array} 長さ pcmLengthForFrames() の新しい配列 (一致時は入力をそのまま返す)
 */
export function fitPcmToVideo(samples, frameCount, fps, sampleRate) {
  const want = pcmLengthForFrames(frameCount, fps, sampleRate);
  if (want === 0) return new Float32Array(0);
  if (samples.length === want) return samples;
  const out = new Float32Array(want);
  out.set(samples.subarray(0, Math.min(want, samples.length)));
  return out;
}
