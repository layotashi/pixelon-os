/**
 * @module core/input
 * input.js — キーボード・マウス入力管理
 *
 * ── 概要 ──
 * キーの押下状態 (held) と、そのフレームで新たに押された状態 (down) を追跡する。
 * マウスは仮想画面座標での位置・ボタン状態・ホイール値を管理する。
 * フレーム末に resetInput() を呼んで 1 フレーム限りの状態をクリアする。
 *
 * ── セマンティックイベントログ ──
 * 生のハードウェア状態に加え、意味のあるイベント (ダブルクリック・ドラッグ開始/終了・
 * 修飾付きキーコンボ) をフレーム単位で解釈し、inputLog に記録する。
 * 上位モジュール (wm.js, input_overlay.js) はこのログを参照して判定を行う。
 *
 * イベントログの生成は updateInputLog() で行う。kernel.js のメインループ先頭
 * (wmUpdate の前) で毎フレーム呼ぶ。
 *
 * ── キーラベル生成 ──
 * DOM KeyboardEvent の e.ctrlKey / e.shiftKey / e.altKey と e.key / e.code から
 * ラベル文字列を構築する。印字可能記号は e.key をそのまま使用 (例: ! @ :)。
 * 英字は SHIFT+A 形式を維持。
 *
 * ── ブラウザショートカット抑止 ──
 * Ctrl+key / Alt+key のブラウザデフォルト動作を一元的に preventDefault で抑止する。
 * F5 (リロード)、F12 / Ctrl+Shift+I/J (DevTools) は常に通過させる。
 *
 * ── マウスボタン番号 ──
 *   0 = 左ボタン
 *   1 = 中ボタン (ホイールクリック)
 *   2 = 右ボタン
 *
 * ── ドラッグ判定 ──
 *   mousedown 時の座標を記録し、held 中に DRAG_DEAD_ZONE (3px) 以上移動したら
 *   ドラッグ開始と判定する。wm.js のウィンドウ移動 (MOVE_DEAD_ZONE) とは独立。
 *
 * ── ダブルクリック判定 ──
 *   同一ボタンの連続クリック間隔が DOUBLE_CLICK_MS (400ms) 以内ならダブルクリック。
 *   ボタンごとに独立して追跡する。
 */

import { VRAM_WIDTH, VRAM_HEIGHT, getScale } from "../config.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  キーボード
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 現在押されているキー */
const keyState = new Map();

/** そのフレームで新たに押されたキー（1フレームだけ true） */
const keyPressed = new Map();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  マウス
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** マウスの仮想画面座標 X (描画領域外の場合は -1) */
let mouseVirtualX = -1;

/** マウスの仮想画面座標 Y (描画領域外の場合は -1) */
let mouseVirtualY = -1;

/** マウスが描画領域内にいるか */
let mouseInside = false;

/** ボタンごとの押下状態 (held)  btn[0]=左, btn[1]=中, btn[2]=右 */
const mouseButtonState = [false, false, false];

/** そのフレームで新たに押されたボタン (down) */
const mouseButtonPressed = [false, false, false];

/** そのフレームで離されたボタン (up) */
const mouseButtonReleased = [false, false, false];

/** ホイールの累積デルタ (X)  — 正=右, 負=左 */
let wheelDX = 0;

/** ホイールの累積デルタ (Y)  — 正=下(奥), 負=上(手前) */
let wheelDY = 0;

/** ホイール操作時のモディファイア状態 */
let wheelCtrl = false;
let wheelAlt = false;
let wheelShift = false;

/** マウスボタン操作時のモディファイア状態 */
let mouseCtrl = false;
let mouseShift = false;

/** Ctrl+キー の1フレーム押下フラグ (ブラウザショートカットを奪う)。値は { shift: boolean } */
const ctrlKeyPressed = new Map();

/** Alt+キー の1フレーム押下フラグ */
const altKeyPressed = new Map();

/** Ctrl+キー のインターセプト対象キーコード */
const CTRL_INTERCEPT = new Set([
  "KeyA",
  "KeyC",
  "KeyV",
  "KeyD",
  "KeyE",
  "KeyX",
  "KeyZ",
  "KeyY",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyN",
  "KeyO",
  "KeyP",
  "KeyR",
  "KeyS",
  "KeyW",
  "F6",
]);

