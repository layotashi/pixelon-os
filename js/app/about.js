/**
 * @module app/about
 * about.js — ABOUT ダイアログ
 *
 * アプリケーション情報 (identity) を表示する非モーダルウィンドウ。
 * ロゴ → 説明 → ビルド → AUTHOR + 関連リンク (Link) → 著作権 を左揃えで縦に並べる。
 * 著作権は末尾。「いつ・何が変わったか」は WELCOME (app/welcome.js) が担う。
 */

import * as Config from "../config.js";
import { BUILD } from "../build_info.js";
import { openUrl } from "../core/browser.js";
import { wmOpen, wmRegister } from "../wm/index.js";
import { Label, WidgetGroup, VBox, Link } from "../ui/index.js";

const APP_NAME = "ABOUT";

// ── 定数 ──
// 余白は WELCOME と揃える (少しコンパクトに)。
const ABOUT_PADDING = 8;

// ── 上段テキスト (ロゴ → 説明 → ビルド → AUTHOR 見出し) ──
const headText = [
  ...Config.APP_ASCII_LOGO,
  "",
  Config.APP_DESCRIPTION,
  "",
  Config.buildStampLine(),
  "",
  "AUTHOR",
].join("\n");

// ── 下段テキスト (著作権を末尾に。先頭の空行でリンク群と分離する) ──
const footText = [
  "",
  "(C) " +
    Config.APP_YEAR_START +
    "-" +
    BUILD.date.slice(0, 4) +
    " " +
    Config.APP_AUTHOR +
    " ALL RIGHTS RESERVED.",
].join("\n");

// ── ウィジェット (遅延初期化) ──
let root;
let group;
let _ready = false;

function _initWidgets() {
  if (_ready) return;
  _ready = true;
  // 上段ラベル → 関連リンク (下線付き・別タブで開く) → 著作権ラベル の順に縦積み。
  const head = new Label(0, 0, headText);
  const links = Config.APP_LINKS.map(
    (l) => new Link(0, 0, l.text, () => openUrl(l.url)),
  );
  const foot = new Label(0, 0, footText);
  root = VBox([head, ...links, foot]);
  group = new WidgetGroup(root, { x: ABOUT_PADDING, y: ABOUT_PADDING });
}

// ── 描画 ──
function onDraw(contentRect) {
  group.draw(contentRect);
}

// ── 入力 (リンクの hover / click を WidgetGroup へ) ──
function onInput(ev) {
  group.update(ev);
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
    return wmOpen(-1, -1, 0, 0, APP_NAME, onDraw, onInput, onMeasure, {
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

