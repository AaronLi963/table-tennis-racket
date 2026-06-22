/**
 * 純 TypeScript 的 radix-2 Cooley–Tukey FFT，無外部依賴。
 * 以 Float64Array 就地運算，輸入長度必須為 2 的次方。
 */

/** 回傳 >= n 的最小 2 次方 */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * 就地 FFT / IFFT。
 * @param re 實部（長度需為 2 的次方）
 * @param im 虛部（同長度，可為全 0）
 * @param inverse true 為逆轉換（會除以 N）
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`FFT length must be a power of 2, got ${n}`);
  }

  // 位元反轉重排
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vRe = re[b] * wRe - im[b] * wIm;
        const vIm = re[b] * wIm + im[b] * wRe;
        re[b] = re[a] - vRe;
        im[b] = im[a] - vIm;
        re[a] += vRe;
        im[a] += vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/**
 * 計算實數訊號的單邊幅度頻譜。
 * @returns 長度 fftSize/2 + 1 的幅度陣列（bin i 對應 i*sampleRate/fftSize Hz）
 */
export function magnitudeSpectrum(signal: Float64Array, fftSize: number): Float64Array {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const n = Math.min(signal.length, fftSize);
  re.set(signal.subarray(0, n));
  fft(re, im, false);
  const half = fftSize / 2;
  const mag = new Float64Array(half + 1);
  for (let i = 0; i <= half; i++) {
    mag[i] = Math.hypot(re[i], im[i]);
  }
  return mag;
}

/** bin 索引 → 頻率 (Hz) */
export function binToHz(bin: number, fftSize: number, sampleRate: number): number {
  return (bin * sampleRate) / fftSize;
}
