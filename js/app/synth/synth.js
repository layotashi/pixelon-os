/**
 * @module app/synth/synth
 * synth.js — SYNTH ウィンドウ (ポリフォニック・ソフトシンセ)
 *
 * 音楽制作機能の再設計・第 1 弾。単体で完結するソフトシンセサイザ。
 * 音色を作り (波形 / ADSR / 音量 / 位相)、PC キーボードで和音を演奏する。
 *
 * 音源は core/audio.js の PolySynth (ポリフォニック)。SYNESTA には依存しない
 * 完全な新規アプリ。オンスクリーン鍵盤 (M3) と Web MIDI 入力 (M4) は後続で追加する。
 *
 * 演奏キー (フォーカス時):
 *   Z 段 = 現オクターブ, Q 段 = +1oct, I〜P = +2oct
 *   , / .  … オクターブ下げ / 上げ    [ / ]  … ベロシティ ± 10    /  … 波形順送り
 */

import { pset, drawRoundRect } from "../../core/gpu.js";
import { drawText, textWidth, GLYPH_H } from "../../core/font.js";
import { keyDown, keyHeld } from "../../core/input.js";
import { wmOpen, wmRegister, wmIsFocused } from "../../wm/index.js";
import { createPolySynth } from "../../core/audio.js";
import * as UI from "../../ui/index.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const APP_NAME = "SYNTH";

/** 波形プレビュー幅 (px) — cw=64 = 4*halfH(16) で TRI が正確に 45° */
const PREVIEW_WIDTH = 68;
/** 波形プレビュー高さ (px) */
const PREVIEW_HEIGHT = 37;
/** スライダー幅 (px) */
const SLIDER_WIDTH = 60;

/** オクターブの下限 / 上限 (offsetToMidi が MIDI 0〜127 に収まる範囲) */
const OCTAVE_MIN = 1;
const OCTAVE_MAX = 7;
/** ベロシティの下限 / 上限 / 刻み */
const VEL_MIN = 10;
const VEL_MAX = 127;
const VEL_STEP = 10;

// ── 波形 (表示名 / 内部 ID) ──
const WAVE_ITEMS = ["SAW", "TRI", "SQ50", "SQ25", "SQ12", "SINE", "NOISE"];
const WAVE_IDS = ["saw", "tri", "sq50", "sq25", "sq12", "sine", "noise"];
const waveIndexMap = Object.fromEntries(WAVE_IDS.map((id, i) => [id, i]));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  音源 (遅延生成)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @type {import("../../core/audio.js").PolySynth|null} */
let _synth = null;

