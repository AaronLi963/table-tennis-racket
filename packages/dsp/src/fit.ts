/** 指數衰減擬合：從振幅包絡求時間常數 τ。 */

export interface DecayFit {
  /** 時間常數 τ (s)，env(t) ≈ A·exp(-t/τ) */
  tau: number;
  /** 初始振幅 A */
  amplitude: number;
  /** 擬合決定係數 R²（0–1，越接近 1 越可信） */
  r2: number;
}

/**
 * 對振幅包絡擬合 env(t) = A·exp(-t/τ)。
 * 取包絡峰值之後、仍高於噪音門檻的衰減段，於對數域做線性最小二乘。
 *
 * @param envelope 振幅包絡（非負）
 * @param sampleRate Hz
 */
export function fitExponentialDecay(envelope: Float64Array, sampleRate: number): DecayFit {
  const n = envelope.length;
  if (n < 4) return { tau: 0, amplitude: 0, r2: 0 };

  // 找包絡峰值
  let peakIdx = 0;
  let peakVal = envelope[0];
  for (let i = 1; i < n; i++) {
    if (envelope[i] > peakVal) {
      peakVal = envelope[i];
      peakIdx = i;
    }
  }
  if (peakVal <= 0) return { tau: 0, amplitude: 0, r2: 0 };

  // 衰減段：峰值之後，直到掉到峰值的 ~5%（即 ~3τ 範圍）
  const floor = peakVal * 0.05;
  // 在對數域做加權最小二乘：t（秒）對 ln(env)
  let sw = 0;
  let swx = 0;
  let swy = 0;
  let swxx = 0;
  let swxy = 0;
  let count = 0;
  for (let i = peakIdx; i < n; i++) {
    const v = envelope[i];
    if (v <= floor) break;
    const t = (i - peakIdx) / sampleRate;
    const y = Math.log(v);
    // 以振幅平方為權重，讓較大（較可信）的早期樣本主導
    const w = v * v;
    sw += w;
    swx += w * t;
    swy += w * y;
    swxx += w * t * t;
    swxy += w * t * y;
    count++;
  }
  if (count < 3) return { tau: 0, amplitude: peakVal, r2: 0 };

  const denom = sw * swxx - swx * swx;
  if (Math.abs(denom) < 1e-20) return { tau: 0, amplitude: peakVal, r2: 0 };

  const slope = (sw * swxy - swx * swy) / denom; // = -1/τ
  const intercept = (swy - slope * swx) / sw;

  if (slope >= 0) {
    // 沒有衰減（可能是噪音或持續訊號）
    return { tau: Infinity, amplitude: Math.exp(intercept), r2: 0 };
  }
  const tau = -1 / slope;

  // 計算加權 R²
  const meanY = swy / sw;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = peakIdx; i < n; i++) {
    const v = envelope[i];
    if (v <= floor) break;
    const t = (i - peakIdx) / sampleRate;
    const y = Math.log(v);
    const w = v * v;
    const pred = intercept + slope * t;
    ssRes += w * (y - pred) * (y - pred);
    ssTot += w * (y - meanY) * (y - meanY);
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { tau, amplitude: Math.exp(intercept), r2 };
}
