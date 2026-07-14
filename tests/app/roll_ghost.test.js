/**
 * roll_ghost.test.js — ROLL のノートグリフ 3 状態を 1px 単位でユーザー ASCII 仕様と検証する。
 *
 * ノートは「白の外枠 (最外周 1px) + 黒枠」を共通に持ち、内部だけが状態で変わる:
 *   solid  (非選択) … 内部も黒
 *   hollow (選択/再生中) … 内部を白抜き
 *   ghost  (非アクティブトラック) … 内部を市松
 *
 * drawNoteGlyph を実 gpu バッファ (vram) へ描き、pget で 1px ずつ読んで仕様と完全一致
 * (diff 0) することを確かめる。ユーザー提供の 9×7 仕様は「黒枠の箱」(= 外枠 1px の内側) を
 * 表すので、11×9 で描いた矩形の内側 (1,1)-(9,7) を読み取って比較する。
 *
 * ゴーストの肝は「角の位相」: drawCheckerboard は内側原点 (ox+2,oy+2) 基準の phase=0 で
 * 一致位相へ白を置くため、ノートの位置・サイズに依らず左上角が必ず白始まりになる。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { drawNoteGlyph } from "@/app/roll/roll.js";
import { fillRect, pget } from "@/core/gpu.js";

/** (x0..x1, y0..y1) 矩形を "#"(=1)/"."(=0) の行文字列配列にする */
function readAscii(x0, y0, x1, y1) {
  const lines = [];
  for (let y = y0; y <= y1; y++) {
    let s = "";
    for (let x = x0; x <= x1; x++) s += pget(x, y) ? "#" : ".";
    lines.push(s);
  }
  return lines;
}

// ユーザー提供の 9×7 仕様 (黒枠の箱)。
const SOLID = [
  "#########",
  "#########",
  "#########",
  "#########",
  "#########",
  "#########",
  "#########",
];
const HOLLOW = [
  "#########",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########",
];
const GHOST = [
  "#########",
  "#.#.#.#.#",
  "##.#.#.##",
  "#.#.#.#.#",
  "##.#.#.##",
  "#.#.#.#.#",
  "#########",
];

describe("ROLL ノートグリフ — 3 状態の 1px 仕様 (drawNoteGlyph)", () => {
  beforeEach(() => fillRect(0, 0, 48, 32, 0)); // 検証域を背景 0 でクリア

  // 11×9 で描くと外枠 1px の内側 (1,1)-(9,7) が「黒枠の箱」9×7 になる。
  it("solid: 内部も黒", () => {
    drawNoteGlyph(0, 0, 11, 9, "solid");
    expect(readAscii(1, 1, 9, 7)).toEqual(SOLID);
  });

  it("hollow: 内部を白抜き (選択/再生中)", () => {
    drawNoteGlyph(0, 0, 11, 9, "hollow");
    expect(readAscii(1, 1, 9, 7)).toEqual(HOLLOW);
  });

  it("ghost: 内部を市松 (角の位相まで一致)", () => {
    drawNoteGlyph(0, 0, 11, 9, "ghost");
    expect(readAscii(1, 1, 9, 7)).toEqual(GHOST);
  });

  it("外枠の最外周 1px は白 (グリッド線から浮かせる背景マージン)", () => {
    drawNoteGlyph(0, 0, 11, 9, "ghost");
    // 最外周 (x=0, x=10, y=0, y=8) は常に白
    for (let x = 0; x <= 10; x++) {
      expect(pget(x, 0)).toBe(0);
      expect(pget(x, 8)).toBe(0);
    }
    for (let y = 0; y <= 8; y++) {
      expect(pget(0, y)).toBe(0);
      expect(pget(10, y)).toBe(0);
    }
  });

  it("ghost の角の位相は位置に依存しない (奇数オフセットでも左上角が白始まり)", () => {
    // 別の (奇数) 原点で描いても、黒枠の箱の内側左上 (= オフセット +2) が白から始まる。
    for (const [ox, oy] of [
      [0, 0],
      [3, 5],
      [7, 2],
    ]) {
      fillRect(0, 0, 48, 32, 0);
      drawNoteGlyph(ox, oy, 11, 9, "ghost");
      expect(readAscii(ox + 1, oy + 1, ox + 9, oy + 7)).toEqual(GHOST);
    }
  });
});
