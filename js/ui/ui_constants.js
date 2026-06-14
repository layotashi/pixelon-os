/**
 * @module ui/ui_constants
 * ui_constants.js — UI 共有定数
 *
 * ui と wm の両方から参照される定数を定義する。
 * 循環依存を避けるため、ウィジェットモジュール / wm.js のいずれにも属さない独立ファイル。
 */

/** フォーカスインジケータが必要とする外側マージン (px) */
export const FOCUS_MARGIN = 2;

/**
 * ウィジェット間の最小間隔 (px)。
 *
 * フォーカスブラケットは各ウィジェットの外側に FOCUS_MARGIN px 張り出して描画される。
 * 隣接するウィジェット同士のブラケットが重ならないための不変条件:
 *   gap >= FOCUS_MARGIN * 2
 *
 * HBox / VBox の gap はこの値未満にクランプされる。
 */
export const MIN_GAP = FOCUS_MARGIN * 2;

/** ウィジェット間の標準間隔 (px) */
export const GAP = MIN_GAP;