/** PolySynth を遅延生成して返す */
function synth() {
  if (!_synth) _synth = createPolySynth();
  return _synth;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  演奏状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 現在のオクターブ (Z 段の基準) */
let octave = 4;
/** ベロシティ (0〜127) */
let velocity = 100;

/** 押下中の物理キー → 発音した MIDI ノート番号 (ノートオフ用に押下時の音程を保持) */
const heldKeys = new Map();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  キーボード → ノート マッピング (C からの半音オフセット)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const KEY_MAP = [
  // 下段: Z〜M = C〜B (octave)
  { code: "KeyZ", offset: 0 },
  { code: "KeyS", offset: 1 },
  { code: "KeyX", offset: 2 },
  { code: "KeyD", offset: 3 },
  { code: "KeyC", offset: 4 },
  { code: "KeyV", offset: 5 },
  { code: "KeyG", offset: 6 },
  { code: "KeyB", offset: 7 },
  { code: "KeyH", offset: 8 },
  { code: "KeyN", offset: 9 },
  { code: "KeyJ", offset: 10 },
  { code: "KeyM", offset: 11 },
  // 中段: Q〜U = C〜B (octave + 1)
  { code: "KeyQ", offset: 12 },
  { code: "Digit2", offset: 13 },
  { code: "KeyW", offset: 14 },
  { code: "Digit3", offset: 15 },
  { code: "KeyE", offset: 16 },
  { code: "KeyR", offset: 17 },
  { code: "Digit5", offset: 18 },
  { code: "KeyT", offset: 19 },
  { code: "Digit6", offset: 20 },
  { code: "KeyY", offset: 21 },
  { code: "Digit7", offset: 22 },
  { code: "KeyU", offset: 23 },
  // 上段: I〜P = C〜E (octave + 2)
  { code: "KeyI", offset: 24 },
  { code: "Digit9", offset: 25 },
  { code: "KeyO", offset: 26 },
  { code: "Digit0", offset: 27 },
  { code: "KeyP", offset: 28 },
];

/** オフセット + オクターブから MIDI ノート番号を計算する (C4 = 60) */
function offsetToMidi(offset) {
  return 12 + octave * 12 + offset;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ウィジェット (遅延初期化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let dropDownWave;
let labelWaveform;
let numberBoxAttack, numberBoxDecay, numberBoxSustain, numberBoxRelease;
let labelVolumeValue, sliderVolume;
let labelPhaseValue, sliderPhase;
let synthRoot;
let allWidgets;
let _ready = false;

function formatPercent(v) {
  return String(v).padStart(4) + "%";
}
function formatDegrees(v) {
  return String(v).padStart(4) + "DEG";
}

/** ADSR の 1 パラメータぶんの縦積み (ラベル / 数値 + 単位) を構成する */
function adsrCell(label, numberBox, unit) {
  return UI.VBox([
    new UI.Label(0, 0, label),
    UI.HBox([numberBox, new UI.Label(0, 0, unit)]),
  ]);
}

function _initWidgets() {
  if (_ready) return;
  _ready = true;

  // ── 波形 ──
  dropDownWave = new UI.DropDown(0, 0, WAVE_ITEMS, 0, (idx) => {
    synth().setWaveform(WAVE_IDS[idx]);
  });
  labelWaveform = new UI.Label(0, 0, "WAVEFORM:");

  // ── ADSR (ms / %) ── PolySynth の初期値に合わせる
  numberBoxAttack = new UI.NumberBox(0, 0, 0, 2000, 10, 1, (v) => {
    applyADSR({ a: v });
  }, { digits: 4 });
  numberBoxDecay = new UI.NumberBox(0, 0, 0, 2000, 100, 1, (v) => {
    applyADSR({ d: v });
  }, { digits: 4 });
  numberBoxSustain = new UI.NumberBox(0, 0, 0, 100, 80, 1, (v) => {
    applyADSR({ s: v });
  }, { digits: 3 });
  numberBoxRelease = new UI.NumberBox(0, 0, 0, 2000, 200, 1, (v) => {
    applyADSR({ r: v });
  }, { digits: 4 });

  const adsrGrid = UI.HBox([
    adsrCell("A:", numberBoxAttack, "MS"),
    adsrCell("D:", numberBoxDecay, "MS"),
    adsrCell("S:", numberBoxSustain, "%"),
    adsrCell("R:", numberBoxRelease, "MS"),
  ]);

  // ── 音量 ──
  labelVolumeValue = new UI.Label(0, 0, formatPercent(50));
  sliderVolume = new UI.Slider(0, 0, SLIDER_WIDTH, 0, 100, 50, (v) => {
    labelVolumeValue.text = formatPercent(v);
    synth().setVolume(v);
  });

  // ── 位相 ──
  labelPhaseValue = new UI.Label(0, 0, formatDegrees(0));
  sliderPhase = new UI.Slider(0, 0, SLIDER_WIDTH, 0, 359, 0, (v) => {
    labelPhaseValue.text = formatDegrees(v);
    synth().setStartPhase(v / 360);
  });
  sliderPhase.wheelStep = 5; // 1 ノッチ = 5°

  synthRoot = UI.VBox([
    UI.HBox([labelWaveform, dropDownWave]),
    adsrGrid,
    UI.HBox([new UI.Label(0, 0, "VOL:"), sliderVolume, labelVolumeValue]),
    UI.HBox([new UI.Label(0, 0, "PHS:"), sliderPhase, labelPhaseValue]),
  ]);

  // ウィジェットは波形プレビューの下から並べる
  allWidgets = new UI.WidgetGroup(synthRoot, {
    x: UI.FOCUS_MARGIN,
    y: UI.FOCUS_MARGIN + PREVIEW_HEIGHT + UI.GAP,
  });
}

/** ADSR の一部を更新して PolySynth に反映する */
function applyADSR({ a, d, s, r }) {
  const cur = synth().getADSR();
  synth().setADSR(
    a !== undefined ? a : cur.a,
    d !== undefined ? d : cur.d,
    s !== undefined ? s : cur.s,
    r !== undefined ? r : cur.r,
  );
}

/** ウィジェットの配置を再計算する */
function relayout() {
  synthRoot.layout(UI.FOCUS_MARGIN, UI.FOCUS_MARGIN + PREVIEW_HEIGHT + UI.GAP);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawSynth(cr) {
  _initWidgets();

  // 演奏入力 (毎フレーム)
  handleKeyboard();

  // ── 波形プレビュー ──
  drawWaveformPreview(cr.x + UI.FOCUS_MARGIN, cr.y + UI.FOCUS_MARGIN);

  // ── 音作りウィジェット ──
  allWidgets.draw(cr);

  // ── ステータス行 (オクターブ / ベロシティ / 発音数) ──
  const widgetsBottom = allWidgets.measure().h - UI.FOCUS_MARGIN;
  const statusY = cr.y + widgetsBottom + UI.GAP;
  drawText(cr.x + UI.FOCUS_MARGIN, statusY, statusText(), 1);
}

/** ステータス行の文字列 (値によらず幅が安定するよう桁を揃える) */
function statusText() {
  const oct = String(octave);
  const vel = String(velocity).padStart(3);
  const poly = String(synth().heldCount).padStart(2);
  return `OCT ${oct}  VEL ${vel}  POLY ${poly}`;
}

/** 波形プレビューを描画する (位相 0 が中央) */
function drawWaveformPreview(ox, oy) {
  const pw = PREVIEW_WIDTH;
  const ph = PREVIEW_HEIGHT;
  drawRoundRect(ox, oy, pw, ph, 1, 1);

  // コンテンツ領域 (枠 1px + 余白 1px = 2px インセット)
  const cx1 = ox + 2;
  const cy1 = oy + 2;
  const cw = pw - 4;
  const ch = ph - 4;

  // 水平中心線 (破線)
  const mid = cy1 + (ch >> 1);
  for (let x = cx1; x < cx1 + cw; x += 2) pset(x, mid, 1);
  // 垂直中心線 (位相 0 = 再生開始位置, 破線)
  const centerX = cx1 + (cw >> 1);
  for (let y = cy1; y < cy1 + ch; y += 2) pset(centerX, y, 1);

  // 波形 (位相 0 が中央に来るよう半周期ずらして描画)
  const halfH = ch >> 1;
  const samples = synth().getWaveformSamples(cw);
  const half = cw >> 1;
  for (let i = 0; i < cw; i++) {
    const si = (i + half) % cw;
    const sy = mid - Math.round(samples[si] * halfH);
    pset(cx1 + i, sy, 1);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  演奏入力 (ポリフォニック)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleKeyboard() {
  // フォーカスを失ったら全ノートを止める
  if (!wmIsFocused(APP_NAME)) {
    if (heldKeys.size > 0) {
      synth().allNotesOff();
      heldKeys.clear();
    }
    return;
  }

  // ── オクターブ / ベロシティ / 波形の切替 ──
  if (keyDown("Comma")) octave = Math.max(OCTAVE_MIN, octave - 1);
  if (keyDown("Period")) octave = Math.min(OCTAVE_MAX, octave + 1);
  if (keyDown("BracketLeft")) velocity = Math.max(VEL_MIN, velocity - VEL_STEP);
  if (keyDown("BracketRight")) velocity = Math.min(VEL_MAX, velocity + VEL_STEP);
  if (keyDown("Slash")) {
    const wf = synth().cycleWaveform();
    dropDownWave.selectedIndex = waveIndexMap[wf] ?? 0;
  }

  // ── 新規押下 → ノートオン (和音対応) ──
  for (const k of KEY_MAP) {
    if (keyDown(k.code) && !heldKeys.has(k.code)) {
      const midi = offsetToMidi(k.offset);
      synth().noteOn(midi, velocity / 127);
      heldKeys.set(k.code, midi);
    }
  }

  // ── 離鍵 → ノートオフ (押下時の音程で止める) ──
  for (const [code, midi] of heldKeys) {
    if (!keyHeld(code)) {
      synth().noteOff(midi);
      heldKeys.delete(code);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  入力ルーティング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function onSynthInput(ev) {
  _initWidgets();
  allWidgets.update(ev);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  測定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function measureSynth() {
  _initWidgets();
  relayout();
  const m = allWidgets.measure();
  const statusW = UI.FOCUS_MARGIN + textWidth("OCT 8  VEL 127  POLY 16") + UI.FOCUS_MARGIN;
  const w = Math.max(m.w, PREVIEW_WIDTH + UI.FOCUS_MARGIN * 2, statusW);
  const h = m.h + UI.GAP + GLYPH_H; // ステータス行のぶんを追加
  return { w, h };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  リセット / 閉じる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 発音を止め演奏状態を初期化する (ウィンドウを閉じるとき) */
function resetSynthState() {
  if (_synth) _synth.allNotesOff();
  heldKeys.clear();
  octave = 4;
  velocity = 100;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  登録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let synthWinId = -1;

wmRegister(
  APP_NAME,
  () => {
    _initWidgets();
    synthWinId = wmOpen(-1, -1, 0, 0, APP_NAME, drawSynth, onSynthInput, measureSynth, {
      about:
        "A polyphonic software synthesizer. Shape a sound with the waveform, " +
        "ADSR, volume and phase controls, then play chords on the PC keyboard " +
        "(Z row = current octave, Q row = +1, I-P = +2). Use , . to change " +
        "octave, [ ] for velocity, / to cycle the waveform.",
      onBeforeClose: () => {
        resetSynthState();
        return true;
      },
      onRelayout: () => {
        if (!allWidgets) return;
        allWidgets.remeasureAll();
        relayout();
      },
    });
    return synthWinId;
  },
  { category: "CREATIVE", dev: true },
);
