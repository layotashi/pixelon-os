# SYNESTA v0.2.0 — JavaScript モジュール構成

> 1-bit Desktop DAW — ブラウザ上で動作するチップチューン風デスクトップ環境

## アーキテクチャ概要

```
kernel.js           ← エントリポイント / DI wiring / main loop
config.js           ← グローバル設定・定数
  │
  ├── core/         ← 描画・入力・フォント・ストレージ等のインフラ
  ├── audio/        ← シンセ・再生エンジン・トランスポートUI
  ├── ui/           ← ウィジェットライブラリ (ボタン・スライダー・テキスト等)
  ├── wm/           ← OS風ウィンドウマネージャ
  ├── app/          ← 各アプリケーションウィンドウ
  │
  ├── splash.js     ← スプラッシュスクリーン (ブート演出)
  └── wallpaper.js  ← 壁紙管理 (Solid 階調 / VFS 画像)
```

## レイヤー依存方向

依存は **上→下** の一方向のみ。循環依存はゼロ。

```
app/  →  wm/  →  ui/  →  core/
  │        │       │        ↑
  └────────┴───────┴── config.js
                        audio/  →  core/  (UIなし)
```

## DI (Dependency Injection) パターン

レイヤー間の逆方向参照はすべてコールバック注入で解決しています。  
配線は `kernel.js` の `boot()` に集約されています。

| 注入関数                           | 注入先        | 注入される機能                                     |
| ---------------------------------- | ------------- | -------------------------------------------------- |
| `wmSetUiCallbacks()`               | wm → ui       | `flushPopups`, `hasOpenPopup`, `hasTextInputFocus`, `dispatchPopupInput` |
| `uiSetWmCallbacks()`               | ui → wm       | `wmSetTooltip`, `wmRequestCursor`                  |
| `transportSetPianoRollCallbacks()` | audio → app   | `getTracks`, `setPlayheadPos`                      |
| `transportSetIsHostFocused()`      | audio → wm    | `wmIsFocused("STUDIO")` (Space キー制御)           |
| `configSetSaveCallback()`          | config → core | `save(key, value)` ディスパッチャ                  |

## ファイル一覧

### ルート (6)

| ファイル       | 行数 | 役割                                                               |
| -------------- | ---- | ------------------------------------------------------------------ |
| `kernel.js`    | ~170 | ブートストラップ + メインループ + DI 配線                          |
| `config.js`    | ~380 | 解像度プリセット・パレット・フォントレジストリ・音楽定数の一元定義 |
| `splash.js`    | ~275 | スプラッシュスクリーン (ブート演出 + ディザ遷移)                   |
| `logo.js`      | ~45  | ブートロゴ PNG の読み込み・描画                                    |
| `wallpaper.js` | ~230 | 壁紙管理 (Solid 階調 / VFS 画像)                                   |

### core/ (14) — インフラ層

| ファイル       | 行数 | 役割                                                            |
| -------------- | ---- | --------------------------------------------------------------- |
| `gpu.js`       | ~665 | VRAM + 描画プリミティブ (pset/line/rect/blit 等)                |
| `input.js`     | ~370 | キーボード・マウス入力の状態管理                                |
| `font.js`      | ~155 | ビットマップフォント読み込み・描画・動的切替 (switchFont)       |
| `cursor.js`    | ~160 | カーソルスプライトの管理・描画                                  |
| `icon.js`      | ~150 | アイコンスプライトシートの管理・描画                            |
| `text_icon.js` | ~105 | テキスト用アイコン (改行記号等)                                 |
| `storage.js`   | ~120 | `localStorage` ベースの設定永続化                               |
| `dither.js`    | ~185 | Bayer ordered dithering (RGBA → 1-bit)                          |
| `ascii_art.js` | ~270 | ASCII Art 変換 (RGBA → 文字濃淡ハーフトーニング)                |
| `anim.js`      | ~300 | イージング関数群 (25種 + linear) + アニメーションユーティリティ |
| `audio.js`     | ~700 | Web Audio API 基盤 (AudioContext・SynthChannel・SFX)            |
| `gif.js`       | ~260 | GIF89a エンコーダ (1-bit 特化, LZW 圧縮)                        |
| `pbm.js`       | ~70  | PBM P1 (ASCII) コーデック (encode / decode)                     |
| `vfs.js`       | ~480 | localStorage ベースの仮想ファイルシステム                       |

