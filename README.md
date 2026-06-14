# SYNESTA v0.2.0

> 1-bit Desktop DAW — ブラウザ上で動作するチップチューン風デスクトップ環境

## 概要

SYNESTA は、ブラウザ上で動作する **1-bit (2色) レンダリングのデスクトップ DAW プロトタイプ**です。  
Canvas 2D に自作ソフトウェアレンダラで描画し、Web Audio API でチップチューン風音声合成を行います。

## 起動方法

ビルド不要です。ローカルの HTTP サーバーで配信し、ブラウザで `index.html` を開いてください。

```bash
# 例: Python の簡易サーバー
python -m http.server 8080
```

## 技術スタック

| レイヤ       | 技術                                               |
| ------------ | -------------------------------------------------- |
| 言語         | Vanilla JavaScript (ES2020+, ES Modules)           |
| レンダリング | `<canvas>` + `Uint8Array` VRAM + `Uint32Array` LUT |
| 音声         | Web Audio API (`AudioBufferSourceNode` ループ再生) |
| 永続化       | `localStorage`（外観設定のみ）                     |
| ビルド       | なし（ブラウザ直接読み込み）                       |

## ディレクトリ構成

```
index.html          ← エントリポイント (HTML)
js/                 ← 全 JavaScript モジュール
  kernel.js          ← ブートストラップ / メインループ / DI 配線
  config.js          ← グローバル設定・定数
  splash.js          ← スプラッシュスクリーン (ブート演出)
  core/              ← 描画・入力・フォント・ストレージ等のインフラ
  audio/             ← シンセ・再生エンジン・トランスポート UI
  ui/                ← ウィジェットライブラリ (ボタン・スライダー等)
  wm/                ← OS 風ウィンドウマネージャ
  app/               ← 各アプリケーションウィンドウ
assets/             ← フォント・アイコン・カーソル等の画像アセット
```

各ディレクトリの詳細は配下の `README.md` を参照してください。

## ドキュメント

- [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md) — **製品コンセプト・対象ユーザー・設計原則**
- [js/README.md](js/README.md) — モジュール構成・アーキテクチャ・DI パターン
- [js/core/README.md](js/core/README.md) — 描画・入力・ストレージ等のインフラ層
- [js/audio/README.md](js/audio/README.md) — シンセ・再生エンジン・トランスポート
- [js/ui/README.md](js/ui/README.md) — ウィジェットライブラリ
- [js/wm/README.md](js/wm/README.md) — ウィンドウマネージャ
- [js/app/README.md](js/app/README.md) — アプリケーション層

