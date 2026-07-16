/**
 * @module app/track
 * track.js — TRACK ウィンドウ (編集トラックの選択面)
 *
 * マルチトラック打ち込みのための極小アプリ。共有ソングモデル (app/music/song.js) の
 * 4 トラックのうち「今どれを編集するか」を切り替えるだけ。選択に応じて SYNTH は音色を、
 * ROLL はノート (と他トラックのゴースト) を切り替える。
 *
 * ── UI ──
 *   各トラック 1 行: [n] ラジオ (編集対象の選択。常にちょうど 1 つ) + [SOLO] [MUTE] トグル
 *   (発音制御)。SOLO/MUTE は 1 トラック内で排他、SOLO があればソロのみ発音 — この排他と
 *   発音判定 (isAudible) は共有 song モデルが担い、ROLL の再生と発音中ハイライトが従う。
 *
 *     [1][SOLO][MUTE]
 *     [2][SOLO][MUTE]
 *     [3][SOLO][MUTE]
 *     [4][SOLO][MUTE]
 *
 * 将来この窓を残すか Arrangement アプリへ発展させるかは未定。現段階は独立ウィンドウで最小構成。
 */

import { wmOpen, wmRegister } from "../wm/index.js";
import * as song from "./music/song.js";
import {
  WidgetGroup,
  VBox,
  HBox,
  RadioButton,
  ToggleButton,
  FOCUS_MARGIN,
  GAP,
} from "../ui/index.js";

export const APP_NAME = "TRACK";

/** ラジオグループ名 (WidgetGroup の排他制御キー)。 */
const GROUP = "TRACK";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ウィジェット (遅延初期化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let radios = [];
let soloBtns = [];
let muteBtns = [];
let group;
let _ready = false;

function _initWidgets() {
  if (_ready) return;
  _ready = true;

  radios = [];
  soloBtns = [];
  muteBtns = [];
  const rows = [];
  for (let i = 0; i < song.getTrackCount(); i++) {
    const idx = i;
    // [n]  … 編集トラック選択 (ラジオ) / [SOLO] [MUTE] … 発音制御 (排他は song モデルが担う)
    const r = new RadioButton(
      0,
      0,
      String(i + 1),
      GROUP,
      () => song.setSelectedIndex(idx),
      i === song.getSelectedIndex(),
    );
    const solo = new ToggleButton(0, 0, "SOLO", (v) => song.setSolo(idx, v), song.isSolo(i));
    solo.tooltip = "Solo this track (only soloed tracks play)";
    const mute = new ToggleButton(0, 0, "MUTE", (v) => song.setMute(idx, v), song.isMute(i));
    mute.tooltip = "Mute this track";
    radios.push(r);
    soloBtns.push(solo);
    muteBtns.push(mute);
    rows.push(HBox([r, solo, mute], GAP));
  }

  const root = VBox(rows, GAP);
  group = new WidgetGroup(root, { x: FOCUS_MARGIN, y: FOCUS_MARGIN });

  // 選択・SOLO/MUTE が他経路や排他解除で変わってもボタン表示を追従させる。
  song.onSelectionChange(syncSelection);
  song.onChange(syncSoloMute);
}

/** ラジオボタンの点灯を選択トラックに揃える (直接代入なので onChange は発火しない)。 */
function syncSelection() {
  const sel = song.getSelectedIndex();
  for (let i = 0; i < radios.length; i++) radios[i].value = i === sel;
}

/** SOLO/MUTE ボタンの点灯をモデルに揃える (排他で片方が下りたときも追従。直接代入で onChange 不発火)。 */
function syncSoloMute() {
  for (let i = 0; i < soloBtns.length; i++) {
    soloBtns[i].value = song.isSolo(i);
    muteBtns[i].value = song.isMute(i);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画 / 入力 / 測定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawTrack(cr) {
  _initWidgets();
  group.draw(cr);
}

function onTrackInput(ev) {
  _initWidgets();
  group.update(ev);
}

function measureTrack() {
  _initWidgets();
  return group.measure();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  登録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

wmRegister(
  APP_NAME,
  () => {
    _initWidgets();
    return wmOpen(-1, -1, 0, 0, APP_NAME, drawTrack, onTrackInput, measureTrack, {
      about:
        "Selects which of the 4 tracks you are editing. SYNTH shows and edits the " +
        "selected track's sound (waveform, ADSR, volume); ROLL edits its notes and " +
        "shows the other tracks as a checkerboard ghost behind them. Exactly one track " +
        "is selected at a time. All 4 tracks play together.",
    });
  },
  // SYNESTA メンバー: アイコン / ランチャーには出さず、SYNESTA からまとめて起動する。
  { category: "CREATIVE", shortName: "TRACK", dev: true, hidden: true, noIcon: true },
);
