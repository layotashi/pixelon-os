/**
 * core/sfx.js — システム SFX テスト
 *
 * createSfxChannels / playSfx をモックして、
 * playSystemSfx の有効/無効切替・フック注入・SFX 名マッピングを検証。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── モック: core/audio.js ──
const _mockChannels = {};
const _playSfxCalls = [];

vi.mock("@/core/audio.js", () => ({
  createSfxChannels: (defs) => {
    // 各キーに対して SynthChannel のスタブを生成
    const result = {};
    for (const key of Object.keys(defs)) {
      result[key] = { name: key, ...defs[key] };
      _mockChannels[key] = result[key];
    }
    return result;
  },
  playSfx: (ch, note, duration) => {
    _playSfxCalls.push({ ch, note, duration });
  },
}));

// ── モック: wm/index.js ──
let _wmSfxCallbacks = null;
vi.mock("@/wm/index.js", () => ({
  wmSetSfxCallbacks: (cbs) => {
    _wmSfxCallbacks = cbs;
  },
}));

// ── モック: ui/Dialog.js ──
let _dialogSfxFn = null;
vi.mock("@/ui/Dialog.js", () => ({
  dialogSetSfxOnOpen: (fn) => {
    _dialogSfxFn = fn;
  },
}));

// ── モック: ui/widgets/PushButton.js ──
let _buttonSfxFn = null;
vi.mock("@/ui/widgets/PushButton.js", () => ({
  buttonSetSfxOnClick: (fn) => {
    _buttonSfxFn = fn;
  },
}));

// ── モック: ui/widgets/ToggleButton.js ──
let _toggleSfxFn = null;
vi.mock("@/ui/widgets/ToggleButton.js", () => ({
  toggleSetSfxOnChange: (fn) => {
    _toggleSfxFn = fn;
  },
}));

// ── モック: ui/widgets/RadioButton.js ──
let _radioSfxFn = null;
vi.mock("@/ui/widgets/RadioButton.js", () => ({
  radioSetSfxOnChange: (fn) => {
    _radioSfxFn = fn;
  },
}));

// ── モック: config.js ──
let _mockSystemSfxOn = true;
vi.mock("@/config.js", () => ({
  isSystemSfxOn: () => _mockSystemSfxOn,
}));

// ── テスト対象 ──
import {
  playSystemSfx,
  setSystemSfxEnabled,
  isSystemSfxEnabled,
  initSystemSfxHooks,
  _resetSfx,
  _flushPendingSfx,
} from "@/core/sfx.js";

// ── テスト ──

function resetAll() {
  _playSfxCalls.length = 0;
  _wmSfxCallbacks = null;
  _dialogSfxFn = null;
  _buttonSfxFn = null;
  _toggleSfxFn = null;
  _radioSfxFn = null;
  _mockSystemSfxOn = true;
  _resetSfx();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  playSystemSfx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("playSystemSfx", () => {
  beforeEach(resetAll);

  it("playSfx に duration 引数を渡す", () => {
    playSystemSfx("winOpen");
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(1);
    expect(_playSfxCalls[0].note).toBe(72); // C5
    expect(_playSfxCalls[0].ch.name).toBe("winOpen");
    expect(typeof _playSfxCalls[0].duration).toBe("number");
    expect(_playSfxCalls[0].duration).toBeGreaterThan(0);
  });

  it("2 回目は同じチャンネルを再利用する", () => {
    playSystemSfx("winOpen");
    _flushPendingSfx();
    const ch1 = _playSfxCalls[0].ch;
    playSystemSfx("winOpen");
    _flushPendingSfx();
    expect(_playSfxCalls[1].ch).toBe(ch1);
  });

  it("各 SFX イベントが正しい MIDI ノートで呼ばれる", () => {
    const expected = {
      winOpen: 72,
      winClose: 60,
      maximize: 67,
      dialogOpen: 65,
      dialogDanger: 55,
      btnClick: 76,
      toggle: 74,
      menuOpen: 69,
      menuSelect: 72,
    };
    for (const [name, note] of Object.entries(expected)) {
      _playSfxCalls.length = 0;
      playSystemSfx(name);
      _flushPendingSfx();
      expect(_playSfxCalls[0].note).toBe(note);
    }
  });

  it("存在しない SFX 名では playSfx が呼ばれない", () => {
    playSystemSfx("nonExistent");
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  setSystemSfxEnabled / isSystemSfxEnabled
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("setSystemSfxEnabled", () => {
  beforeEach(resetAll);

  it("デフォルトは有効", () => {
    expect(isSystemSfxEnabled()).toBe(true);
  });

  it("無効にすると playSystemSfx が何もしない", () => {
    setSystemSfxEnabled(false);
    playSystemSfx("winOpen");
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(0);
  });

  it("再度有効にすると再生される", () => {
    setSystemSfxEnabled(false);
    setSystemSfxEnabled(true);
    playSystemSfx("winOpen");
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(1);
  });

  it("isSystemSfxEnabled が状態を反映する", () => {
    setSystemSfxEnabled(false);
    expect(isSystemSfxEnabled()).toBe(false);
    setSystemSfxEnabled(true);
    expect(isSystemSfxEnabled()).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  initSystemSfxHooks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("initSystemSfxHooks", () => {
  beforeEach(resetAll);

  it("WM SFX コールバックを注入する", () => {
    initSystemSfxHooks();
    expect(_wmSfxCallbacks).not.toBeNull();
    expect(typeof _wmSfxCallbacks.onOpen).toBe("function");
    expect(typeof _wmSfxCallbacks.onClose).toBe("function");
    expect(typeof _wmSfxCallbacks.onMaximize).toBe("function");
    expect(typeof _wmSfxCallbacks.onMenu).toBe("function");
    expect(typeof _wmSfxCallbacks.onMenuItem).toBe("function");
  });

  it("Dialog SFX コールバックを注入する", () => {
    initSystemSfxHooks();
    expect(_dialogSfxFn).not.toBeNull();
  });

  it("Button SFX コールバックを注入する", () => {
    initSystemSfxHooks();
    expect(_buttonSfxFn).not.toBeNull();
  });

  it("Toggle SFX コールバックを注入する", () => {
    initSystemSfxHooks();
    expect(_toggleSfxFn).not.toBeNull();
  });

  it("WM onOpen コールバックが winOpen SFX を再生する", () => {
    initSystemSfxHooks();
    _wmSfxCallbacks.onOpen();
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(1);
    expect(_playSfxCalls[0].ch.name).toBe("winOpen");
  });

  it("WM onClose コールバックが winClose SFX を再生する", () => {
    initSystemSfxHooks();
    _wmSfxCallbacks.onClose();
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(1);
    expect(_playSfxCalls[0].ch.name).toBe("winClose");
  });

  it("WM onMaximize コールバックが maximize SFX を再生する", () => {
    initSystemSfxHooks();
    _wmSfxCallbacks.onMaximize();
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(1);
    expect(_playSfxCalls[0].ch.name).toBe("maximize");
  });

  it("WM onMenu コールバックが menuOpen SFX を再生する", () => {
    initSystemSfxHooks();
    _wmSfxCallbacks.onMenu();
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(1);
    expect(_playSfxCalls[0].ch.name).toBe("menuOpen");
  });

  it("WM onMenuItem コールバックが menuSelect SFX を再生する", () => {
    initSystemSfxHooks();
    _wmSfxCallbacks.onMenuItem();
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(1);
    expect(_playSfxCalls[0].ch.name).toBe("menuSelect");
  });

  it("Dialog default variant → dialogOpen SFX", () => {
    initSystemSfxHooks();
    _dialogSfxFn("default");
    _flushPendingSfx();
    expect(_playSfxCalls[0].ch.name).toBe("dialogOpen");
  });

  it("Dialog danger variant → dialogDanger SFX", () => {
    initSystemSfxHooks();
    _dialogSfxFn("danger");
    _flushPendingSfx();
    expect(_playSfxCalls[0].ch.name).toBe("dialogDanger");
  });

  it("Button コールバック → btnClick SFX", () => {
    initSystemSfxHooks();
    _buttonSfxFn();
    _flushPendingSfx();
    expect(_playSfxCalls[0].ch.name).toBe("btnClick");
  });

  it("Toggle コールバック → toggle SFX", () => {
    initSystemSfxHooks();
    _toggleSfxFn();
    _flushPendingSfx();
    expect(_playSfxCalls[0].ch.name).toBe("toggle");
  });

  it("Radio コールバック → toggle SFX", () => {
    initSystemSfxHooks();
    _radioSfxFn();
    _flushPendingSfx();
    expect(_playSfxCalls[0].ch.name).toBe("toggle");
  });

  it("SFX 無効時はコールバック経由でも再生されない", () => {
    initSystemSfxHooks();
    setSystemSfxEnabled(false);
    _wmSfxCallbacks.onOpen();
    _dialogSfxFn("default");
    _buttonSfxFn();
    _toggleSfxFn();
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(0);
  });

  it("config の初期値が false の場合、_enabled が false に同期される", () => {
    _mockSystemSfxOn = false;
    initSystemSfxHooks();
    expect(isSystemSfxEnabled()).toBe(false);
    playSystemSfx("winOpen");
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(0);
  });

  it("同一フレーム内の複数 SFX は最後のものだけ再生される (後勝ち debounce)", () => {
    initSystemSfxHooks();
    _wmSfxCallbacks.onOpen(); // winOpen
    _buttonSfxFn(); // btnClick
    _dialogSfxFn("default"); // dialogOpen
    _flushPendingSfx();
    expect(_playSfxCalls).toHaveLength(1);
    expect(_playSfxCalls[0].ch.name).toBe("dialogOpen");
  });
});

