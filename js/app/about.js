/**
 * @module app/about
 * about.js — ABOUT ダイアログ
 *
 * アプリケーション情報 (identity) を表示する非モーダルウィンドウ。
 * ASCII アートロゴ + テキストを単一ラベルとして左揃え描画。
 * 「いつ・何が変わったか」は WELCOME (app/welcome.js) が担う。
 */

import * as Config from "../config.js";
import { BUILD } from "../build_info.js";
import { wmOpen, wmRegister } from "../wm/index.js";
import { Label, WidgetGroup, VBox } from "../ui/index.js";

const APP_NAME = "ABOUT";

// ── 定数 ──
const ABOUT_PADDING = 12;

// ── 全テキスト (ロゴ + 情報を1つに連結、空行で余白調整) ──
const aboutText = [
  ...Config.APP_ASCII_LOGO,
  "",
  Config.APP_DESCRIPTION,
  "",
  Config.APP_CHANNEL,
  "BUILD " + BUILD.date + " (" + BUILD.hash + ")",
  "",
  "(C) " + BUILD.date.slice(0, 4) + " " + Config.APP_AUTHOR,
  "All Rights Reserved.",
  "",
  Config.APP_URL,
].join("\n");

// ── ウィジェット (遅延初期化) ──
let label;
let root;
let group;
let _ready = false;

function _initWidgets() {
  if (_ready) return;
  _ready = true;
  label = new Label(0, 0, aboutText);
  root = VBox([label]);
  group = new WidgetGroup(root, { x: ABOUT_PADDING, y: ABOUT_PADDING });
}

// ── 描画 ──
function onDraw(contentRect) {
  group.draw(contentRect);
}

// ── サイズ計測 ──
function onMeasure() {
  return root.measure(ABOUT_PADDING);
}

// ── 登録 ──
wmRegister(
  APP_NAME,
  () => {
    _initWidgets();
    return wmOpen(-1, -1, 0, 0, APP_NAME, onDraw, null, onMeasure, {
      noResize: true,
      noMaximize: true,
      center: true,
      onRelayout: () => {
        group.remeasureAll();
        root.layout(ABOUT_PADDING, ABOUT_PADDING);
      },
    });
  },
  { noIcon: true, system: true },
);

