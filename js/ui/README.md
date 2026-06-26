# ui/ — ウィジェットライブラリ層

OS 風デスクトップの GUI ウィジェットを提供します。  
描画・入力などのプラットフォーム機能は依存注入 (DI) で外部から推入するため、  
異なるプロジェクトでも再利用可能です。

## 依存関係

```
ports.js            ← 依存ゼロ (ポート定義のみ、初期化時に外部から注入)
ui_constants.js     ← 依存ゼロ
scrollbar.js        → ports.js
layout.js           → ui_constants.js
ui_helpers.js       → ports.js
Widget.js           ← 依存ゼロ
FocusableWidget.js  → Widget.js
widgets/*.js        → Widget/FocusableWidget, ports.js, ui_helpers.js, scrollbar.js
WidgetGroup.js      → ports.js, ui_helpers.js, layout.js
index.js            → 全モジュール (re-export) + initPorts オーケストレーション
```

> **core/ への直接依存はゼロ**: すべて `ports.js` 経由。  
> ホスト側が `initPorts()` で実装を注入する。

**利用方法**: 外部からは `index.js` ファサードを通じてアクセスしてください。

```js
import {
  initPorts,
  PushButton,
  WidgetGroup,
  HBox,
  VBox,
  FOCUS_MARGIN,
} from "../ui/index.js";

// ブート時にポートを注入 (ウィジェット生成前に 1 回呼ぶ)
initPorts({
  gpu: myGpuModule,
  font: myFontModule,
  icon: myIconModule,
  input: myInputModule,
  textIcon: myTextIconModule,
  dither: myDitherModule,
});
```

## アーキテクチャ

```
Widget (基底クラス)
 ├─ Label, HSep, VSep                  (非フォーカス)
 └─ FocusableWidget
     ├─ ButtonBase
     │   ├─ PushButton
     │   ├─ ToggleButton
     │   └─ RadioButton
     ├─ Slider
     ├─ NumberBox
     ├─ DropDown
     ├─ ListBox
     ├─ TreeView
     ├─ VfsBrowser            (TreeView 内包、VFS 特化)
     ├─ BayerPicker
     ├─ TextBox
     └─ TextArea

WidgetGroup — Widget 配列の描画・入力・フォーカス管理を一括で行うオーケストレータ
```

## モジュール一覧

### Widget.js — ウィジェット基底クラス

すべてのウィジェットの共通インターフェースを定義します。

**プロパティ:** `x`, `y`, `w`, `h`, `visible`, `tooltip`

**メソッド:** `draw(cr)`, `update(ev)`, `hitTest(lx, ly)`, `clearSelection()`, `resetDragState()`

**アクセサ:** `focusable`, `cursorName`, `isTextInput`, `isActive`, `hasPopup`

### FocusableWidget.js — フォーカス可能ウィジェットの基底クラス

`Widget` を継承し、`handleKey()` メソッドとデフォルトの `focusable = true`, `cursorName = "pointer"` を追加します。

### WidgetGroup.js — ウィジェットグループ

旧 `drawWidgets` / `updateWidgets` の代替。Widget 配列の描画・入力処理・フォーカス管理・ラジオ排他制御・ポップアップキュー登録を一括で行います。

**インスタンスメソッド:**

- `draw(cr)` — 全ウィジェット描画 + フォーカスブラケット + ポップアップキュー登録
- `update(ev)` — 入力配信 + フォーカス管理 + ラジオ排他
- `measure(pad)` — バウンディングボックス計測

**静的メソッド:**

- `WidgetGroup.setWmCallbacks({ setTooltip, requestCursor })` — WM コールバック注入
- `WidgetGroup.getFocused()` / `WidgetGroup.clearFocus()` — フォーカス管理
- `WidgetGroup.flushPopups()` / `WidgetGroup.hasOpenPopup()` — ポップアップ管理
- `WidgetGroup.dispatchPopupInput(screenX, screenY, ev)` — 展開中ポップアップの所有グループへ画面座標イベントを直接配信 (描画と対称の全面入力ルーティング)
- `WidgetGroup.hasTextInputFocus()` — テキスト入力フォーカス判定

