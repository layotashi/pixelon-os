/**
 * @module core/midi_input
 * midi_input.js — Web MIDI 入力 (OS レベル)
 *
 * `navigator.requestMIDIAccess()` を薄く包み、全 MIDI 入力ポートの note on/off を購読して
 * コールバックに正規化 (midi 番号 + ベロシティ 0..1) して渡す。gpu.js が描画基盤、
 * audio.js が音声基盤であるように、これは MIDI 入力基盤。
 *
 * 非対応環境 (Safari 等・非セキュアコンテキスト) では無効化し、呼び出し側は PC 鍵盤に
 * フォールバックする。発音そのものは持たず、入力イベントを橋渡しするだけ (音源は PolySynth)。
 *
 * 対応メッセージ: Note On (0x90, vel>0) / Note Off (0x80 または 0x90 vel=0)。
 * Control Change / Pitch Bend 等は将来対応。
 */

/** @type {MIDIAccess|null} */
let _access = null;
let _onNoteOn = null;
let _onNoteOff = null;
let _onStateChange = null;

/** Web MIDI API が利用可能か (ブラウザ + セキュアコンテキスト) */
export function isMidiSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.requestMIDIAccess === "function"
  );
}

/**
 * MIDI バイト列を { kind, note, velocity } に正規化する。対象外は null。
 * チャンネルは無視 (下位ニブルをマスク)。純関数 — テスト可能。
 * @param {Uint8Array|number[]} data
 * @returns {{ kind:"on"|"off", note:number, velocity:number }|null}
 */
export function parseMidiMessage(data) {
  const status = data[0] & 0xf0;
  const note = data[1];
  const vel = data.length > 2 ? data[2] : 0;
  if (status === 0x90 && vel > 0) {
    return { kind: "on", note, velocity: vel / 127 };
  }
  if (status === 0x80 || (status === 0x90 && vel === 0)) {
    return { kind: "off", note, velocity: 0 };
  }
  return null;
}

/**
 * MIDI 入力を初期化し、note on/off を購読する。
 * 非対応・失敗時は false で解決 (例外を投げない)。二度目以降は既存アクセスを再利用。
 *
 * @param {{ onNoteOn?:(midi:number, vel:number)=>void,
 *           onNoteOff?:(midi:number)=>void,
 *           onStateChange?:()=>void }} cbs
 * @returns {Promise<boolean>} 有効化できたら true
 */
export function initMidiInput(cbs = {}) {
  _onNoteOn = cbs.onNoteOn || null;
  _onNoteOff = cbs.onNoteOff || null;
  _onStateChange = cbs.onStateChange || null;

  if (!isMidiSupported()) return Promise.resolve(false);
  if (_access) {
    _bindInputs();
    return Promise.resolve(true);
  }
  return navigator
    .requestMIDIAccess({ sysex: false })
    .then((access) => {
      _access = access;
      _bindInputs();
      access.onstatechange = () => {
        _bindInputs();
        if (_onStateChange) _onStateChange();
      };
      if (_onStateChange) _onStateChange();
      return true;
    })
    .catch(() => false);
}

/** 全入力ポートに onmidimessage を張り直す (デバイス着脱時にも呼ばれる) */
function _bindInputs() {
  if (!_access) return;
  for (const input of _access.inputs.values()) {
    input.onmidimessage = _handleMessage;
  }
}

function _handleMessage(ev) {
  const msg = parseMidiMessage(ev.data);
  if (!msg) return;
  if (msg.kind === "on") {
    if (_onNoteOn) _onNoteOn(msg.note, msg.velocity);
  } else if (_onNoteOff) {
    _onNoteOff(msg.note);
  }
}

/** 接続中の MIDI 入力デバイス数 */
export function getMidiInputCount() {
  return _access ? _access.inputs.size : 0;
}
