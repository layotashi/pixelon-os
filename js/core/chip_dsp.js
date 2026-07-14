/**
 * @module core/chip_dsp
 * chip_dsp.js — チップ音源の純ロジック (波形メモリ・音量量子化・シーケンサ数式)
 *
 * ここは AudioContext / AudioWorklet に依存しない **純関数** だけを置く。理由は 2 つ:
 *   1. Node/vitest でオーディオ無しに数式を単体テストできる (computeMidiAudioTime や
 *      scaleNotesInTime と同じ哲学)。
 *   2. AudioWorkletGlobalScope は ES import ができないため、ワークレット本体
 *      (chip_worklet.js) は自己完結する必要がある。そこで「発火タイミングを決める数式」の
 *      **正典 (canonical)** をここに置き、ワークレット側は同等ロジックをミラー実装する。
 *      差分が出ないよう、この 2 者は常に一致させること (小さく安定した数式に保つ)。
 *
 * ── 責務 ──
 *   - buildWavetable / buildWavetables … 固定波形を 1 周期のテーブル (Float32) に焼く。
 *     読み出しは位相ポインタで行う「波形メモリ」方式 (チップチューンの原始的発音)。
 *   - quantizeVolume16 … 音量を 16 段階 (4bit) に量子化する (チップの音量レジスタ相当)。
 *   - beatAtTime … オーディオ時刻 → 再生位置 (beat)。transport.update と同じ折返し数式。
 *   - notesOnsetsInWindow … 微小時間窓に始まるノート発火 (on/off 時刻) を返す。ループ境界を
 *     跨いだ発火 (末尾→先頭) もここで解決する。ワークレットが process() 量子ごとに使う。
 */

import { sampleWaveformFn } from "./audio.js";

/** 1 周期の波形テーブル長 (サンプル)。位相ポインタで読み出す。 */
export const TABLE_SIZE = 256;

/** 音量の量子化段数 (4bit = 16 段。チップの音量レジスタに倣う)。 */
export const VOLUME_STEPS = 16;

/** テーブル化する調性波形 (noise はテーブルではなくワークレットで実時間生成する)。 */
export const CHIP_WAVEFORMS = ["saw", "tri", "sq50", "sq25", "sq12", "sine"];

/**
 * 固定波形の 1 周期を size サンプルのテーブルに焼く (naive = 帯域制限なし)。
 * 高音では倍音がエイリアスするが、実機チップ (NES/GB) 同様の原始的な音色として許容する。
 * @param {string} waveform  CHIP_WAVEFORMS のいずれか
 * @param {number} [size=TABLE_SIZE]
 * @returns {Float32Array}  -1.0〜+1.0 の 1 周期テーブル
 */
export function buildWavetable(waveform, size = TABLE_SIZE) {
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) table[i] = sampleWaveformFn(waveform, i / size);
  return table;
}

/**
 * 全調性波形のテーブル辞書を生成する (ワークレットへ postMessage する用)。
 * @param {number} [size=TABLE_SIZE]
 * @returns {Object<string, Float32Array>}
 */
export function buildWavetables(size = TABLE_SIZE) {
  const tables = {};
  for (const wf of CHIP_WAVEFORMS) tables[wf] = buildWavetable(wf, size);
  return tables;
}

/**
 * 音量 (0.0〜1.0) を 16 段階に量子化した振幅 (0.0〜1.0) を返す。
 * level = round(v × 15) を 0..15 に取り、振幅 = level / 15。
 * @param {number} v  0.0〜1.0 (範囲外はクランプ)
 * @returns {number}  16 段のいずれかにスナップした 0.0〜1.0
 */
export function quantizeVolume16(v) {
  if (!(v > 0)) return 0;
  if (v >= 1) return 1;
  const maxLevel = VOLUME_STEPS - 1;
  return Math.round(v * maxLevel) / maxLevel;
}

