/**
 * @module app/music/tracks
 * tracks.js — トラック・レジストリ (音楽アプリ間連携の土台)
 *
 * モジュラー DAW の中核単位「トラック」を集中管理する軽量レジストリ。各アプリは
 * 一体化せず独立して動きつつ、ここを介して疎結合に連携する (memory: music-apps-direction)。
 *
 * track = {
 *   id: string,          // 一意識別子 (アプリ名やインスタンス ID)
 *   name: string,        // 表示名
 *   instrument: {         // 発音先。PolySynth 互換のごく薄いインタフェース
 *     noteOn(midi, vel, time?),
 *     noteOff(midi, time?),
 *     allNotesOff(),
 *   },
 *   // ── 将来の拡張余地 ──
 *   //   mixer:  { gain, pan, mute, solo }        … Mixer アプリ
 *   //   clips:  [...]                            … Arrangement アプリ
 * }
 *
 * 現状の連携: SYNTH が自身の音源をトラックとして登録し、ROLL が「発音先」として参照する
 * (デフォルト = 先頭トラック)。マルチ SYNTH / ルーティング / ミキサーはこの上に積む。
 */

/** @type {Array<object>} */
const _tracks = [];

/** 変更通知リスナ (将来 Mixer / Arrangement が一覧の更新に反応する用) */
const _listeners = [];
function _notify() {
  for (const cb of _listeners) {
    try {
      cb();
    } catch (e) {
      console.error("[tracks] listener error:", e);
    }
  }
}

/** トラックを追加する (同 id は置換)。 */
export function addTrack(track) {
  const i = _tracks.findIndex((t) => t.id === track.id);
  if (i >= 0) _tracks[i] = track;
  else _tracks.push(track);
  _notify();
  return track;
}

/** id のトラックを取り除く。 */
export function removeTrack(id) {
  const i = _tracks.findIndex((t) => t.id === id);
  if (i >= 0) {
    _tracks.splice(i, 1);
    _notify();
  }
}

/** 全トラックの配列 (コピー) を返す。 */
export function getTracks() {
  return _tracks.slice();
}

/** id 指定でトラックを取得 (無ければ null)。 */
export function getTrack(id) {
  return _tracks.find((t) => t.id === id) || null;
}

/** デフォルト (先頭) トラックを返す (無ければ null)。 */
export function getDefaultTrack() {
  return _tracks[0] || null;
}

/** トラック一覧の変更を購読する。 */
export function onChange(cb) {
  _listeners.push(cb);
}
