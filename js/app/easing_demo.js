/**
 * @module app/easing_demo
 * easing_demo.js — イージング関数デモウィンドウ
 *
 * core/anim.js に実装したイージング関数群の動作確認用デモパネル。
 * ListBox でカーブを選択し、右側にグラフとボールアニメーションを表示する。
 *
 * 構成:
 *   - 左: ListBox (カーブ選択) + REPLAY ボタン
 *   - 右: グラフ (追従ドット + 十字線) + 水平ボールトラック + VU バー + t/v 表示
 */

import * as GPU from "../core/gpu.js";
import { drawText, GLYPH_W, GLYPH_H } from "../core/font.js";
import { wmOpen, wmRegister, CONTENT_PADDING } from "../wm/index.js";
import { PushButton, ListBox, WidgetGroup, VBox } from "../ui/index.js";
import { easings, easingNames, clamp01, normalizeTime } from "../core/anim.js";

// ── 定数 ──
const PADDING = CONTENT_PADDING;

const APP_NAME = "EASING_DEMO";

// グラフ
const GRAPH_W = 128;
const GRAPH_H = 128;

// ボールトラック
const TRACK_W = GRAPH_W;
const TRACK_H = 20;
const BALL_RADIUS = 4;

// VU バー
const VU_WIDTH = 6;
const VU_HEIGHT = GRAPH_H;

// アニメーション
const ANIM_DURATION = 1200; // ms
const ANIM_PAUSE = 500; // ms

// ListBox 表示行数
const LISTBOX_ROWS = 8;

// ── 状態 ──
let selectedIndex = 0;
let animStart = 0;

// ── ウィジェット ──
let listBoxEasings;
let buttonReplay;
let widgets = new WidgetGroup();
let easingRoot;

// ── 内部描画ヘルパー ──

/** 点線で水平線を描く */
function dottedHLine(x0, x1, y, c, step) {
  for (let x = x0; x <= x1; x += step) GPU.pset(x, y, c);
}

/** 点線で垂直線を描く */
function dottedVLine(x, y0, y1, c, step) {
  for (let y = y0; y <= y1; y += step) GPU.pset(x, y, c);
}

/**
 * イージングカーブのグラフを描画する (アニメーション追従付き)。
 */
function drawCurveGraph(gx, gy, gw, gh, easeFn, t, easedT) {
  // 背景クリア + 枠
  GPU.fillRect(gx, gy, gw, gh, 0);
  GPU.drawRect(gx, gy, gw, gh, 1);

  const innerX = gx + 1;
  const innerY = gy + 1;
  const innerW = gw - 2;
  const innerH = gh - 2;

  // グリッド (25%, 50%, 75% ライン)
  for (let i = 1; i <= 3; i++) {
    const frac = i / 4;
    const gridX = (innerX + frac * innerW) | 0;
    const gridY = (innerY + innerH - frac * innerH) | 0;
    dottedHLine(innerX, innerX + innerW - 1, gridY, 1, 4);
    dottedVLine(gridX, innerY, innerY + innerH - 1, 1, 4);
  }

  // 対角線ガイド (linear 参照線) — 点線
  for (let i = 0; i < innerW; i += 3) {
    const py = (innerY + innerH - 1 - (i * (innerH - 1)) / (innerW - 1)) | 0;
    GPU.pset(innerX + i, py, 1);
  }

  // カーブ描画
  let prevPy = -1;
  for (let px = 0; px < innerW; px++) {
    const ct = px / (innerW - 1);
    const v = clamp01(easeFn(ct));
    const py = (innerY + innerH - 1 - v * (innerH - 1)) | 0;

    // 急峻な部分を縦線で接続
    if (prevPy >= 0 && Math.abs(py - prevPy) > 1) {
      const y0 = Math.min(py, prevPy);
      const y1 = Math.max(py, prevPy);
      GPU.vline(innerX + px, y0, y1, 1);
    }
    GPU.pset(innerX + px, py, 1);
    prevPy = py;
  }

  // ── アニメーション連動: 十字線 + トラッカードット ──
  const dotX = (innerX + t * (innerW - 1)) | 0;
  const clampedV = clamp01(easedT);
  const dotY = (innerY + innerH - 1 - clampedV * (innerH - 1)) | 0;

  // 十字線 (全幅点線、ドット周囲 6px はギャップ)
  const gap = 6;
  if (dotY - gap >= innerY) dottedVLine(dotX, innerY, dotY - gap, 1, 2);
  if (dotY + gap <= innerY + innerH - 1)
    dottedVLine(dotX, dotY + gap, innerY + innerH - 1, 1, 2);
  if (dotX - gap >= innerX) dottedHLine(innerX, dotX - gap, dotY, 1, 2);
  if (dotX + gap <= innerX + innerW - 1)
    dottedHLine(dotX + gap, innerX + innerW - 1, dotY, 1, 2);

  // トラッカードット (クリップして枠外にはみ出さない)
  GPU.pushClip(innerX, innerY, innerW, innerH);
  GPU.fillCircle(dotX, dotY, 3, 1);
  GPU.drawCircle(dotX, dotY, 4, 0);
  GPU.drawCircle(dotX, dotY, 5, 1);
  GPU.popClip();
}