### audio/ (2) — STUDIO 専用オーディオ層

| ファイル             | 行数 | 役割                                                 |
| -------------------- | ---- | ---------------------------------------------------- |
| `playback_engine.js` | ~475 | 再生エンジン (look-ahead スケジューラ, メトロノーム) |
| `transport.js`       | ~380 | トランスポートUI (再生/停止/BPM/ループ)              |

### ui/ — ウィジェット層

| ファイル / ディレクトリ | 行数       | 役割                                                      |
| ----------------------- | ---------- | --------------------------------------------------------- |
| `Widget.js`             | ~110       | ウィジェット基底クラス                                    |
| `FocusableWidget.js`    | ~45        | フォーカス可能ウィジェット基底クラス                      |
| `WidgetGroup.js`        | ~280       | ウィジェットグループ (描画・入力・計測のオーケストレータ) |
| `ui_helpers.js`         | ~160       | 共有状態・ユーティリティ (focus, キーリピート 等)         |
| `widgets/`              | 16ファイル | 具象ウィジェットクラス (Button/Slider/DropDown 等)        |
| `FileDialog.js`         | ~200       | ファイルダイアログ (Save/Open モーダル)                   |
| `scrollbar.js`          | ~430       | スクロールバー プリミティブ (状態管理・描画・入力)        |
| `layout.js`             | ~210       | レイアウトエンジン (Box / HBox / VBox, measureWidgets)    |
| `ui_constants.js`       | ~10        | 共有定数 (FOCUS_MARGIN)                                   |
| `index.js`              | ~86        | ファサード (全 public API の re-export)                   |

### wm/ (2) — ウィンドウマネージャ層

| ファイル   | 行数  | 役割                                                       |
| ---------- | ----- | ---------------------------------------------------------- |
| `wm.js`    | ~1840 | ウィンドウシステム (移動/リサイズ/スナップ/Z順/スクロール) |
| `index.js` | ~40   | ファサード (全 public API の re-export)                    |

### app/ (9+) — アプリケーション層

| ファイル                | 行数  | 役割                                                 |
| ----------------------- | ----- | ---------------------------------------------------- |
| `app.js`                | ~85   | アプリ層ハブ (各ウィンドウの登録・更新・描画)        |
| `about.js`              | ~71   | ABOUT ダイアログ                                     |
| `breakout.js`           | ~1140 | BREAKOUT ウィンドウ (ブロック崩し)                   |
| `capture.js`            | ~530  | CAPTURE ウィンドウ (スクリーンキャプチャ + 動画撮影) |
| `game_utils.js`         | ~256  | ゲームアプリ共通ユーティリティ                       |
| `tessera.js`            | ~900  | TESSERA ウィンドウ (1-bit 生成的アート言語＋出力)    |
| `graze.js`              | ~840  | GRAZE ウィンドウ (弾幕サバイバル)                    |
| `notepad.js`            | ~145  | メモ帳ウィンドウ                                     |
| `settings.js`           | ~400  | 設定ウィンドウ (パレット/壁紙/解像度)                |
| `vram_dump.js`          | ~400  | VRAM ダンプ (開発・デバッグ用, BIN/HEX/RLE)          |
| `studio/studio.js`      | ~335  | STUDIO ウィンドウ (Transport + タブ切替)             |
| `studio/synth_panel.js` | ~560  | シンセサイザ UI (STUDIO 内 INST タブ)                |
| `studio/piano_roll.js`  | ~1100 | ピアノロールエディタ (STUDIO 内タブ)                 |

## 技術スタック

- **言語**: ES Modules (ES2020+), ビルドツールなし
- **描画**: `Uint8Array` VRAM (1-bit) → `Canvas putImageData`
- **音声**: Web Audio API (`OscillatorNode` + `GainNode`)
- **録画**: MediaRecorder API (MP4/WebM) + `canvas.captureStream()`
- **永続化**: `localStorage`
- **エントリ**: `index.html` → `<script type="module" src="./js/kernel.js">`

## 開発メモ

- すべてのモジュールには先頭に JSDoc ヘッダーコメントがあります
- `ui/` と `wm/` は `index.js` ファサードを通じてアクセスしてください
- 副作用インポート (`import "./xxx.js"`) は `app/app.js` でのウィンドウ登録のみ
- V2 では TypeScript への移行を予定しています

