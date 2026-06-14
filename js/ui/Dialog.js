/**
 * @module ui/Dialog
 * Dialog.js — 汎用ダイアログ API
 *
 * モーダルダイアログの生成・表示・破棄を統一的に行う。
 * 確認 (Confirm)・プロンプト (Prompt)・警告 (Alert) の 3 種を提供する。
 *
 * ── variant ──
 *   "default"  — 通常のダイアログ
 *   "danger"   — 破壊的操作の確認。タイトルに "! " プレフィクス、
 *                OK ボタンが反転 (pressed) 状態で描画される。
 *
 * ── SFX フック ──
 *   opts.onOpen(variant)  — ダイアログ表示時に呼ばれるコールバック。
 *   Phase 6 (システム SFX) でシステム側から注入して使用する。
 *
 * ── 使用例 ──
 *   openConfirmDialog("DISCARD CHANGES?", {
 *     onOk:     () => { doDiscard(); },
 *     variant:  "danger",
 *   });
 *
 *   openPromptDialog("NAME:", {
 *     defaultValue: "untitled.txt",
 *     onResult:     (value) => { if (value !== null) rename(value); },
 *   });
 *
 *   openAlertDialog("EXPORT COMPLETE.", {
 *     title: "INFO",
 *   });
 */

import { wmOpen, wmClose } from "../wm/index.js";
import { PushButton } from "./widgets/PushButton.js";
import { TextBox } from "./widgets/TextBox.js";
import { Label } from "./widgets/Label.js";
import { WidgetGroup } from "./WidgetGroup.js";
import { HBox, VBox } from "./layout.js";
import { FOCUS_MARGIN } from "./ui_constants.js";
import { textWidth, setFocused } from "./ui_helpers.js";
import { keyDown } from "./ports.js";

// ── 定数 ──

/** ダイアログ内部のセクション間隔 (px) */
const DLG_GAP = 6;

// ── グローバルダイアログ SFX コールバック ──

/** @type {((variant: string) => void)|null} */
let _globalSfxOnOpen = null;

/**
 * ダイアログ表示時のグローバル SFX コールバックを設定する。
 * Phase 6 (システム SFX) でシステム側から呼ばれる。
 * @param {(variant: string) => void} fn
 */
export function dialogSetSfxOnOpen(fn) {
  _globalSfxOnOpen = fn;
}

// ── 二重起動防止 ──

/** @type {number|null} 現在開いているダイアログの WM ID */
let _dialogWinId = null;

/**
 * ダイアログが現在開いているかを返す。
 * @returns {boolean}
 */