### widgets/ — ウィジェットクラス群

| クラス         | 基底            | 説明                                           |
| -------------- | --------------- | ---------------------------------------------- |
| `PushButton`   | ButtonBase      | クリックボタン                                 |
| `ToggleButton` | ButtonBase      | ON/OFF トグル                                  |
| `RadioButton`  | ButtonBase      | ラジオボタングループ                           |
| `Label`        | Widget          | テキストラベル                                 |
| `HSep`         | Widget          | 水平セパレータ                                 |
| `VSep`         | Widget          | 垂直セパレータ                                 |
| `ListBox`      | FocusableWidget | スクロール付きリスト (アイテム別 Tooltip 対応) |
| `TreeView`     | FocusableWidget | スクロール付きツリー (D&D 対応)                |
| `Slider`       | FocusableWidget | 水平スライダー                                 |
| `NumberBox`    | FocusableWidget | 数値入力 (縦ドラッグ/ホイール)                 |
| `BayerPicker`  | FocusableWidget | ベイヤーパターン選択ピッカー (4×4 / 8×8)       |
| `TextBox`      | FocusableWidget | 1 行テキスト入力                               |
| `TextArea`     | FocusableWidget | 複数行テキスト入力 (矩形選択対応)              |
| `DropDown`     | FocusableWidget | ドロップダウン選択                             |

#### スクロール操作メソッド

`ListBox`, `TreeView`, `TextArea` はスクロールバーを内蔵しています。
外部から items / lines を差し替えた際は、以下のパブリックメソッドで
スクロール状態を更新してください（内部の `_vScroll` に直接触れないこと）。

| メソッド               | 説明                                           |
| ---------------------- | ---------------------------------------------- |
| `setContentLength(n)`  | コンテンツ長を更新しスクロール範囲を再計算     |
| `scrollToTop()`        | スクロール位置を先頭にリセット                 |
| `ensureVisible(index)` | 指定インデックスが表示範囲に入るようスクロール |

### ui_helpers.js — 共有ユーティリティ

ウィジェットクラス群が共有する定数・ユーティリティ関数・グローバルステートをまとめたモジュール。

**主要 API:**

- `textWidth(str)` — 文字列のピクセル幅計算
- `btnAutoW(label)` — ラベルからボタン幅算出
- `getFocused()` / `setFocused(w)` / `clearFocus()` — フォーカス管理
- `tickRepeat(key, accel)` — キーリピート & 2 段加速
- `pushPopup(entry)` / `flushPopups()` — ポップアップ描画リスト

### scrollbar.js — スクロールバー プリミティブ (~430 行)

ListBox / TreeView / TextArea およびウィンドウスクロール (wm.js) が
共通で使用するスクロールバー部品です。

### layout.js — レイアウトエンジン

Box コンテナ (HBox / VBox) による宣言的レイアウトを提供します。
**不変条件:** `gap` は常に `MIN_GAP` (ブラケット描画が重ならない最小値) 以上にクランプされます。
**主要 API:**

- `HBox(children, gap)` — 子要素を左→右に配置 (垂直中央揃え)
- `VBox(children, gap)` — 子要素を上→下に配置 (左揃え)
- `Box.layout(x, y)` — 再帰的に子要素を配置。非表示 Box のリーフ visible も自動伝搬
- `Box.leaves()` — 全リーフウィジェットを平坦な配列で返す (WidgetGroup 用)
- `Box.measure(pad)` — バウンディングボックスから必要サイズを算出
- `measureWidgets(widgets, pad)` — ウィジェット配列のバウンディングボックス計測 (WidgetGroup 内部使用)

### ui_constants.js — 共有定数

`ui_helpers.js` と `wm.js` の両方から参照される定数を、循環依存回避のために分離。

**exports:** `FOCUS_MARGIN` (= 2), `MIN_GAP` (= FOCUS_MARGIN \* 2), `GAP` (= MIN_GAP)

### ports.js — ポートレジストリ (DI)

