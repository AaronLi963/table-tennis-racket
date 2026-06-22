/** 敲擊瞬態（onset）偵測與切段。 */

export interface Onset {
  /** onset 樣本索引 */
  index: number;
  /** 該敲擊的峰值幅度 */
  peak: number;
}

/**
 * 以短時能量包絡偵測敲擊。回傳依時間排序的 onset 列表。
 *
 * @param signal 已去 DC 的訊號
 * @param sampleRate Hz
 */
export function detectOnsets(signal: Float64Array, sampleRate: number): Onset[] {
  const n = signal.length;
  if (n === 0) return [];

  // 短時能量包絡（~3ms 窗）
  const win = Math.max(1, Math.round(sampleRate * 0.003));
  const env = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += signal[i] * signal[i];
    if (i >= win) acc -= signal[i - win] * signal[i - win];
    env[i] = Math.sqrt(acc / Math.min(i + 1, win));
  }

  // 噪音底估計（前 30ms 或前 10% 的中位數）與全域峰值
  const noiseLen = Math.min(n, Math.max(win, Math.round(sampleRate * 0.03)));
  const noiseFloor = median(env.subarray(0, noiseLen));
  let envMax = 0;
  for (let i = 0; i < n; i++) if (env[i] > envMax) envMax = env[i];

  // 門檻：噪音底與峰值之間
  const threshold = Math.max(noiseFloor * 4, envMax * 0.2);
  const minGap = Math.round(sampleRate * 0.05); // 兩次敲擊至少間隔 50ms

  const onsets: Onset[] = [];
  let i = 0;
  while (i < n) {
    if (env[i] >= threshold) {
      // 找此段的局部峰值
      let peakIdx = i;
      let peakVal = env[i];
      let j = i;
      while (j < n && env[j] >= threshold * 0.5) {
        if (env[j] > peakVal) {
          peakVal = env[j];
          peakIdx = j;
        }
        j++;
      }
      // onset 取超過門檻的起點
      onsets.push({ index: i, peak: peakAbs(signal, i, Math.min(j, peakIdx + win)) });
      i = Math.max(j, peakIdx + minGap);
    } else {
      i++;
    }
  }
  return onsets;
}

/**
 * 取出主要敲擊的分析窗：自最強 onset 起算 durationSec 秒。
 * @returns { start, signal } 切出的段
 */
export function extractMainTap(
  signal: Float64Array,
  onsets: Onset[],
  sampleRate: number,
  durationSec = 0.4,
): { start: number; segment: Float64Array } {
  if (onsets.length === 0) {
    return { start: 0, segment: signal };
  }
  // 最強的敲擊
  let strongest = onsets[0];
  for (const o of onsets) if (o.peak > strongest.peak) strongest = o;

  const len = Math.round(sampleRate * durationSec);
  const start = strongest.index;
  const end = Math.min(signal.length, start + len);
  return { start, segment: signal.subarray(start, end) };
}

function peakAbs(signal: Float64Array, start: number, end: number): number {
  let m = 0;
  for (let i = start; i < Math.min(end, signal.length); i++) {
    const a = Math.abs(signal[i]);
    if (a > m) m = a;
  }
  return m;
}

function median(arr: ArrayLike<number>): number {
  const a = Array.from(arr).sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
