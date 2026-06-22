/**
 * 瀏覽器端的音訊擷取（Phase 1）。實作 @ttr/shared 的 AudioBufferData 產出。
 * Phase 2 行動 App 會以原生錄音替換本檔，DSP 與 API 不變。
 *
 * 注意：麥克風刻意關閉 AGC / 降噪 / 回音消除，避免破壞敲擊瞬態與衰減特性。
 */
import type { AudioBufferData } from '@ttr/shared';

/** 解碼上傳的音訊檔（取單聲道） */
export async function decodeAudioFile(file: File): Promise<AudioBufferData> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(arrayBuffer);
    const pcm = new Float32Array(buf.getChannelData(0)); // 複製，避免 ctx 關閉後失效
    return { pcm, sampleRate: buf.sampleRate };
  } finally {
    void ctx.close();
  }
}

/** 麥克風錄音器：start() 後持續收集 PCM，stop() 回傳整段。 */
export class MicRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 44100;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.ctx = new AudioContext();
    this.sampleRate = this.ctx.sampleRate;
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.processor.onaudioprocess = (e) => {
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
  }

  async stop(): Promise<AudioBufferData> {
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx) await this.ctx.close();

    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const pcm = new Float32Array(total);
    let offset = 0;
    for (const c of this.chunks) {
      pcm.set(c, offset);
      offset += c.length;
    }
    const result: AudioBufferData = { pcm, sampleRate: this.sampleRate };
    this.ctx = null;
    this.stream = null;
    this.processor = null;
    this.chunks = [];
    return result;
  }
}