/** Ctrl 押下中でも keyState/keyPressed に登録するキー (ナビゲーション/編集系) */
const CTRL_PASSTHROUGH = new Set([
  "ControlLeft",
  "ControlRight",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Backspace",
  "Delete",
  "Home",
  "End",
]);

/** テキスト入力用の文字キュー (1フレーム分) */
let charQueue = [];

/** クリップボードからペーストされたテキスト (1フレーム分) */
let pasteText = null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  セマンティックイベントログ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @typedef {Object} InputEvent
 * @property {string} type   イベント種別
 *   キーボード: "key-down" | "key-up" | "key-held"
 *   マウス:     "click" | "dblclick" | "drag-start" | "drag" | "drag-end" | "btn-up"
 *   ホイール:   "wheel"
 * @property {string} label  表示用ラベル (例: "CTRL+Z", "L-CLICK", "WHEEL UP")
 * @property {string} [code] キーボードイベント時のキーコード
 * @property {number} [btn]  マウスイベント時のボタン番号 (0/1/2)
 * @property {number} [deltaX] ホイール X デルタ
 * @property {number} [deltaY] ホイール Y デルタ
 */

/** そのフレームのセマンティックイベントログ */
let inputLog = [];

/** ダブルクリック判定閾値 (ms) */
const DOUBLE_CLICK_MS = 400;

/** ドラッグ判定のデッドゾーン (px) */
const DRAG_DEAD_ZONE = 3;

/** ボタンごとの前回クリック時刻 (ダブルクリック判定用) */
const lastClickTime = [0, 0, 0];

/**
 * ドラッグ状態:
 *   "none"    — ボタン非押下
 *   "pending" — ボタン押下中、まだデッドゾーン内
 *   "dragging" — デッドゾーンを超えた = ドラッグ中
 */
const dragState = ["none", "none", "none"];

/** ドラッグ開始座標 (mousedown 時点の仮想座標) */
const dragStartX = [0, 0, 0];
const dragStartY = [0, 0, 0];

// ── キーボードイベントログ用の内部バッファ ──
// DOM keydown/keyup は非同期に発火するため、バッファに蓄積して
// updateInputLog() でフレームログに転送する。

/** @type {InputEvent[]} — keydown で蓄積、updateInputLog で消費 */
let keyEventBuffer = [];

/** 現在押下中のキー: code → ラベル文字列 (keyup 時にラベルを特定するため) */
const heldKeyLabels = new Map();

// ── キーラベル生成 ──

/** 修飾キーのキーコード */
const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/** キーコードから表示用の短縮名を返す */
function keyLabel(code) {
  const MAP = {
    Space: "SPACE",
    Enter: "ENTER",
    Backspace: "BKSP",
    Delete: "DEL",
    Tab: "TAB",
    Escape: "ESC",
    ShiftLeft: "SHIFT",
    ShiftRight: "SHIFT",
    ControlLeft: "CTRL",
    ControlRight: "CTRL",
    AltLeft: "ALT",
    AltRight: "ALT",
    MetaLeft: "META",
    MetaRight: "META",
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    Home: "HOME",
    End: "END",
    PageUp: "PGUP",
    PageDown: "PGDN",
    CapsLock: "CAPS",
    NumLock: "NUM",
    ScrollLock: "SCRL",
    Insert: "INS",
    ContextMenu: "MENU",
    F1: "F1",
    F2: "F2",
    F3: "F3",
    F4: "F4",
    F5: "F5",
    F6: "F6",
    F7: "F7",
    F8: "F8",
    F9: "F9",
    F10: "F10",
    F11: "F11",
    F12: "F12",
  };
  if (MAP[code]) return MAP[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) {
    const rest = code.slice(6);
    const NMAP = {
      Add: "+",
      Subtract: "-",
      Multiply: "*",
      Divide: "/",
      Decimal: ".",
      Enter: "ENTER",
    };
    return "NUM" + (NMAP[rest] || rest);
  }
  const SYM = {
    Semicolon: ";",
    Equal: "=",
    Comma: ",",
    Minus: "-",
    Period: ".",
    Slash: "/",
    Backquote: "`",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Quote: "'",
  };
  if (SYM[code]) return SYM[code];
  return code;
}

