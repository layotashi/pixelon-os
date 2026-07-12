/**
 * @module app/roll/roll
 * roll.js — ROLL ウィンドウ (ステップグリッド MIDI エディタ)
 *
 * 最小構成からの再出発。ボディには表を 1 枚だけ描く:
 *   横 16 列 = 1 小節を 16 分音符で分割したステップ。
 *   縦 12 行 = 1 オクターブを構成する 12 音。
 *   計 192 セル。罫線はすべて 1px の実線。
 *
 * 鍵盤・音名・小節番号・ノート・再生・編集・選択・拍の強調表示は、この段階では
 * 一切実装しない。ここから段階的に積み上げる。ノートモデルや再生ロジックは
 * grid.js に温存 (このウィンドウからは未接続) してある。
 */

import { fillRect, hline, vline } from "../../core/gpu.js";
import { wmOpen, wmRegister } from "../../wm/index.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const APP_NAME = "ROLL";

/** 表の格子数: 横 16 列 (1 小節 / 16 分音符) × 縦 12 行 (1 オクターブ 12 音) */
const COLS = 16;
const ROWS = 12;

/** 1 セルの寸法 (DOT) */
const CELL_W = 16;
const CELL_H = 16;

/** 表の外寸 (DOT)。右端・下端の罫線は +1px 先に来る */
const TABLE_W = COLS * CELL_W;
const TABLE_H = ROWS * CELL_H;

/** ボディ余白 (DOT) */
const MARGIN = 12;

/** 初期ボディサイズ (DOT)。表 + 余白 + 閉じ罫線ちょうど。fixed-size */
const ROLL_W = MARGIN * 2 + TABLE_W + 1;
const ROLL_H = MARGIN * 2 + TABLE_H + 1;

let winId = -1;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function onDraw(cr) {
  // 背景をペーパーでクリア
  fillRect(cr.x, cr.y, cr.w, cr.h, 0);

  // 表の左上原点 (ボディ左上から余白ぶん内側)
  const x0 = cr.x + MARGIN;
  const y0 = cr.y + MARGIN;

  // 縦罫線 17 本 (列境界。左端〜右端)
  for (let c = 0; c <= COLS; c++) {
    vline(x0 + c * CELL_W, y0, y0 + TABLE_H, 1);
  }
  // 横罫線 13 本 (行境界。上端〜下端)
  for (let r = 0; r <= ROWS; r++) {
    hline(x0, x0 + TABLE_W, y0 + r * CELL_H, 1);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  登録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

wmRegister(
  APP_NAME,
  () => {
    winId = wmOpen(-1, -1, ROLL_W, ROLL_H, APP_NAME, onDraw, null, null, {
      onBeforeClose: () => {
        winId = -1;
        return true;
      },
      about:
        "A step-grid MIDI editor, rebuilt from a minimal core. The body shows a single " +
        "16-column x 12-row table: 16 sixteenth-note steps of one bar across, the 12 " +
        "semitones of an octave down. Just the grid for now — keys, notes, and playback " +
        "come next.",
    });
    return winId;
  },
  { category: "CREATIVE", dev: true },
);