/**
 * VU バー (イーズ値のリアルタイムメーター)。
 */
function drawVuBar(x, y, w, h, value) {
  GPU.drawRect(x, y, w, h, 1);
  const fillH = (clamp01(value) * (h - 2)) | 0;
  // 背景にディザグラデーション (暗→明, 下→上)
  GPU.bayerGradRect(x + 1, y + 1, w - 2, h - 2, 0.0, 0.3, "v", "4");
  if (fillH > 0) {
    GPU.fillRect(x + 1, y + 1 + (h - 2 - fillH), w - 2, fillH, 1);
  }
}

/**
 * 描画コールバック。
 */
function onDraw(contentRect) {
  GPU.fillRect(contentRect.x, contentRect.y, contentRect.w, contentRect.h, 0);

  const now = performance.now();

  // ── ウィジェット描画 ──
  widgets.draw(contentRect);

  // ── 右パネル ──
  const rpX = contentRect.x + PADDING + listBoxEasings.w + 8;
  const rpY = contentRect.y + PADDING;

  // カーブ名
  const selName = easingNames[selectedIndex];
  drawText(rpX, rpY, selName, 1);

  // ── アニメーション計算 (往復) ──
  const totalCycle = ANIM_DURATION + ANIM_PAUSE;
  const elapsed = (now - animStart) % (totalCycle * 2);
  let t;
  if (elapsed < ANIM_DURATION) {
    t = normalizeTime(elapsed, ANIM_DURATION);
  } else if (elapsed < totalCycle) {
    t = 1;
  } else if (elapsed < totalCycle + ANIM_DURATION) {
    t = 1 - normalizeTime(elapsed - totalCycle, ANIM_DURATION);
  } else {
    t = 0;
  }
  const easedT = easings[selName](t);

  // ── グラフ (トラッカー連動) ──
  const graphY = rpY + GLYPH_H + 3;
  drawCurveGraph(rpX, graphY, GRAPH_W, GRAPH_H, easings[selName], t, easedT);

  // 軸ラベル
  drawText(rpX - 1, graphY + GRAPH_H + 2, "0", 1);
  drawText(rpX + GRAPH_W - GLYPH_W, graphY + GRAPH_H + 2, "1", 1);
  drawText(rpX + GRAPH_W + 2, graphY + GRAPH_H - GLYPH_H, "0", 1);
  drawText(rpX + GRAPH_W + 2, graphY, "1", 1);
  // t 軸ラベル (数値ラベルと重ならないよう 1段下)
  drawText(
    rpX + (((GRAPH_W - GLYPH_W) / 2) | 0),
    graphY + GRAPH_H + 2 + GLYPH_H + 1,
    "t",
    1,
  );
  // v 軸インジケーター: 現在値の位置に小さな三角 ▶
  const vIndicY = (graphY + GRAPH_H - 1 - clamp01(easedT) * (GRAPH_H - 2)) | 0;
  GPU.pset(rpX + GRAPH_W + 2, vIndicY, 1);
  GPU.pset(rpX + GRAPH_W + 3, vIndicY - 1, 1);
  GPU.pset(rpX + GRAPH_W + 3, vIndicY, 1);
  GPU.pset(rpX + GRAPH_W + 3, vIndicY + 1, 1);

  // ── VU バー (グラフ右横) ──
  const vuX = rpX + GRAPH_W + GLYPH_W + 6;
  drawVuBar(vuX, graphY, VU_WIDTH, VU_HEIGHT, easedT);

  // ── ボールトラック (グラフ下: 軸ラベル + "t" ラベルの下) ──
  const trackY = graphY + GRAPH_H + 2 + GLYPH_H + 1 + GLYPH_H + 3;
  GPU.drawRect(rpX, trackY, TRACK_W, TRACK_H, 1);

  // トラック中央線 (点線)
  const trackCenterY = (trackY + TRACK_H / 2) | 0;
  dottedHLine(rpX + 1, rpX + TRACK_W - 2, trackCenterY, 1, 4);

  // ボール (塗りつぶし円)
  const ballCX =
    (rpX +
      1 +
      BALL_RADIUS +
      clamp01(easedT) * (TRACK_W - 2 - BALL_RADIUS * 2)) |
    0;
  const ballCY = trackCenterY;
  GPU.fillCircle(ballCX, ballCY, BALL_RADIUS, 1);

  // ゴーストトレイル (過去位置を小さい円で表示)
  const ghostCount = 3;
  for (let gi = 1; gi <= ghostCount; gi++) {
    const gt = Math.max(0, t - gi * 0.08);
    const gv = clamp01(easings[selName](gt));
    const gx =
      (rpX + 1 + BALL_RADIUS + gv * (TRACK_W - 2 - BALL_RADIUS * 2)) | 0;
    const gr = Math.max(1, BALL_RADIUS - gi); // 半径が 1 未満にならないよう保護
    // 離れている場合のみ描画 (重なり防止)
    if (Math.abs(gx - ballCX) > gr + 2) {
      GPU.drawCircle(gx, ballCY, gr, 1);
    }
  }

  // ── 進行度バー (入力 t) ──
  const barY = trackY + TRACK_H + 3;
  drawText(rpX, barY, "t", 1);
  const barLblW = GLYPH_W + 2;
  GPU.drawRect(rpX + barLblW, barY, TRACK_W - barLblW, 5, 1);
  const barFillW = (t * (TRACK_W - barLblW - 2)) | 0;
  if (barFillW > 0) {
    GPU.fillRect(rpX + barLblW + 1, barY + 1, barFillW, 3, 1);
  }

  // ── t/v 表示 ──
  const infoY = barY + 8;
  drawText(rpX, infoY, "t=" + t.toFixed(3), 1);
  drawText(rpX + GLYPH_W * 8, infoY, "v=" + easedT.toFixed(3), 1);
}

