# audio/ — STUDIO 専用オーディオ層

STUDIO (DAW) 固有の再生エンジン・トランスポート UI を提供します。

> \*\*オーディオ基盤 (AudioContext・SynthChannel・波形生成・SFX ヘルパー・音楽ユーティリティ) は
> `core/audio.js` に移動済みです。このディレクトリには STUDIO 固有のモジュールのみ残っています。

## 依存関係

```
playback_engine.js → config.js, core/audio.js
transport.js       → playback_engine.js, config.js, core/input.js, core/icon.js, ui/
```

**UI 依存の分離**: `playback_engine.js` は UI に一切依存しません。  
UI 表示は `transport.js` に完全分離されています。

## モジュール一覧

### playback_engine.js — 再生エンジン (~630 行)

ピアノロールの look-ahead スケジューリングと WAV オフラインレンダリングを担当する純粋オーディオモジュールです。  
UI ウィジェットへの依存はゼロで、コールバック注入 (DI) で外部データを受け取ります。

**スケジューリング方式:**

- `SCHEDULE_AHEAD` (100ms) 先読み + `SCHEDULE_INTERVAL` (25ms) チック間隔
- `setInterval` ベースで `AudioContext.currentTime` と比較し、正確なタイミングで発音

**DI:**

- `transportSetPianoRollCallbacks({ getTracks, setPlayheadPos })` — ピアノロールデータへのアクセスを注入

**主要 API:**

- `startPlayback()` / `pausePlayback()` / `stopPlayback()` — 再生制御
- `togglePlayPause()` — 再生/一時停止トグル
- `updatePlayhead()` — フレーム毎のプレイヘッド位置更新
- `setBpm(v)` — BPM 設定
- `getCurrentStep()` — 現在のステップ位置
- `setLoopStart(s)` / `setLoopEnd(e)` — ループ範囲設定
- `stepToPos(step)` / `posToStep(bar, beat, step)` / `formatPos(step)` — 位置変換ユーティリティ
- `pb*` — 状態取得ゲッター群 (`pbIsPlaying`, `pbIsPaused`, `pbGetBpm` 等)
- `resetPlaybackEngine()` — エンジン状態リセット (停止 + BPM/ループ等の初期化)
- `renderToBuffer(opts?)` — ループ範囲のノートを PCM Float32Array にオフラインレンダリング (WAV Export 用)

**renderToBuffer:**

Web Audio API を使わず、`sampleWaveformFn` + ADSR エンベロープをサンプル単位で算術合成する純粋関数。  
`studio.js` の EXPORT WAV ボタンから呼ばれ、`encodeWav` → `writeFileBinary` で VFS に保存される。  
オプションで `sampleRate`, `startStep`, `endStep` を指定可能。

### transport.js — トランスポート UI (~405 行)

STUDIO ウィンドウ内に配置されるトランスポート操作パネルです。  
再生/停止/BPM/ループ範囲の UI ウィジェットを描画・更新します。

**主要 API:**

- `drawTransport(x, y)` — トランスポートバー描画
- `onTransportInput(x, y, w, h)` — 入力処理
- `measureTransport()` — 必要幅の計測
- `updateTransport()` — フレーム毎の状態更新
- `isTransportPlaying()` — 再生中か判定
- `resetTransport()` — UI ウィジェット状態リセット (BPM/ループ/ボタン等)

## 設計原則

- **エンジンと UI の分離**: `playback_engine.js` は画面描画に一切関与しない
- **DI パターン**: ピアノロールのトラックデータは `kernel.js` から注入される
- **オーディオ基盤は core/ 層**: AudioContext / SynthChannel / SFX は `core/audio.js` が提供