/**
 * DOM KeyboardEvent からラベル文字列を構築する。
 * 印字可能記号は e.key をそのまま使用 (! @ : 等)。
 * 英字は SHIFT+A 形式を維持。
 */
function buildKeyLabel(e) {
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    const ch = e.key.toUpperCase();
    const isLetter = /^[A-Z]$/.test(ch);
    let prefix = "";
    if (e.altKey) prefix += "ALT+";
    if (e.shiftKey && isLetter) prefix += "SHIFT+";
    return prefix + ch;
  }
  let prefix = "";
  if (e.ctrlKey || e.metaKey) prefix += "CTRL+";
  if (e.altKey) prefix += "ALT+";
  if (e.shiftKey) prefix += "SHIFT+";
  return prefix + keyLabel(e.code);
}

// ── マウスラベル生成 ──

const CLICK_LABELS = ["L-CLICK", "M-CLICK", "R-CLICK"];
const DRAG_LABELS = ["L-DRAG", "M-DRAG", "R-DRAG"];

/** マウスイベント用の修飾キープレフィクスを構築する */
function mouseModLabel() {
  let s = "";
  if (mouseCtrl) s += "CTRL+";
  if (mouseShift) s += "SHIFT+";
  return s;
}

/** ホイールイベント用の修飾キープレフィクスを構築する */
function wheelModLabel() {
  let s = "";
  if (wheelCtrl) s += "CTRL+";
  if (wheelShift) s += "SHIFT+";
  if (wheelAlt) s += "ALT+";
  return s;
}

// ── ブラウザショートカット抑止 ──

/** ブラウザに通すべきキーコード (リロード・DevTools 等) */
const BROWSER_PASSTHROUGH_KEYS = new Set(["F5", "F12"]);

