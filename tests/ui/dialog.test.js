/**
 * ui/Dialog.js — ダイアログ API テスト
 *
 * wmOpen / wmClose をモックして、
 * openConfirmDialog / openPromptDialog / openAlertDialog の
 * 引数処理・コールバック呼び出し・variant 処理・二重起動防止を検証。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── モック: font ──
vi.mock("@/core/font.js", () => ({
  drawText: vi.fn(),
  GLYPH_W: 5,
  GLYPH_H: 7,
}));

// ── モック: GPU (描画は no-op) ──
vi.mock("@/core/gpu.js", () => ({
  fillRect: vi.fn(),
  drawRect: vi.fn(),
  drawRoundRect: vi.fn(),
  hline: vi.fn(),
  vline: vi.fn(),
  pset: vi.fn(),
  setClip: vi.fn(),
  resetClip: vi.fn(),
  pushClip: vi.fn(),
  popClip: vi.fn(),
}));

// ── モック: input ──
let _keyDownResult = {};
vi.mock("@/core/input.js", () => ({
  keyDown: (key) => !!_keyDownResult[key],
  keyHeld: vi.fn(() => false),
  getCharQueue: vi.fn(() => []),
  getPasteText: vi.fn(() => null),
  mouseX: () => 0,
  mouseY: () => 0,
  mouseButtonDown: vi.fn(() => false),
  mouseButtonHeld: vi.fn(() => false),
  mouseButtonUp: vi.fn(() => false),
  mouseHasCtrl: vi.fn(() => false),
  mouseHasShift: vi.fn(() => false),
  ctrlDown: vi.fn(() => false),
  isDragging: vi.fn(() => false),
}));

// ── モック: icon ──
vi.mock("@/core/icon.js", () => ({
  drawIcon: vi.fn(),
  ICON_W: 7,
  ICON_H: 7,
}));

// ── モック: text_icon ──
vi.mock("@/core/text_icon.js", () => ({
  drawTextIcon: vi.fn(),
}));

// ── モック: dither ──
vi.mock("@/core/dither.js", () => ({
  BAYER_4x4: Array.from({ length: 16 }, () => 0),
  BAYER_8x8: Array.from({ length: 64 }, () => 0),
}));

// ── WM モック ──
let _nextWinId = 1;
let _lastWmOpenArgs = null;
let _closedIds = [];

vi.mock("@/wm/index.js", () => ({
  wmOpen: (...args) => {
    _lastWmOpenArgs = args;
    return _nextWinId++;
  },
  wmClose: (id) => {
    _closedIds.push(id);
  },
  wmCalcWindowSize: (w, h) => ({ w: w + 20, h: h + 30 }),
  wmIsModalOpen: vi.fn(() => false),
}));

// ── UI ポート初期化 ──
import { initPorts } from "@/ui/index.js";
import { drawText, GLYPH_W, GLYPH_H } from "@/core/font.js";
import {
  fillRect,
  drawRoundRect,
  drawRect,
  hline,
  vline,
  pset,
  setClip,
  resetClip,
  pushClip,
  popClip,
} from "@/core/gpu.js";
import {
  keyDown,
  keyHeld,
  getCharQueue,
  getPasteText,
  mouseHasShift,
  ctrlDown,
} from "@/core/input.js";
import { drawIcon, ICON_W, ICON_H } from "@/core/icon.js";
import { drawTextIcon } from "@/core/text_icon.js";
import { BAYER_4x4, BAYER_8x8 } from "@/core/dither.js";

// DI を注入
initPorts({
  gpu: {
    fillRect,
    drawRoundRect,
    drawRect,
    hline,
    vline,
    pset,
    setClip,
    resetClip,
    pushClip,
    popClip,
  },
  font: { GLYPH_W, GLYPH_H, drawText },
  icon: { ICON_W, ICON_H, drawIcon },
  input: {
    keyDown,
    keyHeld,
    getCharQueue,
    getPasteText,
    mouseHasShift,
    ctrlDown,
  },
  textIcon: { drawTextIcon },
  dither: { BAYER_4x4, BAYER_8x8 },
});

// ── テスト対象 ──
import {
  openConfirmDialog,
  openPromptDialog,
  openAlertDialog,
  isDialogOpen,
  dialogSetSfxOnOpen,
} from "@/ui/Dialog.js";

// ── ヘルパー ──

function resetState() {
  _nextWinId = 1;
  _lastWmOpenArgs = null;
  _closedIds = [];
  _keyDownResult = {};
}

/**
 * wmOpen に渡された opts から onBeforeClose を取得して呼ぶ。
 * ダイアログを × ボタンで閉じるシミュレーション。
 */
