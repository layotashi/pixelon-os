/**
 * @module app/music/transport
 * transport.js — グローバル・トランスポート (共有の再生時計)
 *
 * 音楽アプリが共有する 1 本の「時計」。位置はビート単位で、AudioContext のクロックを
 * 基準に進む。ループ範囲とテンポを持つ。
 *
 * ── 責務分離 ──
 *   再生の「制御」(開始/停止/位置/テンポ/ループ) はここに集約する。将来の Transport
 *   アプリはここを操作するだけでよく、ROLL 等のシーケンサはここを「読んで」自分の
 *   ノートをスケジュールする。update() は誰が毎フレーム呼んでも冪等 (時刻ベース)。
 *   録音・メトロノーム・小節/拍子は将来ここへ足す。
 */

import { getAudioContext, initAudio } from "../../core/audio.js";

let _playing = false;
let _bpm = 120;
let _pos = 0; // 現在位置 (beat)。停止中も保持 (再開用)
let _startBeat = 0; // 再生開始時の位置
let _startTime = 0; // 再生開始時の ctx.currentTime
let _loopStart = 0; // beat
let _loopEnd = 16; // beat (4/4 で 4 小節)
let _loopOn = true;

/** ユーザー操作起点で AudioContext を確実に用意する。 */
function ensureCtx() {
  if (!getAudioContext()) initAudio();
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function isPlaying() {
  return _playing;
}
export function getTempo() {
  return _bpm;
}
export function setTempo(bpm) {
  if (bpm > 0) _bpm = bpm;
}
/** 現在位置 (beat)。 */
export function getPosition() {
  return _pos;
}
/** 位置を beat で設定する (再生中でも再アンカーする)。 */
export function setPosition(beat) {
  _pos = beat;
  _startBeat = beat;
  const ctx = getAudioContext();
  _startTime = ctx ? ctx.currentTime : 0;
}
/** ループ範囲 (beat) と有効/無効を設定する。 */
export function setLoop(startBeat, endBeat, on = true) {
  _loopStart = startBeat;
  _loopEnd = endBeat;
  _loopOn = on;
}
export function getLoop() {
  return { start: _loopStart, end: _loopEnd, on: _loopOn };
}

/** 再生開始。fromBeat 省略 (null) なら現在位置から (= 停止位置からの再開)。 */
export function play(fromBeat) {
  const ctx = ensureCtx();
  if (!ctx) return;
  _startBeat = fromBeat != null ? fromBeat : _pos;
  _pos = _startBeat;
  _startTime = ctx.currentTime;
  _playing = true;
}

/** 停止。位置は保持する (Shift 再生で再開できるよう)。 */
export function stop() {
  _playing = false;
}

/** 毎フレーム呼ぶ。位置を進め、ループが有効なら折り返す。冪等 (時刻ベース)。 */
export function update() {
  if (!_playing) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  let pos = _startBeat + (ctx.currentTime - _startTime) * (_bpm / 60);
  if (_loopOn && _loopEnd > _loopStart) {
    const len = _loopEnd - _loopStart;
    pos = _loopStart + ((((pos - _loopStart) % len) + len) % len);
  }
  _pos = pos;
}
