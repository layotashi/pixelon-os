# audio/ — SYNESTA 専用オーディオ層

> **アーカイブ**: SYNESTA (旧 DAW) は再設計のためアーカイブされ、`kernel.js` / `app.js`
> からの読み込みを外した。このディレクトリは参照用に残す (実行時には読み込まれない)。
> 音声**基盤** (`core/audio.js`) は現役で、新しい音楽アプリ (`app/synth/` 等) が利用する。

SYNESTA (DAW) 固有の再生エンジンとトランスポート UI。オーディオ**基盤**
(AudioContext・SynthChannel・波形生成・SFX・音楽ユーティリティ) は `core/audio.js`
にあり、このディレクトリは SYNESTA 固有のモジュールのみ。

## 依存

```
playback_engine.js → config.js, core/audio.js        (UI 非依存)
transport.js       → playback_engine.js, config.js, core/input, core/icon, ui/
```

## モジュール

- `playback_engine.js` — 再生エンジン。look-ahead スケジューラ、メトロノーム、
  WAV オフラインレンダリング (`renderToBuffer`)。UI 非依存で、トラックデータは
  DI で受け取る
- `transport.js` — トランスポート UI (再生/停止/BPM/ループ)。SYNESTA ウィンドウ内に配置

## 設計原則

- **エンジンと UI の分離**: `playback_engine.js` は画面描画に一切関与しない。
- **DI**: ピアノロールのトラックデータは `transportSetPianoRollCallbacks()` で注入される。
- **基盤は core/**: AudioContext / SynthChannel / SFX は `core/audio.js` が提供する。
