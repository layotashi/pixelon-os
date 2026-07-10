/**
 * pcm_recorder_worklet.js — マスターバスの PCM をそのまま取り出す AudioWorkletProcessor。
 *
 * 録画用にマスターチェーン (limiter) の出力を横取りしてモノラル PCM を溜める。
 * MediaStreamAudioDestinationNode + MediaRecorder と違い、
 *   - サンプル数が 1 つも欠けない (レンダークォンタム単位で必ず数える)
 *   - 先頭サンプルのオーディオ時刻 (currentTime) を主スレッドへ通知できる
 * ため、映像フレーム番号をこのサンプル時計に従わせられる (core/av_sync.js)。
 *
 * このファイルは AudioWorkletGlobalScope で評価される。ES モジュール import は使えず、
 * currentTime / sampleRate / registerProcessor はグローバルとして与えられる。
 * audio.js から `ctx.audioWorklet.addModule()` で読み込む。
 *
 * 出力は常に無音。グラフから pull されるためだけに 1 出力を持ち、呼び側が
 * gain 0 のノード経由で destination へ繋ぐ。
 *
 * port プロトコル:
 *   ← { type: "start", startTime }   最初の process() 時のオーディオ時刻 (= サンプル 0 の時刻)
 *   ← { type: "pcm", samples }       Float32Array (transferable)
 *   ← { type: "stopped" }            "stop" 受領後、残りを flush してから
 *   → "stop"                          録音終了
 */

/** 主スレッドへ送る 1 チャンクのフレーム数 (約 21ms @48kHz — postMessage の頻度を抑える) */
const CHUNK_FRAMES = 1024;

/** レンダークォンタムのフレーム数 (入力が無音で切断されている場合の既定) */
const RENDER_QUANTUM = 128;

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(CHUNK_FRAMES);
    this._n = 0;
    this._started = false;
    this._stopped = false;
    this.port.onmessage = (e) => {
      if (e.data !== "stop" || this._stopped) return;
      this._stopped = true;
      this._flush();
      this.port.postMessage({ type: "stopped" });
    };
  }

  /** 溜まったぶんを主スレッドへ転送する (バッファは所有権ごと渡す) */
  _flush() {
    if (this._n === 0) return;
    const out = this._buf.slice(0, this._n);
    this._n = 0;
    this.port.postMessage({ type: "pcm", samples: out }, [out.buffer]);
  }

  _push(v) {
    this._buf[this._n++] = v;
    if (this._n === CHUNK_FRAMES) this._flush();
  }

  process(inputs) {
    if (this._stopped) return false; // ノードを終了させる

    const input = inputs[0];
    const ch0 = input && input.length > 0 ? input[0] : null;

    if (!this._started) {
      this._started = true;
      // currentTime は「このレンダークォンタムの先頭」の時刻 = 最初のサンプルの時刻。
      this.port.postMessage({ type: "start", startTime: currentTime });
    }

    if (!ch0) {
      // 上流が完全に無音のとき入力チャンネルが空で渡されることがある。
      // ここで数え落とすとサンプル時計が止まり、映像だけが先に進んでしまう。
      for (let i = 0; i < RENDER_QUANTUM; i++) this._push(0);
      return true;
    }

    const ch1 = input.length > 1 ? input[1] : null;
    for (let i = 0; i < ch0.length; i++) {
      this._push(ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i]);
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