function simulateCloseButton() {
  const opts = _lastWmOpenArgs?.[8];
  if (opts?.onBeforeClose) opts.onBeforeClose();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  openConfirmDialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("openConfirmDialog", () => {
  beforeEach(resetState);

  it("wmOpen をモーダルで呼ぶ", () => {
    openConfirmDialog("TEST?");
    expect(_lastWmOpenArgs).not.toBeNull();
    const opts = _lastWmOpenArgs[8];
    expect(opts.modal).toBe(true);
    expect(opts.noResize).toBe(true);
    expect(opts.noMaximize).toBe(true);
    expect(opts.center).toBe(true);
    // clean up
    simulateCloseButton();
  });

  it("デフォルトタイトルは CONFIRM", () => {
    openConfirmDialog("TEST?");
    expect(_lastWmOpenArgs[4]).toBe("CONFIRM"); // title
    simulateCloseButton();
  });

  it("カスタムタイトルを指定できる", () => {
    openConfirmDialog("TEST?", { title: "CUSTOM" });
    expect(_lastWmOpenArgs[4]).toBe("CUSTOM");
    simulateCloseButton();
  });

  it("variant=danger でタイトルに '! ' プレフィクス", () => {
    openConfirmDialog("DELETE?", { variant: "danger" });
    expect(_lastWmOpenArgs[4]).toBe("! CONFIRM");
    simulateCloseButton();
  });

  it("onOk コールバックが OK ボタンで呼ばれる", () => {
    const onOk = vi.fn();
    openConfirmDialog("SURE?", { onOk });

    // onInput で Enter をシミュレート
    const onInput = _lastWmOpenArgs[6]; // onInput callback
    _keyDownResult = { Enter: true };
    onInput({});
    expect(onOk).toHaveBeenCalledOnce();
  });

  it("onCancel コールバックが × ボタンで呼ばれる", () => {
    const onCancel = vi.fn();
    openConfirmDialog("SURE?", { onCancel });
    simulateCloseButton();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Escape で onCancel が呼ばれる", () => {
    const onCancel = vi.fn();
    openConfirmDialog("SURE?", { onCancel });
    const onInput = _lastWmOpenArgs[6];
    _keyDownResult = { Escape: true };
    onInput({});
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("二重起動が防止される", () => {
    openConfirmDialog("FIRST?");
    const firstArgs = _lastWmOpenArgs;
    openConfirmDialog("SECOND?");
    expect(_lastWmOpenArgs).toBe(firstArgs); // 変化しない
    // clean up
    simulateCloseButton();
  });

  it("閉じた後に再度開ける", () => {
    openConfirmDialog("FIRST?");
    simulateCloseButton();
    openConfirmDialog("SECOND?");
    expect(_lastWmOpenArgs[4]).toBe("CONFIRM");
    simulateCloseButton();
  });

  it("onOpen SFX コールバックが呼ばれる", () => {
    const onOpen = vi.fn();
    openConfirmDialog("TEST?", { onOpen });
    expect(onOpen).toHaveBeenCalledWith("default");
    simulateCloseButton();
  });

  it("onOpen に variant が渡される", () => {
    const onOpen = vi.fn();
    openConfirmDialog("TEST?", { variant: "danger", onOpen });
    expect(onOpen).toHaveBeenCalledWith("danger");
    simulateCloseButton();
  });

  it("isDialogOpen が正しく更新される", () => {
    expect(isDialogOpen()).toBe(false);
    openConfirmDialog("TEST?");
    expect(isDialogOpen()).toBe(true);
    simulateCloseButton();
    expect(isDialogOpen()).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  openAlertDialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("openAlertDialog", () => {
  beforeEach(resetState);

  it("デフォルトタイトルは INFO", () => {
    openAlertDialog("DONE.");
    expect(_lastWmOpenArgs[4]).toBe("INFO");
    simulateCloseButton();
  });

  it("Enter で onOk が呼ばれる", () => {
    const onOk = vi.fn();
    openAlertDialog("DONE.", { onOk });
    const onInput = _lastWmOpenArgs[6];
    _keyDownResult = { Enter: true };
    onInput({});
    expect(onOk).toHaveBeenCalledOnce();
  });

  it("Escape でも onOk が呼ばれる (Alert は OK のみ)", () => {
    const onOk = vi.fn();
    openAlertDialog("DONE.", { onOk });
    const onInput = _lastWmOpenArgs[6];
    _keyDownResult = { Escape: true };
    onInput({});
    expect(onOk).toHaveBeenCalledOnce();
  });

  it("× ボタンでも onOk が呼ばれる", () => {
    const onOk = vi.fn();
    openAlertDialog("DONE.", { onOk });
    simulateCloseButton();
    expect(onOk).toHaveBeenCalledOnce();
  });

  it("variant=danger でタイトルにプレフィクス", () => {
    openAlertDialog("ERROR!", { variant: "danger" });
    expect(_lastWmOpenArgs[4]).toBe("! INFO");
    simulateCloseButton();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  openPromptDialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("openPromptDialog", () => {
  beforeEach(resetState);

  it("デフォルトタイトルは INPUT", () => {
    openPromptDialog("NAME:");
    expect(_lastWmOpenArgs[4]).toBe("INPUT");
    simulateCloseButton();
  });

  it("Escape で onResult(null) が呼ばれる", () => {
    const onResult = vi.fn();
    openPromptDialog("NAME:", { onResult });
    const onInput = _lastWmOpenArgs[6];
    _keyDownResult = { Escape: true };
    onInput({});
    expect(onResult).toHaveBeenCalledWith(null);
  });

  it("× ボタンで onResult(null) が呼ばれる", () => {
    const onResult = vi.fn();
    openPromptDialog("NAME:", { onResult });
    simulateCloseButton();
    expect(onResult).toHaveBeenCalledWith(null);
  });

  it("二重起動が防止される", () => {
    openPromptDialog("NAME:");
    const firstArgs = _lastWmOpenArgs;
    openPromptDialog("OTHER:");
    expect(_lastWmOpenArgs).toBe(firstArgs);
    simulateCloseButton();
  });

  it("variant=danger でタイトルにプレフィクス", () => {
    openPromptDialog("NAME:", { variant: "danger" });
    expect(_lastWmOpenArgs[4]).toBe("! INPUT");
    simulateCloseButton();
  });

  it("カスタムタイトルとラベルを指定できる", () => {
    openPromptDialog("FILE:", { title: "RENAME" });
    expect(_lastWmOpenArgs[4]).toBe("RENAME");
    simulateCloseButton();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  dialogSetSfxOnOpen
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dialogSetSfxOnOpen", () => {
  beforeEach(() => {
    resetState();
    dialogSetSfxOnOpen(null); // reset
  });

  it("グローバル SFX コールバックが呼ばれる", () => {
    const sfx = vi.fn();
    dialogSetSfxOnOpen(sfx);
    openConfirmDialog("TEST?");
    expect(sfx).toHaveBeenCalledWith("default");
    simulateCloseButton();
  });

  it("variant が渡される", () => {
    const sfx = vi.fn();
    dialogSetSfxOnOpen(sfx);
    openAlertDialog("ERROR.", { variant: "danger" });
    expect(sfx).toHaveBeenCalledWith("danger");
    simulateCloseButton();
  });

  it("null で解除できる", () => {
    const sfx = vi.fn();
    dialogSetSfxOnOpen(sfx);
    dialogSetSfxOnOpen(null);
    openConfirmDialog("TEST?");
    expect(sfx).not.toHaveBeenCalled();
    simulateCloseButton();
  });
});

