# assets/ — アセット管理

SYNESTA が使用するすべてのビジュアルアセット (アイコン・カーソル・フォント・ロゴ) を格納します。

## フォルダ構成

```
assets/
  cursors/          カーソル画像 (15×15 px, 3 階調)
    manifest.json   カーソル定義 (ファイル名・ホットスポット・説明)
    *.png           個別カーソル PNG
  icons/            アイコン画像 (7×7 px, 1-bit)
    manifest.json   アイコン定義 (ファイル名・説明)
    *.png           個別アイコン PNG
  icons-text/       テキスト用アイコン (5×7 px, 1-bit)
    manifest.json   テキストアイコン定義
    *.png           個別テキストアイコン PNG
  font/             ビットマップフォント
    font.png        ASCII 95 グリフスプライトシート (5×7 px/グリフ)
```

## マニフェスト仕様

各フォルダの `manifest.json` がアセット定義のマスターファイルです。  
JS コードはマニフェストを `fetch` し、記載された PNG を動的に読み込みます。

### icons/manifest.json

```jsonc
{
  "format": {
    "width": 7, // アイコン幅 (px)
    "height": 7, // アイコン高さ (px)
    "encoding": "1bit-white-fg",
    "description": "White pixel (R>=128) = foreground, black = transparent",
  },
  "icons": {
    "<論理名>": {
      "file": "<ファイル名>.png",
      "description": "アイコンの説明文 (生成AI向け)",
    },
  },
}
```

### cursors/manifest.json

```jsonc
{
  "format": {
    "width": 15,
    "height": 15,
    "encoding": "3level",
    "description": "White (R>=192) = foreground, gray (64<=R<192) = outline, black = transparent",
  },
  "cursors": {
    "<論理名>": {
      "file": "<ファイル名>.png",
      "hotX": 7, // ホットスポット X
      "hotY": 7, // ホットスポット Y
      "description": "カーソルの説明文",
    },
  },
}
```

## アイコン・カーソルの追加手順

1. 個別 PNG ファイルを該当フォルダに配置
2. `manifest.json` にエントリを追加 (`file`, `description` 等)
3. JS コード側の変更は不要 (マニフェスト駆動のため自動認識)

## ピクセルエンコーディング

| エンコーディング | 前景    | 背景/アウトライン | 透過    |
| ---------------- | ------- | ----------------- | ------- |
| `1bit-white-fg`  | R ≥ 128 | —                 | R < 128 |
| `3level`         | R ≥ 192 | 64 ≤ R < 192      | R < 64  |

## 命名規則

- **アイコン名**: 描かれている「モノ・概念」ベース (例: `arrow-down`, `check`, `note-quarter`)
- **カーソル名**: 用途ベース、ハイフン区切り (例: `resize-ew`, `drag-h`)
- ファイル名 = 論理名 + `.png` (現状は 1:1 対応)

