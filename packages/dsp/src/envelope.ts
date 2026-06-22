/** 解析訊號（Hilbert 變換）包絡與 FFT 帶通濾波。 */
import { fft, nextPow2 } from './fft.js';

/**
 * 透過 Hilbert 變換取得解析訊號的振幅包絡。
 * 作法：FFT → 將負頻歸零、正頻加倍（DC 與 Nyquist 保持）→ IFFT → 取模。
 */
export function analyticEnvelope(signal: Float64Array): Float64Array {
  const len = signal.length;
  const n = nextPow2(len);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(signal);

  fft(re, im, false);

  const half = n >> 1;
  // 正頻（1..half-1）加倍，負頻（half+1..n-1）歸零，DC 與 Nyquist 不變
  for (let i = 1; i < half; i++) {
    re[i] *= 2;
    im[i] *= 2;
  }
  for (let i = half + 1; i < n; i++) {
    re[i] = 0;
    im[i] = 0;
  }

  fft(re, im, true); // 逆轉換 → 解析訊號 (re, im)

  const env = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    env[i] = Math.hypot(re[i], im[i]);
  }
  return env;
}

/**
 * 以 FFT 做理想帶通濾波，回傳與輸入等長的實數訊號。
 * 用於在量測模態衰減前，將訊號限制在主共振附近。
 */
export function bandpass(
  signal: Float64Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): Float64Array {
  const len = signal.length;
  const n = nextPow2(len);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(signal);

  fft(re, im, false);

  const binLow = Math.floor((lowHz * n) / sampleRate);
  const binHigh = Math.ceil((highHz * n) / sampleRate);
  for (let i = 0; i <= n / 2; i++) {
    const keep = i >= binLow && i <= binHigh;
    if (!keep) {
      re[i] = 0;
      im[i] = 0;
      // 同步歸零對稱的負頻 bin
      const mirror = (n - i) % n;
      re[mirror] = 0;
      im[mirror] = 0;
    }
  }

  fft(re, im, true);

  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) out[i] = re[i];
  return out;
}