/**
 * 入力コールバック。
 */
function onInput(ev) {
  widgets.update(ev);
}

/**
 * ウィンドウを開く。
 */
function openWindow() {
  // ListBox
  listBoxEasings = new ListBox(
    0,
    0,
    LISTBOX_ROWS,
    easingNames,
    selectedIndex,
    (idx) => {
      selectedIndex = idx;
      animStart = performance.now();
    },
  );

  // REPLAY ボタン
  buttonReplay = new PushButton(0, 0, "REPLAY", () => {
    animStart = performance.now();
  });

  // VBox: ListBox + REPLAY ボタン (縦並び)
  easingRoot = VBox([listBoxEasings, buttonReplay]);
  easingRoot.layout(PADDING, PADDING);

  widgets = new WidgetGroup(easingRoot.leaves());

  animStart = performance.now();

  // コンテンツサイズ算出
  const leftW = listBoxEasings.w;
  const rightW = GRAPH_W + GLYPH_W + 6 + VU_WIDTH;
  const rightH =
    GLYPH_H + // カーブ名
    3 + // gap
    GRAPH_H + // グラフ
    2 + // gap
    GLYPH_H + // 軸ラベル "0"/"1"
    1 + // gap
    GLYPH_H + // "t" ラベル
    3 + // gap
    TRACK_H + // ボールトラック
    3 + // gap
    5 + // 進行度バー
    8 + // gap
    GLYPH_H; // t/v 表示
  const contentW = PADDING + leftW + 8 + rightW + PADDING;
  const contentH =
    PADDING + Math.max(listBoxEasings.h + 4 + buttonReplay.h, rightH) + PADDING;

  return wmOpen(
    -1,
    -1,
    0,
    0,
    APP_NAME,
    onDraw,
    onInput,
    () => ({
      w: contentW,
      h: contentH,
    }),
    {
      onRelayout: () => {
        widgets.remeasureAll();
        easingRoot.layout(PADDING, PADDING);
      },
    },
  );
}

// ── ウィンドウ登録 ──
wmRegister(APP_NAME, openWindow, { category: "DEMO", dev: true, shortName: "EASING" });