/**
 * オーディオ時刻 t (秒) における再生位置 (beat) を返す。ループ有効なら範囲内へ折り返す。
 * transport.update() (js/app/music/transport.js) と同一の数式 — 表示用の再生ヘッドと
 * ワークレットの発火判定が同じ時計で一致することを保証する。
 * @param {number} t  AudioContext.currentTime ベースの秒
 * @param {{startBeat:number,startTime:number,bpm:number,loopStart:number,loopEnd:number,loopOn:boolean}} clock
 * @returns {number}  再生位置 (beat)
 */
export function beatAtTime(t, clock) {
  const { startBeat, startTime, bpm, loopStart, loopEnd, loopOn } = clock;
  let pos = startBeat + (t - startTime) * (bpm / 60);
  if (loopOn && loopEnd > loopStart) {
    const len = loopEnd - loopStart;
    pos = loopStart + ((((pos - loopStart) % len) + len) % len);
  }
  return pos;
}

/**
 * 微小時間窓 [t0, t1) の間に発火する (= ノート先頭が入る) ノートの on/off 時刻を返す。
 *
 * 窓は「線形 (非折返し) の beat 範囲」に写して判定する。折返し後の beat は非単調で窓判定に
 * 使えないため、線形 beat で「そのノートが何度目のループで鳴るか (k 周目)」を数えて発火を拾う。
 * ループ境界 (末尾→先頭) を跨ぐ窓でも、次周の先頭ノートを正しく先読み発火できる。
 *
 * ワークレットは process() の量子 [currentTime, currentTime + 128/sr) をこの窓に渡し、
 * 返った onTime/offTime (秒) でボイスをサンプル精度に発火する。
 *
 * @param {{notes:{midi:number,startStep:number,lenSteps:number,vel:number}[], stepsPerBeat:number}} pattern
 * @param {{startBeat:number,startTime:number,bpm:number,loopStart:number,loopEnd:number,loopOn:boolean}} clock
 * @param {number} t0  窓の開始 (秒, 含む)
 * @param {number} t1  窓の終了 (秒, 含まない)。t1 > t0
 * @returns {{midi:number,vel:number,onTime:number,offTime:number}[]}  発火 (時間昇順ではない)
 */
export function notesOnsetsInWindow(pattern, clock, t0, t1) {
  const { notes, stepsPerBeat } = pattern;
  const { startBeat, startTime, bpm, loopStart, loopEnd, loopOn } = clock;
  const beatsPerSec = bpm / 60;
  if (!(beatsPerSec > 0) || !(t1 > t0) || !notes || !notes.length) return [];

  // 窓を線形 beat 範囲へ (折返しなし・単調)
  const bLin0 = startBeat + (t0 - startTime) * beatsPerSec;
  const bLin1 = startBeat + (t1 - startTime) * beatsPerSec;
  const beatToTime = (b) => startTime + (b - startBeat) / beatsPerSec;

  const period = loopEnd - loopStart;
  const looping = loopOn && period > 0;
  const out = [];

  for (const n of notes) {
    const onBeat = n.startStep / stepsPerBeat;
    const lenBeat = n.lenSteps / stepsPerBeat;

    if (looping) {
      // ループ範囲外に置かれたノートはループ中は鳴らない
      if (onBeat < loopStart || onBeat >= loopEnd) continue;
      // このノートが窓に入る周回 k を数える (窓は微小なので通常 0〜1 回)
      let cand = onBeat + Math.ceil((bLin0 - onBeat) / period) * period;
      for (; cand < bLin1; cand += period) {
        if (cand < bLin0) continue;
        // off はループ末尾で切る (次周で再発火する)。ROLL では通常 len は範囲内に収まる。
        const offBeat = cand + Math.min(lenBeat, loopEnd - onBeat);
        out.push({
          midi: n.midi,
          vel: n.vel,
          onTime: beatToTime(cand),
          offTime: beatToTime(offBeat),
        });
      }
    } else {
      // 非ループ: 各ノートは 1 度だけ (k=0)
      if (onBeat >= bLin0 && onBeat < bLin1) {
        out.push({
          midi: n.midi,
          vel: n.vel,
          onTime: beatToTime(onBeat),
          offTime: beatToTime(onBeat + lenBeat),
        });
      }
    }
  }
  return out;
}
