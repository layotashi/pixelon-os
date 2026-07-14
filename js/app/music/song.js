/**
 * @module app/music/song
 * song.js — 共有 4 トラック・ソングモデル (SYNTH / ROLL / TRACK が編集する SSoT)
 *
 * これまでの 1 トラック連携 (tracks.js: SYNTH が音源を publish → ROLL が consume) を、
 * チップチューン向けの 4 トラック固定構成へ拡張したもの。単一の共有モデルが 4 トラックを
 * 所有し、各アプリはその view / editor になる:
 *   - TRACK  … どのトラックを編集中か (選択) を切り替える
 *   - SYNTH  … 選択トラックの音色 (patch) を表示・編集する
 *   - ROLL   … 選択トラックのノート (clip) を編集し、他トラックはゴースト表示する
 *
 * 各トラックは独立した音色 (波形 / ADSR / 音量 / ボイス数) と打ち込み (clip) を持ち、
 * 1 トラック = 1 発音チャンネル (ChipSynth)。4 チャンネルは同時発音される。
 *
 * ── track 構造 ──
 *   {
 *     name,                                   // 表示名 (LEAD / CHORD / BASS / DRUM。用途は固定しない)
 *     patch: { waveform, a, d, s, r, volume, maxVoices },  // SYNTH の全パラメータ
 *                                             //   a/d/r=ms, s=0..100%, volume=0..100
 *     clip:  { notes:[{pitch,start,len,vel}], steps, stepsPerBeat },  // core/clip.js のノート形状
 *     _instrument,                            // 遅延生成 (ChipSynth|PolySynth)。getInstrument で確保
 *   }
 *
 * ── 将来 (.song) ──
 *   本モデルが将来の .song プロジェクトファイルで直列化される対象。エフェクト / PAN /
 *   Mute-Solo / オートメーション / 複数クリップは加算的に足す (docs/SONG_FORMAT_SPEC.md)。
 *   現状はインメモリのみ (永続化しない)。
 */

import { createInstrument } from "../../core/chip.js";
import { DEFAULT_STEPS, DEFAULT_STEPS_PER_BEAT } from "../../core/clip.js";

/** 固定トラック数 (チップチューン向け。初期段階はこれで十分)。 */
export const TRACK_COUNT = 4;

/**
 * トラック既定 (チップチューン)。ADSR は全トラック MIN/MIN/MAX/MIN (= 0/0/100/0)。
 * 波形は用途に合わせて分ける (PULSE = パルス波。SYNTH 表示名 SQ**、内部 ID sq**)。
 *   1: LEAD  = PULSE25 (sq25) / 2: CHORD = PULSE12 (sq12) / 3: BASS = TRI / 4: DRUM = NOISE
 */
const DEFAULT_TRACKS = [
  { name: "LEAD", waveform: "sq25" },
  { name: "CHORD", waveform: "sq12" },
  { name: "BASS", waveform: "tri" },
  { name: "DRUM", waveform: "noise" },
];

/** 全トラック共通の既定 patch 値 (波形 / 名前以外)。 */
const DEFAULT_ADSR = { a: 0, d: 0, s: 100, r: 0 };
const DEFAULT_VOLUME = 50;
const DEFAULT_MAX_VOICES = 16;

function makeTrack(i) {
  const d = DEFAULT_TRACKS[i] || { name: "TRACK" + (i + 1), waveform: "sq50" };
  return {
    name: d.name,
    patch: {
      waveform: d.waveform,
      a: DEFAULT_ADSR.a,
      d: DEFAULT_ADSR.d,
      s: DEFAULT_ADSR.s,
      r: DEFAULT_ADSR.r,
      volume: DEFAULT_VOLUME,
      maxVoices: DEFAULT_MAX_VOICES,
    },
    clip: { notes: [], steps: DEFAULT_STEPS, stepsPerBeat: DEFAULT_STEPS_PER_BEAT },
    _instrument: null,
  };
}

/** @type {Array<object>} 固定長 4。 */
const _tracks = Array.from({ length: TRACK_COUNT }, (_, i) => makeTrack(i));

/** 現在の編集対象トラック index。 */
let _selected = 0;

/** 選択変更リスナ (SYNTH / ROLL / TRACK が表示を切り替える)。 */
const _selListeners = [];
/** モデル変更リスナ (patch 変更など。clip の内容はプル参照なので通知しない)。 */
const _changeListeners = [];