export function isDialogOpen() {
  return _dialogWinId !== null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  内部共通ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ダイアログを閉じる。
 */
function _closeDialog() {
  if (_dialogWinId !== null) {
    wmClose(_dialogWinId);
    _dialogWinId = null;
  }
}

/**
 * ダイアログウィンドウを開く共通処理。
 * @param {string} title
 * @param {object} root        VBox/HBox レイアウトルート
 * @param {WidgetGroup} group  ウィジェットグループ
 * @param {object} opts
 * @param {string} opts.variant
 * @param {function} [opts.onEnter]   Enter 押下時のコールバック
 * @param {function} [opts.onEscape]  Escape 押下時のコールバック
 * @param {function} [opts.onOpen]    表示時の SFX コールバック
 */
function _openDialogWindow(title, root, group, opts) {
  if (_dialogWinId !== null) return; // 二重起動防止

  const variant = opts.variant || "default";

  // variant に応じたタイトル
  const displayTitle = variant === "danger" ? "! " + title : title;

  function onDraw(contentRect) {
    group.draw(contentRect);
  }

  function onInput(ev) {
    group.update(ev);
    if (opts.onEnter && keyDown("Enter")) {
      opts.onEnter();
    }
    if (opts.onEscape && keyDown("Escape")) {
      opts.onEscape();
    }
  }

  function onMeasure() {
    return root.measure();
  }

  _dialogWinId = wmOpen(
    -1,
    -1,
    0,
    0,
    displayTitle,
    onDraw,
    onInput,
    onMeasure,
    {
      modal: true,
      noResize: true,
      noMaximize: true,
      center: true,
      onBeforeClose: () => {
        // × ボタンで閉じた場合もキャンセル扱い
        _dialogWinId = null;
        if (opts.onEscape) opts.onEscape();
        return true;
      },
    },
  );

  // SFX フック
  if (opts.onOpen) opts.onOpen(variant);
  if (_globalSfxOnOpen) _globalSfxOnOpen(variant);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  openConfirmDialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 確認ダイアログを開く。OK / CANCEL ボタン。
 *
 * @param {string} message     表示メッセージ ("\n" で改行可)
 * @param {object} [opts]
 * @param {string}   [opts.title="CONFIRM"]      タイトル
 * @param {string}   [opts.variant="default"]     "default" | "danger"
 * @param {string}   [opts.okLabel="OK"]          OK ボタンラベル
 * @param {string}   [opts.cancelLabel="CANCEL"]  CANCEL ボタンラベル
 * @param {function} [opts.onOk]                  OK コールバック
 * @param {function} [opts.onCancel]              Cancel コールバック
 * @param {function} [opts.onClose]               Escape/×ボタン時のコールバック (指定時は onCancel の代わりに呼ばれる)
 * @param {function} [opts.onOpen]                表示後 SFX コールバック
 */
export function openConfirmDialog(message, opts = {}) {
  if (_dialogWinId !== null) return;

  const title = opts.title || "CONFIRM";
  const variant = opts.variant || "default";
  const okLabel = opts.okLabel || "OK";
  const cancelLabel = opts.cancelLabel || "CANCEL";
  const onOk = opts.onOk || (() => { });
  const onCancel = opts.onCancel || (() => { });

  // ── ウィジェット生成 ──
  const lblMessage = new Label(0, 0, message);

  const btnOk = new PushButton(0, 0, okLabel, () => {
    _closeDialog();
    onOk();
  });
  const btnCancel = new PushButton(0, 0, cancelLabel, () => {
    _closeDialog();
    onCancel();
  });

  // danger バリアント: OK ボタンを反転表示
  if (variant === "danger") {
    btnOk.value = true;
  }

  // ── レイアウト ──
  const btnRow = HBox([btnCancel, btnOk]);
  const root = VBox([lblMessage, btnRow], DLG_GAP);
  root.layout(FOCUS_MARGIN, FOCUS_MARGIN);

  // ボタン行を右揃え
  const rootSize = root.measure();
  if (btnRow.w < lblMessage.w) {
    const offset = lblMessage.w - btnRow.w;
    for (const child of btnRow.children) {
      child.x += offset;
    }
  }

  const group = new WidgetGroup(root.leaves());

  // ── ダイアログを開く ──
  _openDialogWindow(title, root, group, {
    variant,
    onEnter: () => {
      _closeDialog();
      onOk();
    },
    onEscape: () => {
      _closeDialog();
      if (opts.onClose) opts.onClose();
      else onCancel();
    },
    onOpen: opts.onOpen,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  openPromptDialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プロンプトダイアログを開く。テキスト入力 + OK / CANCEL。
 *
 * @param {string} label       入力フィールドのラベル (例: "NAME:")
 * @param {object} [opts]
 * @param {string}   [opts.title="INPUT"]         タイトル
 * @param {string}   [opts.variant="default"]     "default" | "danger"
 * @param {string}   [opts.defaultValue=""]       初期値
 * @param {number}   [opts.maxLength=128]         最大文字数
 * @param {number}   [opts.widthChars=24]         テキストボックスの表示幅 (文字数)
 * @param {boolean}  [opts.selectAll=false]       初期値を全選択状態にする
 * @param {boolean}  [opts.selectBaseName=false]  拡張子を除くベース名のみ選択
 * @param {string}   [opts.okLabel="OK"]          OK ボタンラベル
 * @param {string}   [opts.cancelLabel="CANCEL"]  CANCEL ボタンラベル
 * @param {(value: string|null) => void} [opts.onResult]  結果コールバック (Cancel 時は null)
 * @param {function} [opts.onOpen]                表示後 SFX コールバック
 */
export function openPromptDialog(label, opts = {}) {
  if (_dialogWinId !== null) return;

  const title = opts.title || "INPUT";
  const variant = opts.variant || "default";
  const defaultValue = opts.defaultValue || "";
  const maxLength = opts.maxLength || 128;
  const widthChars = opts.widthChars || 24;
  const okLabel = opts.okLabel || "OK";
  const cancelLabel = opts.cancelLabel || "CANCEL";
  const onResult = opts.onResult || (() => { });

  let confirmed = false;

  // ── ウィジェット生成 ──
  const lblLabel = new Label(0, 0, label);
  const txtInput = new TextBox(0, 0, widthChars, maxLength, defaultValue);
  if (defaultValue) {
    txtInput.cursor = defaultValue.length;
    if (opts.selectAll) {
      txtInput.selectionAnchor = 0;
    } else if (opts.selectBaseName) {
      const dotIdx = defaultValue.lastIndexOf(".");
      if (dotIdx > 0) {
        txtInput.selectionAnchor = 0;
        txtInput.cursor = dotIdx;
      } else {
        txtInput.selectionAnchor = 0;
      }
    }
  }

  const btnOk = new PushButton(0, 0, okLabel, doConfirm);
  const btnCancel = new PushButton(0, 0, cancelLabel, doCancel);

  function doConfirm() {
    const value = txtInput.text.trim();
    if (!value) return; // 空入力を拒否
    confirmed = true;
    _closeDialog();
    onResult(value);
  }

  function doCancel() {
    _closeDialog();
    if (!confirmed) onResult(null);
  }

  // ── レイアウト ──
  const inputRow = HBox([lblLabel, txtInput]);
  const btnRow = HBox([btnCancel, btnOk]);
  const root = VBox([inputRow, btnRow], DLG_GAP);
  root.layout(FOCUS_MARGIN, FOCUS_MARGIN);

  // ボタン行を右揃え
  if (btnRow.w < inputRow.w) {
    const offset = inputRow.w - btnRow.w;
    for (const child of btnRow.children) {
      child.x += offset;
    }
  }

  const group = new WidgetGroup(root.leaves());

  // TextBox に初期フォーカスを設定 (即キー入力可能にする)
  setFocused(txtInput);

  // ── ダイアログを開く ──
  _openDialogWindow(title, root, group, {
    variant,
    onEnter: doConfirm,
    onEscape: doCancel,
    onOpen: opts.onOpen,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  openAlertDialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * アラートダイアログを開く。メッセージ + OK ボタンのみ。
 *
 * @param {string} message     表示メッセージ ("\n" で改行可)
 * @param {object} [opts]
 * @param {string}   [opts.title="INFO"]          タイトル
 * @param {string}   [opts.variant="default"]     "default" | "danger"
 * @param {string}   [opts.okLabel="OK"]          OK ボタンラベル
 * @param {function} [opts.onOk]                  OK コールバック
 * @param {function} [opts.onOpen]                表示後 SFX コールバック
 */
export function openAlertDialog(message, opts = {}) {
  if (_dialogWinId !== null) return;

  const title = opts.title || "INFO";
  const variant = opts.variant || "default";
  const okLabel = opts.okLabel || "OK";
  const onOk = opts.onOk || (() => { });

  // ── ウィジェット生成 ──
  const lblMessage = new Label(0, 0, message);

  const btnOk = new PushButton(0, 0, okLabel, () => {
    _closeDialog();
    onOk();
  });

  // ── レイアウト ──
  const root = VBox([lblMessage, btnOk], DLG_GAP);
  root.layout(FOCUS_MARGIN, FOCUS_MARGIN);

  // ボタンを右揃え
  if (btnOk.w < lblMessage.w) {
    btnOk.x += lblMessage.w - btnOk.w;
  }

  const group = new WidgetGroup(root.leaves());

  // ── ダイアログを開く ──
  _openDialogWindow(title, root, group, {
    variant,
    onEnter: () => {
      _closeDialog();
      onOk();
    },
    onEscape: () => {
      _closeDialog();
      onOk();
    },
    onOpen: opts.onOpen,
  });
}

