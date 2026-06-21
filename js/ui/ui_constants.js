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

/**
 * セクション見出し (反転バンド) の内側余白 (px)。
 *
 * 大項目ラベル (SectionLabel) は前景色で塗った帯の上に背景色テキストを描く
 * 「タイトルバー風」の反転表示で、1-bit でも明確な対比 (CRAP の Contrast) と
 * 階層を作る。テキストが帯の縁に密着しないよう四辺に入れる余白。
 *
 * 左右・上下で同一値にすることでテキスト周囲の余白が均等になる
 * (システムフォントは 5x5 でセルを埋めるため、px 値の一致 = 見た目の一致)。
 * 全画面で同一値を使い様式を統一する (Repetition)。
 */
export const SECTION_PAD = 2;

