/**
 * @module app/track
 * track.js — TRACK ウィンドウ (編集トラックの選択面)
 *
 * マルチトラック打ち込みのための極小アプリ。共有ソングモデル (app/music/song.js) の
 * 4 トラックのうち「今どれを編集するか」を切り替えるだけ。選択に応じて SYNTH は音色を、
 * ROLL はノート (と他トラックのゴースト) を切り替える。
 *
 * ── UI ──
 *   縦に並んだ 1 / 2 / 3 / 4 のラジオボタン。常にちょうど 1 つだけ選択される
 *   (排他制御は WidgetGroup が担う)。見た目の統一のため既存の RadioButton を使う。
 *
 * 将来この窓を残すか Arrangement アプリへ発展させるかは未定。現段階は独立ウィンドウで最小構成。
 */

import { wmOpen, wmRegister } from "../wm/index.js";
import * as song from "./music/song.js";
import { WidgetGroup, VBox, RadioButton, FOCUS_MARGIN, GAP } from "../ui/index.js";

export const APP_NAME = "TRACK";

/** ラジオグループ名 (WidgetGroup の排他制御キー)。 */
const GROUP = "TRACK";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ウィジェット (遅延初期化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let radios = [];
let group;
let _ready = false;

function _initWidgets() {
  if (_ready) return;
  _ready = true;

  radios = [];
  for (let i = 0; i < song.getTrackCount(); i++) {
    const r = new RadioButton(
      0,
      0,
      String(i + 1),
      GROUP,
      () => song.setSelectedIndex(i),
      i === song.getSelectedIndex(),
    );
    radios.push(r);
  }

  const root = VBox(radios, GAP);
  group = new WidgetGroup(root, { x: FOCUS_MARGIN, y: FOCUS_MARGIN });

  // 選択が他経路 (将来) で変わってもボタン表示を追従させる。
  song.onSelectionChange(syncSelection);
}

/** ラジオボタンの点灯を選択トラックに揃える (直接代入なので onChange は発火しない)。 */
function syncSelection() {
  const sel = song.getSelectedIndex();
  for (let i = 0; i < radios.length; i++) radios[i].value = i === sel;
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
