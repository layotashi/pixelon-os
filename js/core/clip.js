/**
 * @module core/clip
 * clip.js — ノートクリップ (フレーズ) の共有モデル + JSON コーデック
 *
 * 音楽アプリ (ROLL / 将来の SEQUENCER・Viewer) が共有する「音符と時間だけ」の
 * 最小モデル。SYNESTA のモノリスへ逆戻りしないため、音色・ミキサー・複数トラックは
 * この形式に一切含めない (docs/MIDI_EDITOR_SPEC.md §4)。
 *
 * ── なぜ独自 JSON で、なぜ MIDI 互換の形状か ──
 *   将来の DAW 化 (.mid 入出力) を見据えるが、Standard MIDI File のバイナリ
 *   (可変長デルタタイム・チャンク・メタイベント) を今書くのは実装コストが高く、
 *   単一ボイス・固定ベロシティの現状では大半が使われない定型になる。
 *   そこで v1 は軽量 JSON で保存しつつ、モデルの粒度を SMF に写せる形
 *   (pitch = MIDI ノート番号、時間 = ステップ = tick 換算可能、per-note len/vel) に
 *   固定する。後から .mid コーデックを足す際にモデルを作り直さなくて済む。
 *
 * ── clip 構造 ──
 *   {
 *     stepsPerBeat,               // 時間解像度 (1 拍あたりのステップ数)
 *     steps,                      // パターン長 (ステップ数)
 *     notes: [ { pitch, start, len, vel } ]
 *   }
 *   pitch = MIDI 0..127 / start = 開始ステップ (0..) / len = 長さ (ステップ, >=1)
 *   vel   = ベロシティ 1..127 (v1 は固定運用だが形式には残し MIDI 互換を保つ)
 *
 * ── 永続形式 (.roll) ──
 *   上記に自己記述用の { format, version } を足した JSON。VFS へテキスト保存する
 *   (core/vfs.js writeFile/readFile)。
 */

// ── 形式メタ ──
export const CLIP_FORMAT = "pixera-clip";
export const CLIP_VERSION = 1;
/** ネイティブクリップの拡張子 */
export const CLIP_EXT = ".roll";

// ── 既定値 / 範囲 ──
export const DEFAULT_STEPS_PER_BEAT = 4;
export const DEFAULT_STEPS = 64; // 4 小節 × 16 分 (ROLL v1 のグリッド)
export const DEFAULT_VEL = 100;

const MIN_PITCH = 0;
const MAX_PITCH = 127;
const MIN_VEL = 1;
const MAX_VEL = 127;

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

/**
 * 1 ノートを正規化する。不正なら null。
 * pitch/vel はクランプ、start は 0 以上、len は 1 以上へ丸める。
 * @param {object} n
 * @returns {{pitch:number,start:number,len:number,vel:number}|null}
 */
function normalizeNote(n) {
  if (!n || typeof n !== "object") return null;
  const pitch = Number(n.pitch);
  const start = Number(n.start);
  const len = Number(n.len);
  if (!Number.isFinite(pitch) || !Number.isFinite(start) || !Number.isFinite(len)) {
    return null;
  }
  const vel = Number.isFinite(Number(n.vel)) ? Number(n.vel) : DEFAULT_VEL;
  return {
    pitch: clampInt(pitch, MIN_PITCH, MAX_PITCH),
    start: Math.max(0, Math.round(start)),
    len: Math.max(1, Math.round(len)),
    vel: clampInt(vel, MIN_VEL, MAX_VEL),
  };
}

/** ノートを (start, pitch) 昇順で並べる。保存を安定・差分に優しくする */
function sortNotes(notes) {
  return notes.slice().sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

/**
 * 素材から正規化済みクリップを組み立てる。
 * 未指定・不正なフィールドは既定値で補い、ノートは検証・整列する。
 * @param {{stepsPerBeat?:number, steps?:number, notes?:Array}} [src]
 * @returns {{stepsPerBeat:number, steps:number, notes:Array}}
 */
export function createClip(src = {}) {
  const stepsPerBeat =
    Number.isFinite(Number(src.stepsPerBeat)) && Number(src.stepsPerBeat) > 0
      ? Math.round(Number(src.stepsPerBeat))
      : DEFAULT_STEPS_PER_BEAT;
  const steps =
    Number.isFinite(Number(src.steps)) && Number(src.steps) > 0
      ? Math.round(Number(src.steps))
      : DEFAULT_STEPS;
  const notes = Array.isArray(src.notes)
    ? sortNotes(src.notes.map(normalizeNote).filter(Boolean))
    : [];
  return { stepsPerBeat, steps, notes };
}

/**
 * クリップを .roll の JSON テキストへ直列化する。
 * ノートは検証・整列され、自己記述用の format/version を付す。
 * @param {{stepsPerBeat?:number, steps?:number, notes?:Array}} clip
 * @returns {string}
 */
export function serializeClip(clip) {
  const c = createClip(clip);
  return JSON.stringify(
    {
      format: CLIP_FORMAT,
      version: CLIP_VERSION,
      stepsPerBeat: c.stepsPerBeat,
      steps: c.steps,
      notes: c.notes,
    },
    null,
    2,
  );
}

/**
 * .roll の JSON テキストを解析してクリップへ復元する。
 * JSON が壊れている・format タグが違う場合は null。
 * ノートは正規化 (範囲クランプ・不正ノート除去) される。
 * @param {string} text
 * @returns {{stepsPerBeat:number, steps:number, notes:Array}|null}
 */
export function parseClip(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  // format タグが有れば検証する (無い最小 JSON も緩く受理する)
  if (data.format !== undefined && data.format !== CLIP_FORMAT) return null;
  return createClip(data);
}
