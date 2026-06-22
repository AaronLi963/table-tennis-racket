/** 視窗函數與基本訊號前處理工具。 */

/** 產生長度 n 的 Hann 視窗 */
export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

/** 移除直流分量（減去平均值），回傳新陣列 */
export function removeDc(signal: Float64Array): Float64Array {
  let mean = 0;
  for (let i = 0; i < signal.length; i++) mean += signal[i];
  mean /= signal.length || 1;
  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i] - mean;
  return out;
}

/** 以最大絕對值正規化到 [-1, 1]（全 0 時原樣回傳） */
export function normalizePeak(signal: Float64Array): Float64Array {
  let max = 0;
  for (let i = 0; i < signal.length; i++) {
    const a = Math.abs(signal[i]);
    if (a > max) max = a;
  }
  if (max === 0) return signal.slice();
  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i] / max;
  return out;
}

/** RMS 能量 */
export function rms(signal: Float64Array, start = 0, end = signal.length): number {
  let sum = 0;
  const n = end - start;
  if (n <= 0) return 0;
  for (let i = start; i < end; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / n);
}