/** ブラウザに通すべき Ctrl+Shift コンボ (DevTools) */
const BROWSER_PASSTHROUGH_CTRL_SHIFT = new Set(["KeyI", "KeyJ"]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  初期化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 入力システムを初期化する。イベントリスナを登録する。
 * kernel.js から起動時に 1 回だけ呼ぶ。
 */
export function initInput() {
  // ── キーボード ──
  window.addEventListener("keydown", (e) => {
    const code = e.code;

    // ── ブラウザショートカット抑止 (一元管理) ──
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+key: BROWSER_PASSTHROUGH_KEYS / BROWSER_PASSTHROUGH_CTRL_SHIFT 以外は全て奪う
      if (
        !BROWSER_PASSTHROUGH_KEYS.has(code) &&
        !(e.shiftKey && BROWSER_PASSTHROUGH_CTRL_SHIFT.has(code))
      ) {
        // KeyV は paste イベントを発火させるため preventDefault しない
        if (code !== "KeyV") e.preventDefault();
      }

      // 既存の ctrlKeyPressed (アプリ側の Ctrl+key ポーリング用)
      if (CTRL_INTERCEPT.has(code)) {
        ctrlKeyPressed.set(code, { shift: e.shiftKey });
      }
      // ナビゲーション/編集キーは Ctrl 押下中でも通常通り登録する
      if (CTRL_PASSTHROUGH.has(code)) {
        if (!keyState.get(code)) keyPressed.set(code, true);
        keyState.set(code, true);
      }
    } else if (e.altKey) {
      // Alt+key: ブラウザメニュー起動を抑止し、Alt ショートカットとして記録する。
      // 旧実装は ALT_INTERCEPT ホワイトリスト方式で、登録漏れのキー (Alt+W 等) が
      // 無反応になる脆さがあった。修飾キー以外の全 Alt+key を横取り＝記録して、
      // アプリが追加する Alt ショートカットが保守不要で必ず効くようにする。
      e.preventDefault();
      if (!MODIFIER_CODES.has(code)) {
        altKeyPressed.set(code, { shift: e.shiftKey });
      }
    } else {
      // 通常キー: F5/F12 等は通す
      if (BROWSER_PASSTHROUGH_KEYS.has(code)) {
        // ファンクションキーはブラウザに通す (keyState にも登録しない)
        // → セマンティックログには記録する (下で処理)
      } else {
        e.preventDefault();
      }
    }

    // ── keyState / keyPressed 更新 ──
    const isAltIntercepted = e.altKey && !MODIFIER_CODES.has(code);
    if (!(e.ctrlKey || e.metaKey) || CTRL_PASSTHROUGH.has(code)) {
      // Ctrl 押下中は PASSTHROUGH 以外は keyState に入れない (既存挙動)
      // Alt+インターセプト対象も keyState に入れない (アプリ側で altDown で処理)
      if (
        !isAltIntercepted &&
        (!BROWSER_PASSTHROUGH_KEYS.has(code) ||
        !(e.key.startsWith("F") && e.key.length > 1))
      ) {
        if (!keyState.get(code)) keyPressed.set(code, true);
        keyState.set(code, true);
      }
    }

    // ── 印字可能文字キュー (既存挙動維持) ──
    if (!(e.ctrlKey || e.metaKey) && !isAltIntercepted && e.key.length === 1) {
      charQueue.push(e.key);
    }

    // ── セマンティックイベントログ: キーバッファに蓄積 ──
    if (!MODIFIER_CODES.has(code)) {
      const label = buildKeyLabel(e);

      if (heldKeyLabels.has(code)) {
        // リピート or 修飾変化: ラベルが変わったら古いものを解放
        const oldLabel = heldKeyLabels.get(code);
        if (oldLabel !== label) {
          keyEventBuffer.push({ type: "key-up", label: oldLabel, code });
        }
        heldKeyLabels.set(code, label);
        keyEventBuffer.push({ type: "key-held", label, code });
      } else {
        heldKeyLabels.set(code, label);
        keyEventBuffer.push({ type: "key-down", label, code });
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    const code = e.code;
    // keyState は常にクリア (Ctrl 押下中にキーを離しても stuck しないように)
    keyState.set(code, false);

    // セマンティックログ: key-up をバッファに追加
    if (!MODIFIER_CODES.has(code)) {
      const label = heldKeyLabels.get(code);
      if (label) {
        keyEventBuffer.push({ type: "key-up", label, code });
        heldKeyLabels.delete(code);
      }
    }
  });

  // ペーストイベント: Ctrl+V のクリップボードテキストをキャプチャ
  window.addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (text) pasteText = text;
    e.preventDefault();
  });

  // ── マウス ──
  const canvas = document.getElementById("screen");

  // canvas 上でホストカーソルを非表示にする
  canvas.style.cursor = "none";

  // 右クリックのブラウザコンテキストメニューを抑止
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const s = getScale();
    mouseVirtualX = ((e.clientX - rect.left) / s) | 0;
    mouseVirtualY = ((e.clientY - rect.top) / s) | 0;
  });

  canvas.addEventListener("mouseenter", () => {
    mouseInside = true;
  });

  canvas.addEventListener("mouseleave", () => {
    mouseInside = false;
    mouseVirtualX = -1;
    mouseVirtualY = -1;
  });

  canvas.addEventListener("mousedown", (e) => {
    const b = e.button; // 0=左, 1=中, 2=右
    if (b >= 0 && b <= 2) {
      if (!mouseButtonState[b]) mouseButtonPressed[b] = true;
      mouseButtonState[b] = true;
    }
    mouseCtrl = e.ctrlKey || e.metaKey;
    mouseShift = e.shiftKey;
    e.preventDefault();
  });

  canvas.addEventListener("mouseup", (e) => {
    const b = e.button;
    if (b >= 0 && b <= 2) {
      if (mouseButtonState[b]) mouseButtonReleased[b] = true;
      mouseButtonState[b] = false;
    }
    e.preventDefault();
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      // モディファイア状態を記録
      wheelCtrl = e.ctrlKey;
      wheelAlt = e.altKey;
      wheelShift = e.shiftKey;

      // Shift+ホイール → 水平スクロール (Ableton Live準拠)
      if (e.shiftKey && !e.ctrlKey && !e.altKey) {
        wheelDX += e.deltaY || e.deltaX;
      } else {
        wheelDX += e.deltaX;
        wheelDY += e.deltaY;
      }
      e.preventDefault();
    },
    { passive: false },
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  セマンティックイベントログ更新
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 毎フレーム呼ぶ。DOM イベントバッファとポーリング状態から
 * セマンティックイベントログ (inputLog) を構築する。
 *
 * kernel.js の mainLoop 先頭 (wmUpdate の前) で呼ぶこと。
 */
export function updateInputLog() {
  inputLog = [];

  // ── キーボードイベント: バッファ→ログに転送 ──
  for (const ev of keyEventBuffer) {
    inputLog.push(ev);
  }
  keyEventBuffer = [];

  // ── マウスボタンイベント ──
  for (let b = 0; b <= 2; b++) {
    if (mouseButtonPressed[b]) {
      // ── ダブルクリック判定 ──
      const now = performance.now();
      const mod = mouseModLabel();

      if (now - lastClickTime[b] < DOUBLE_CLICK_MS) {
        // ダブルクリック成立
        inputLog.push({ type: "dblclick", label: mod + "DBL-CLICK", btn: b });
        lastClickTime[b] = 0;
      } else {
        // シングルクリック (暫定: ドラッグ判定次第で click or drag-start に確定)
        inputLog.push({ type: "click", label: mod + CLICK_LABELS[b], btn: b });
        lastClickTime[b] = now;
      }

      // ── ドラッグ pending 開始 ──
      dragState[b] = "pending";
      dragStartX[b] = mouseVirtualX;
      dragStartY[b] = mouseVirtualY;
    }

    // ── ドラッグ判定 (pending → dragging) ──
    if (
      dragState[b] === "pending" &&
      mouseButtonState[b] &&
      !mouseButtonPressed[b]
    ) {
      const dx = mouseVirtualX - dragStartX[b];
      const dy = mouseVirtualY - dragStartY[b];
      if (dx * dx + dy * dy >= DRAG_DEAD_ZONE * DRAG_DEAD_ZONE) {
        dragState[b] = "dragging";
        const mod = mouseModLabel();
        inputLog.push({
          type: "drag-start",
          label: mod + DRAG_LABELS[b],
          btn: b,
        });
      }
    }

    // ── ドラッグ継続中 ──
    if (dragState[b] === "dragging" && mouseButtonState[b]) {
      const mod = mouseModLabel();
      inputLog.push({ type: "drag", label: mod + DRAG_LABELS[b], btn: b });
    }

    // ── ボタンリリース ──
    if (mouseButtonReleased[b]) {
      if (dragState[b] === "dragging") {
        const mod = mouseModLabel();
        inputLog.push({
          type: "drag-end",
          label: mod + DRAG_LABELS[b],
          btn: b,
        });
      } else {
        const mod = mouseModLabel();
        inputLog.push({ type: "btn-up", label: mod + CLICK_LABELS[b], btn: b });
      }
      dragState[b] = "none";
    }
  }

  // ── ホイール ──
  if (wheelDY !== 0 || wheelDX !== 0) {
    const mod = wheelModLabel();
    if (wheelDY !== 0) {
      const dir = wheelDY < 0 ? "WHEEL UP" : "WHEEL DN";
      inputLog.push({
        type: "wheel",
        label: mod + dir,
        deltaX: wheelDX,
        deltaY: wheelDY,
      });
    } else {
      const dir = wheelDX > 0 ? "WHEEL R" : "WHEEL L";
      inputLog.push({
        type: "wheel",
        label: mod + dir,
        deltaX: wheelDX,
        deltaY: wheelDY,
      });
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  キーボード クエリ API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** キーが押されている間 true */
export function keyHeld(code) {
  return !!keyState.get(code);
}

/** キーが押された瞬間だけ true (1フレーム) */
export function keyDown(code) {
  return !!keyPressed.get(code);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  マウス クエリ API — 座標
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** マウスの仮想画面 X 座標 (領域外なら -1) */
export function mouseX() {
  return mouseVirtualX;
}

/** マウスの仮想画面 Y 座標 (領域外なら -1) */
export function mouseY() {
  return mouseVirtualY;
}

/** マウスが描画領域内にいるか */
export function isMouseInside() {
  return mouseInside;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  マウス クエリ API — ボタン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * マウスボタンが押されている間 true
 * @param {number} btn  0=左, 1=中, 2=右
 */
export function mouseButtonHeld(btn) {
  return !!mouseButtonState[btn];
}

/**
 * マウスボタンが押された瞬間だけ true (1フレーム)
 * @param {number} btn  0=左, 1=中, 2=右
 */
export function mouseButtonDown(btn) {
  return !!mouseButtonPressed[btn];
}

/**
 * マウスボタンが離された瞬間だけ true (1フレーム)
 * @param {number} btn  0=左, 1=中, 2=右
 */
export function mouseButtonUp(btn) {
  return !!mouseButtonReleased[btn];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  マウス クエリ API — ホイール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ホイール X デルタ (正=右, 負=左)。フレーム間の累積値。 */
export function wheelX() {
  return wheelDX;
}

/** ホイール Y デルタ (正=下/奥, 負=上/手前)。フレーム間の累積値。 */
export function wheelY() {
  return wheelDY;
}

/** ホイール操作時に Ctrl が押されていたか */
export function wheelHasCtrl() {
  return wheelCtrl;
}

/** ホイール操作時に Alt が押されていたか */
export function wheelHasAlt() {
  return wheelAlt;
}

/** ホイール操作時に Shift が押されていたか */
export function wheelHasShift() {
  return wheelShift;
}

/** マウスダウン時に Ctrl (Mac: Cmd) が押されていたか */
export function mouseHasCtrl() {
  return mouseCtrl;
}

/** マウスダウン時に Shift が押されていたか */
export function mouseHasShift() {
  return mouseShift;
}

/** Ctrl+キー (かつ Shift なし) が押された瞬間だけ true (1フレーム) */
export function ctrlDown(code) {
  const entry = ctrlKeyPressed.get(code);
  return !!entry && !entry.shift;
}

/** Ctrl+Shift+キー が押された瞬間だけ true (1フレーム) */
export function ctrlShiftDown(code) {
  const entry = ctrlKeyPressed.get(code);
  return !!entry && entry.shift;
}

/** Alt+キー (かつ Shift なし) が押された瞬間だけ true (1フレーム) */
export function altDown(code) {
  const entry = altKeyPressed.get(code);
  return !!entry && !entry.shift;
}

/** Shift+Alt+キー が押された瞬間だけ true (1フレーム) */
export function altShiftDown(code) {
  const entry = altKeyPressed.get(code);
  return !!entry && !!entry.shift;
}

/** そのフレームに入力された文字の配列を返す (消費はしない。resetInput で消える) */
export function getCharQueue() {
  return charQueue;
}

/** ペーストされたテキストを取得する (1フレーム限り。なければ null) */
export function getPasteText() {
  return pasteText;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  セマンティックイベントログ クエリ API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * そのフレームのセマンティックイベントログを返す。
 * @returns {InputEvent[]}
 */
export function getInputLog() {
  return inputLog;
}

/**
 * 指定ボタンでドラッグ中か。
 * @param {number} btn  0=左, 1=中, 2=右
 * @returns {boolean}
 */
export function isDragging(btn) {
  return dragState[btn] === "dragging";
}

/**
 * 指定ボタンのドラッグ開始座標を返す (ドラッグ中でなければ null)。
 * @param {number} btn  0=左, 1=中, 2=右
 * @returns {{x: number, y: number} | null}
 */
export function getDragStart(btn) {
  if (dragState[btn] !== "dragging") return null;
  return { x: dragStartX[btn], y: dragStartY[btn] };
}

/**
 * そのフレームのログに指定タイプ・ボタンのイベントがあるか。
 * @param {string} type   イベント種別
 * @param {number} [btn]  マウスボタン番号 (省略可)
 * @returns {boolean}
 */
export function hasInputEvent(type, btn) {
  for (const ev of inputLog) {
    if (ev.type === type && (btn === undefined || ev.btn === btn)) return true;
  }
  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  フレーム末処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 1フレーム限りの入力フラグをリセットする。mainLoop 末尾で呼ぶ。 */
export function resetInput() {
  // キーボード
  keyPressed.clear();

  // マウスボタン (down/up)
  mouseButtonPressed[0] = mouseButtonPressed[1] = mouseButtonPressed[2] = false;
  mouseButtonReleased[0] =
    mouseButtonReleased[1] =
    mouseButtonReleased[2] =
      false;

  // ホイールデルタ・モディファイア
  wheelDX = 0;
  wheelDY = 0;
  wheelCtrl = false;
  wheelAlt = false;
  wheelShift = false;

  // Ctrl+キー / Alt+キー
  ctrlKeyPressed.clear();
  altKeyPressed.clear();

  // 文字キュー
  charQueue = [];

  // ペースト
  pasteText = null;

  // セマンティックイベントログ
  inputLog = [];
}