function _notifySel(next, prev) {
  for (const cb of _selListeners) {
    try {
      cb(next, prev);
    } catch (e) {
      console.error("[song] selection listener error:", e);
    }
  }
}
function _notifyChange() {
  for (const cb of _changeListeners) {
    try {
      cb();
    } catch (e) {
      console.error("[song] change listener error:", e);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  トラック / 選択
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getTrackCount() {
  return TRACK_COUNT;
}

/** 全トラック (配列コピー)。 */
export function getTracks() {
  return _tracks.slice();
}

export function getTrack(i) {
  return _tracks[i] || null;
}

export function getSelectedIndex() {
  return _selected;
}

export function getSelectedTrack() {
  return _tracks[_selected];
}

/** 編集対象トラックを切り替える。範囲外・同一なら無視。変更時に選択リスナへ (next, prev) を通知。 */
export function setSelectedIndex(i) {
  i = i | 0;
  if (i < 0 || i >= TRACK_COUNT || i === _selected) return;
  const prev = _selected;
  _selected = i;
  _notifySel(i, prev);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  音色 (patch)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** トラック i の patch (コピー)。 */
export function getPatch(i) {
  const t = _tracks[i];
  return t ? { ...t.patch } : null;
}

/**
 * トラック i の patch を部分更新し、そのトラックの音源へ即反映する。
 * @param {number} i
 * @param {object} partial waveform / a / d / s / r / volume / maxVoices の一部
 */
export function updatePatch(i, partial) {
  const t = _tracks[i];
  if (!t) return;
  Object.assign(t.patch, partial);
  _applyPatch(t);
  _notifyChange();
}

function _applyPatch(t) {
  const inst = t._instrument;
  if (!inst) return; // 音源未生成なら生成時に反映される
  const p = t.patch;
  inst.setWaveform(p.waveform);
  inst.setADSR(p.a, p.d, p.s, p.r);
  inst.setVolume(p.volume);
  inst.setMaxVoices(p.maxVoices);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  クリップ (ノート)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** トラック i の clip (実体参照。読み取り用)。 */
export function getClip(i) {
  const t = _tracks[i];
  return t ? t.clip : null;
}

/**
 * トラック i のノート列を差し替える (steps / stepsPerBeat は保持)。
 * clip の内容は各アプリが毎フレーム プル参照するため通知はしない (通知スパム回避)。
 * @param {number} i
 * @param {Array<{pitch:number,start:number,len:number,vel:number}>} notes MIDI 互換形状
 */
export function setClipNotes(i, notes) {
  const t = _tracks[i];
  if (!t) return;
  t.clip = { steps: t.clip.steps, stepsPerBeat: t.clip.stepsPerBeat, notes };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  音源 (発音チャンネル)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 全トラックの音源を (未生成なら) index 順に生成する。チャンネルが 0..N-1 に揃う。 */
function _ensureInstruments() {
  for (let i = 0; i < TRACK_COUNT; i++) {
    const t = _tracks[i];
    if (!t._instrument) {
      t._instrument = createInstrument();
      _applyPatch(t);
    }
  }
}

/**
 * トラック i の音源を返す (初回に全 4 音源を index 順で生成しチャンネルを 0..3 に固定)。
 * ユーザー操作 (発音 / 再生) の起点で呼ぶこと (AudioContext 起こしのため)。
 * @returns {import("../../core/chip.js").ChipSynth|import("../../core/audio.js").PolySynth}
 */
export function getInstrument(i) {
  _ensureInstruments();
  return _tracks[i]._instrument;
}

/** トラック i の音源を「あれば」返す (無ければ null。生成はしない)。読み取り専用の
 *  問い合わせ (押鍵数・押鍵中か 等) を毎フレーム行うときに音源を無駄に生成しないための入口。 */
export function peekInstrument(i) {
  const t = _tracks[i];
  return t ? t._instrument : null;
}

/** 全トラックのライブ発音を止める (再生停止 / パニック用)。 */
export function allNotesOff() {
  for (const t of _tracks) if (t._instrument) t._instrument.allNotesOff();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  購読
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 選択トラックの変更を購読する。cb(nextIndex, prevIndex)。 */
export function onSelectionChange(cb) {
  _selListeners.push(cb);
}

/** patch などモデル変更を購読する。 */
export function onChange(cb) {
  _changeListeners.push(cb);
}

/** テスト用: モデルを初期状態へ戻す。 */
export function _resetSong() {
  for (let i = 0; i < TRACK_COUNT; i++) _tracks[i] = makeTrack(i);
  _selected = 0;
  _selListeners.length = 0;
  _changeListeners.length = 0;
}