UI が必要とする外部機能 (gpu / font / icon / input / textIcon / dither) への  
参照を `export let` ライブバインディングで保持します。  
`initPorts()` で実装を注入すると、全 import 先に反映されます。

**ポートカテゴリ:**

| ポート     | 提供する機能                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `gpu`      | `fillRect`, `drawRoundRect`, `drawRect`, `hline`, `vline`, `pset`, `setClip`, `resetClip`, `pushClip`, `popClip` |
| `font`     | `GLYPH_W`, `GLYPH_H`, `drawText`                                                                                 |
| `icon`     | `ICON_W`, `ICON_H`, `drawIcon`                                                                                   |
| `input`    | `keyDown`, `keyHeld`, `getCharQueue`, `getPasteText`, `mouseHasShift`, `ctrlDown`                                |
| `textIcon` | `drawTextIcon`                                                                                                   |
| `dither`   | `BAYER_4x4`, `BAYER_8x8`                                                                                         |

### index.js — ファサード

全モジュールのパブリック API を re-export するエントリポイント。  
`initPorts()` もここから export される (`_initPorts` + `_computeDerivedConstants` のオーケストレーション)。

### FileDialog.js — ファイルダイアログ (~200 行)

Save / Open モードのファイル選択モーダルダイアログです。  
VfsBrowser + TextBox + PushButton を組み合わせ、WM のモーダルウィンドウとして表示されます。  
Explorer / TESSERA / Settings 等から共通で利用されます。

**主要 API:**

- `openFileDialog(mode, opts)` — ダイアログを開く
  - `mode`: `"save"` | `"open"`
  - `opts.defaultPath` — 初期ディレクトリ (VFS パス)
  - `opts.defaultName` — 初期ファイル名 (save モード)
  - `opts.filter` — 拡張子フィルタ (e.g. `".pbm"`)
  - `opts.title` — ダイアログタイトル
  - `opts.onResult(path)` — 結果コールバック (Cancel 時は null)

## 共通 API パターン

```js
// 0. ポート注入 (ブート時に 1 回)
initPorts({ gpu, font, icon, input, textIcon, dither });

// 1. ウィジェット生成 (class コンストラクタ)
const btn = new PushButton(0, 0, "Save", onSave);
btn.tooltip = "Save the document";

// 2. Box レイアウトを宣言
const root = VBox([HBox([btn, lbl]), slider]);

// 3. 配置実行
root.layout(FOCUS_MARGIN, FOCUS_MARGIN);

// 4. WidgetGroup にリーフを渡す
const group = new WidgetGroup(root.leaves());

// 5. 毎フレーム描画
group.draw(cr);

// 6. 毎フレーム入力処理
group.update(ev);

// 7. サイズ計測 (ウィンドウリサイズ用)
const size = root.measure();
```

## 設計原則

- **クラスベース OOP**: ウィジェットは `class` 構文で定義、`new Xxx()` で生成
- **ポリモーフィズム**: `draw()` / `update()` / `handleKey()` のオーバーライドで固有処理を実装
- **ダックタイピング**: `WidgetGroup` は `isActive`, `hasPopup`, `resetDragState()` 等のアクセサ/メソッドで機能を検出（`instanceof` 不要）
- **ステートレス描画**: 毎フレーム全描画 (retained mode ではない)
- **依存注入 (DI)**: 描画・入力等のプラットフォーム機能は `initPorts()` で外部から注入。`core/` への直接 import はゼロ
- **DI で逆依存回避**: `wm` への参照は `WidgetGroup.setWmCallbacks()` で注入
- **純粋レイアウト**: `layout.js` は座標計算のみで副作用なし

## ツールチップ

ツールチップは 2 階層で動作します。

### ウィジェット単位（静的）

```js
const btn = new PushButton(0, 0, "Save", onSave);
btn.tooltip = "Save the document";
```

### アイテム単位（動的・コールバック）

ListBox / TreeView の `onItemTooltip` コールバック:

```js
const lb = new ListBox(0, 0, 5, items, 0, onChange);
lb.onItemTooltip = (index) => descriptions[index] ?? null;
```

