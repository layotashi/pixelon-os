# assets/ — アセット管理

PIXERA OS が使うビジュアルアセット (カーソル・アイコン・フォント) を格納する。

## 構成

```
assets/
  cursors/          カーソル画像 + manifest.json
  icons/            UI アイコン + manifest.json
  icons-text/       テキスト表示用の特殊記号 (中点・改行矢印等) + manifest.json
  app-icons/        デスクトップ用アプリアイコン + manifest.json
  fish/             AQUARIA 用エンゼルフィッシュ・スプライト + manifest.json
  font/             ビットマップフォント PNG (どれを使うかは config.js の FONTS が参照)
  favicon.png       ブラウザタブ用アイコン
```

## manifest 駆動 (SSoT)

各フォルダの `manifest.json` がアセット定義の唯一の出所。JS 側 (`core/cursor.js` /
`icon.js` / `text_icon.js` / `app_icon.js` / `fish.js`) はこれを `fetch` し、記載された PNG を動的に読む。

- `format` — そのフォルダ共通の寸法 (`width`/`height`) とエンコーディング。
  **寸法・しきい値の正は manifest**。README には書き写さない。
- 各エントリ — 論理名 → `file` (PNG 名) ＋ `description` (生成 AI 向けの説明文)。
  カーソルは `hotX`/`hotY` (ホットスポット) も持つ。

PNG は明度しきい値で 1-bit 化する。エンコーディングは 2 系統:

- `1bit-white-fg` — 白=前景 / 黒=透過。icons 系。
- `3level` — 白=前景 / 灰=アウトライン / 黒=透過。cursors・app-icons。
  bg→fg の 2 パス描画で任意背景でも視認できる。

正確なしきい値は各 manifest の `format.description` を参照。

## アセット追加手順

1. PNG を該当フォルダに置く (寸法は manifest の `format` に合わせる)
2. `manifest.json` にエントリを追加 (`file` / `description` / カーソルは `hotX`/`hotY`)
3. JS の変更は不要 (manifest 駆動で自動認識される)

## 命名規則

- ファイル名 = 論理名 + `.png` (共通)
- アイコン名: **描かれるモノ・概念ベース** (`arrow-down`, `close`, `note-quarter`)
- カーソル名: **役割 (用途) ベース**。「何の形か」ではなく「何を意味するか」で命名する。
  小文字・ハイフン区切り。

### カーソル命名の詳細

グリフの見た目ではなく、そのカーソルが利用者に伝える操作で名付ける
(手の絵でも `hand` ではなく役割の `pointer`、四方向矢印でも `arrows` ではなく `move`)。

- **基語 = 操作**: `default` / `pointer` / `move` / `resize` / `drag` …
- **方向の限定子** (操作が軸を持つとき):
  - リサイズ (両矢印の 4 軸) は**コンパス表記**: `resize-ns` / `resize-ew` /
    `resize-nesw` / `resize-nwse`。
  - 2 値のドラッグハンドル (スクロールバー等) は `-h` / `-v`: `drag-h` / `drag-v`。
- **修飾バリアント** (基本操作の派生) は修飾語を後置: `move-copy`
  (= `move` しながら複製する Ctrl+ドラッグ)。

> 新しいカーソルは、まず伝えたい操作 (基語) を決め、必要なら上記の限定子・修飾語を足す。
> グリフの向きや絵柄そのものを名前にしない。
