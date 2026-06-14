/**
 * @module app/about
 * about.js — ABOUT ダイアログ
 *
 * アプリケーション情報を表示するモーダルウィンドウ。
 * ASCII アートロゴ + テキストを単一ラベルとして左揃え描画。
 */

import * as Config from "../config.js";
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
  "Version " + Config.APP_VERSION,
  Config.APP_DATE,
  "",
  "(C) " + Config.APP_DATE.slice(0, 4) + " " + Config.APP_AUTHOR,
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
  root.layout(ABOUT_PADDING, ABOUT_PADDING);
  group = new WidgetGroup(root.leaves());
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
      modal: true,
      noResize: true,
      noMaximize: true,
      center: true,
      onRelayout: () => {
        group.remeasureAll();
        root.layout(ABOUT_PADDING, ABOUT_PADDING);
      },
    });
  },
  { modal: true },
);

