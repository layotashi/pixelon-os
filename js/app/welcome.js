/**
 * @module app/welcome
 * welcome.js — 起動時の WELCOME ウィンドウ
 *
 * OS 起動直後に「今回のビルド情報」と「WHAT'S NEW」を短く見せる非モーダル窓。
 * ABOUT が identity (誰が・何を) を担うのに対し、WELCOME は「いつ・何が変わったか」を担う。
 *
 * 表示: PIXERA OS / チャンネル / BUILD 日付 (ハッシュ) / WHAT'S NEW / 締めの一文。
 *
 * WHAT'S NEW は build_info.js の notes (コミットの Note: トレーラーを収穫したもの) を
 * 新しい順に表示する。notes が空の初期は WELCOME_SEED (手書きの初回シード) で埋める。
 *
 * 自動表示 (maybeAutoOpenWelcome):
 *   - 初回起動 (未表示) は必ず 1 回開く。
 *   - 以降は「最新 note が前回見たものと異なる」ときだけ開く (= 語りたい変更がある時だけ)。
 *   毎ブート出さないことで「即触れる体験」を守る。いつでもランチャから手動で開ける。
 *
 * 非モーダルにする理由: 他の操作をブロックせず、かつ本物のウィンドウなので
 * ボディクリックでは閉じない (誤操作で消えない)。閉じるのは Close / Esc / メニュー。
 */

import * as Config from "../config.js";
import * as Storage from "../core/storage.js";
import { BUILD } from "../build_info.js";
import { wmOpen, wmOpenByName, wmRegister } from "../wm/index.js";
import { Label, WidgetGroup, VBox } from "../ui/index.js";

const APP_NAME = "WELCOME";
const PAD = 10;

/** WHAT'S NEW に表示する最大件数 */
const MAX_NOTES = 5;

/**
 * 初回シード (手書き・一度きり)。build_info.js は自動生成で上書きされるためここに置く。
 * notes (Note: 収穫) が溜まるまでの間だけ WHAT'S NEW を埋める。ASCII のみ。
 */
const WELCOME_SEED = [
  "A 1-BIT CREATIVE OS, IN CONTINUOUS BETA.",
  "RIGHT-CLICK THE DESKTOP TO OPEN THE LAUNCHER.",
];

/**
 * 締めの一文 (真摯・皮肉なし・1 行)。開くたびに round-robin で切り替える。
 * HUMOR_PRINCIPLES §1.7 / §3.1。ASCII のみ。
 */
const CLOSING_LINES = [
  "HAVE A GOOD SESSION.",
  "EVERY PIXEL ON PURPOSE.",
  "MAKE SOMETHING SMALL.",
  "TWO COLORS ARE ENOUGH.",
  "THE MACHINE IS READY.",
];

/** localStorage キー */
const K_SEEN = "welcomeSeen"; // 最後に見た最新 note の hash (未表示は NEVER)
const K_CLOSING = "welcomeClosingIdx"; // 締め文 round-robin インデックス
const NEVER = "__never__";

/** WHAT'S NEW の行 (notes → seed の順で最大 MAX_NOTES 件) */
function whatsNew() {
  const fromNotes = BUILD.notes.map((n) => n.text);
  return [...fromNotes, ...WELCOME_SEED].slice(0, MAX_NOTES);
}

/** 締めの一文を 1 つ返し、インデックスを進める (round-robin) */
function nextClosingLine() {
  const i = Storage.load(K_CLOSING, 0) | 0;
  Storage.save(K_CLOSING, (i + 1) % CLOSING_LINES.length);
  return CLOSING_LINES[i % CLOSING_LINES.length];
}

/** ウィンドウ本文テキストを組み立てる (開くたびに締め文が変わる) */
function buildText() {
  const lines = [
    Config.APP_NAME,
    Config.APP_CHANNEL,
    "BUILD " + BUILD.date + " (" + BUILD.hash + ")",
    "",
    "WHAT'S NEW",
    ...whatsNew().map((t) => "- " + t),
    "",
    nextClosingLine(),
  ];
  return lines.join("\n");
}

// ── ウィジェット (遅延初期化) ──
let label;
let root;
let group;
let _ready = false;

function _initWidgets() {
  if (_ready) return;
  _ready = true;
  label = new Label(0, 0, "");
  root = VBox([label]);
  group = new WidgetGroup(root, { x: PAD, y: PAD });
}

function onDraw(contentRect) {
  group.draw(contentRect);
}

function onMeasure() {
  return root.measure(PAD);
}

// ── 登録 ──
wmRegister(
  APP_NAME,
  () => {
    _initWidgets();
    label.text = buildText(); // 開くたびに最新化 (締め文の round-robin 含む)
    return wmOpen(-1, -1, 0, 0, APP_NAME, onDraw, null, onMeasure, {
      noResize: true,
      noMaximize: true,
      center: true,
      onRelayout: () => {
        group.remeasureAll();
        root.layout(PAD, PAD);
      },
    });
  },
  { noIcon: true },
);

/**
 * 起動時に WELCOME を自動表示すべきなら開く。kernel.js が boot 完了時に 1 回だけ呼ぶ。
 * 初回起動は必ず、以降は最新 note が更新されたときのみ開く。
 */
export function maybeAutoOpenWelcome() {
  const newest = BUILD.notes.length > 0 ? BUILD.notes[0].hash : null;
  const seen = Storage.load(K_SEEN, NEVER);
  let open = false;
  if (seen === NEVER) {
    open = true; // 初回起動 → 必ず挨拶
  } else if (newest && newest !== seen) {
    open = true; // 新しい Note: がある
  }
  if (open) {
    wmOpenByName(APP_NAME);
    Storage.save(K_SEEN, newest || "seed");
  }
}
