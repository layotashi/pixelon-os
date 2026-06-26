/**
 * tests/ui/popup_routing.test.js — ポップアップ全面入力ルーティングのテスト。
 *
 * 回帰防止対象 (根本原因):
 *   ポップアップ (DropDown) は flushPopups() でウィジェット領域の外まで全面に
 *   オーバーレイ描画される。一方アプリの入力は領域ごとにルーティングされうる
 *   (例: TESSERA の出力パネル vs PREVIEW)。この「描画は全面・入力は領域」の非対称が
 *   あると、ポップアップが領域外へ張り出した項目をホバー/クリックできなかった。
 *
 *   修正: WidgetGroup.draw() がポップアップ所有グループ + 描画原点 (絶対座標) を
 *   登録し、WM は展開中の入力を WidgetGroup.dispatchPopupInput(screenX, screenY)
 *   で所有グループへ直接配信する。グループが update() で期待するローカル座標は
 *   常に「画面座標 − 描画原点」に一致するため、領域分岐を介さず正しく届く。
 *
 *   本テストは非ゼロ原点で描画したグループに対し、ポップアップ下端 (ウィジェット
 *   ヘッダの遥か下) の項目を画面座標で叩いても、正しい項目が選択されることを検証する。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initPorts, WidgetGroup } from "@/ui/index.js";
import { DropDown } from "@/ui/widgets/DropDown.js";
import * as Helpers from "@/ui/ui_helpers.js";

beforeAll(() => {
  initPorts({
    gpu: {
      fillRect() {},
      drawRoundRect() {},
      drawRect() {},
      hline() {},
      vline() {},
      pset() {},
      setClip() {},
      resetClip() {},
      pushClip() {},
      popClip() {},
    },
    font: { GLYPH_W: 5, GLYPH_H: 7, drawText() {} },
    icon: { ICON_W: 7, ICON_H: 7, drawIcon() {} },
    input: {
      keyDown() { return false; },
      keyHeld() { return false; },
      getCharQueue() { return []; },
      getPasteText() { return ""; },
      mouseHasShift() { return false; },
      mouseHasCtrl() { return false; },
      ctrlDown() { return false; },
    },
    textIcon: { drawTextIcon() {} },
    dither: { BAYER_4x4: [], BAYER_8x8: [] },
  });
});

describe("dispatchPopupInput — 全面オーバーレイ入力ルーティング", () => {
  it("所有グループ未登録なら false を返す (フォールバック判定用)", () => {
    // この時点ではまだ open なポップアップを draw していない
    expect(
      WidgetGroup.dispatchPopupInput(0, 0, { type: "hover" }),
    ).toBe(false);
  });

  it("非ゼロ原点で描画したグループの、領域外まで張り出した項目を画面座標で選択できる", () => {
    const selected = [];
    const dd = new DropDown(0, 0, ["AAA", "BBB", "CCC", "DDD"], 0, (i) =>
      selected.push(i),
    );
    const group = new WidgetGroup([dd]);

    // マウス展開済みの状態を用意 (justOpened の初回 up スキップを避ける)
    dd.open = true;
    dd.justOpened = false;
    dd._mouseOpen = true;
    dd.hoverIndex = -1;

    // 非ゼロ原点で描画 → 所有グループ + 描画原点 (絶対座標) が登録される
    const ORX = 100;
    const ORY = 50;
    group.draw({ x: ORX, y: ORY });

    // ポップアップ最下段の項目 (index 3 = "DDD") の画面座標を、ウィジェット自身の
    // ジオメトリ (popupY + 2 + i*IH + IH/2) から算出する。
    const IH = Helpers.DROPDOWN_ITEM_HEIGHT;
    const popupYLocal = dd.y + dd.h + 1;
    const i = 3;
    const localX = dd.x + (dd.w >> 1);
    const localY = popupYLocal + 2 + i * IH + (IH >> 1);
    const screenX = ORX + localX;
    const screenY = ORY + localY;

    // ホバー: 画面座標 → 所有グループ → 展開中 DropDown へ正しく届き、index 3 を指す
    const handled = WidgetGroup.dispatchPopupInput(screenX, screenY, {
      type: "hover",
    });
    expect(handled).toBe(true);
    expect(dd.hoverIndex).toBe(3);

    // リリース: index 3 が確定し、ポップアップが閉じる
    WidgetGroup.dispatchPopupInput(screenX, screenY, { type: "up" });
    expect(selected).toEqual([3]);
    expect(dd.selectedIndex).toBe(3);
    expect(dd.open).toBe(false);
  });

  it("原点を平行移動しても、同一の相対項目が選択される (座標変換の正しさ)", () => {
    const selected = [];
    const dd = new DropDown(0, 0, ["A", "B", "C"], 0, (i) => selected.push(i));
    const group = new WidgetGroup([dd]);
    dd.open = true;
    dd.justOpened = false;
    dd._mouseOpen = true;

    // 全く異なる原点で描画
    const ORX = 333;
    const ORY = 7;
    group.draw({ x: ORX, y: ORY });

    const IH = Helpers.DROPDOWN_ITEM_HEIGHT;
    const popupYLocal = dd.y + dd.h + 1;
    const i = 1; // "B"
    const screenX = ORX + dd.x + (dd.w >> 1);
    const screenY = ORY + popupYLocal + 2 + i * IH + (IH >> 1);

    WidgetGroup.dispatchPopupInput(screenX, screenY, { type: "hover" });
    expect(dd.hoverIndex).toBe(1);
    WidgetGroup.dispatchPopupInput(screenX, screenY, { type: "up" });
    expect(selected).toEqual([1]);
  });
});
