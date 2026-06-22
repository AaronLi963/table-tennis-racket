/** 量測品質評估：SNR、削波、敲擊次數，產生中文提示。 */
import type { QualityMetrics } from '@ttr/shared';
import type { Onset } from './onset.js';
import { rms } from './window.js';

/**
 * 評估一段擷取的品質。
 * @param signal 已去 DC 的分析訊號
 * @param raw 原始 PCM（用於削波偵測，未正規化）
 * @param onsets detectOnsets 的結果
 */
export function assessQuality(
  signal: Float64Array,
  raw: Float32Array,
  onsets: Onset[],
  sampleRate: number,
): QualityMetrics {
  const warnings: string[] = [];

  // 削波偵測
  let clippedSamples = 0;
  for (let i = 0; i < raw.length; i++) {
    if (Math.abs(raw[i]) >= 0.99) clippedSamples++;
  }
  const clipped = clippedSamples > 3;
  if (clipped) warnings.push('訊號削波（音量過大），請降低麥克風增益或敲輕一點。');

  // 敲擊次數
  const onsetCount = onsets.length;
  if (onsetCount === 0) warnings.push('沒有偵測到敲擊，請靠近麥克風並敲面材中心。');

  // SNR：主敲擊後 50ms 的能量 vs 敲擊前的噪音底
  let snrDb = 0;
  if (onsetCount > 0) {
    let strongest = onsets[0];
    for (const o of onsets) if (o.peak > strongest.peak) strongest = o;
    const idx = strongest.index;

    const noiseEnd = Math.max(0, idx - Math.round(sampleRate * 0.005));
    const noiseStart = Math.max(0, noiseEnd - Math.round(sampleRate * 0.03));
    const noiseRms = noiseStart < noiseEnd ? rms(signal, noiseStart, noiseEnd) : 1e-6;

    const tapEnd = Math.min(signal.length, idx + Math.round(sampleRate * 0.05));
    const tapRms = rms(signal, idx, tapEnd);

    snrDb = 20 * Math.log10((tapRms + 1e-12) / (noiseRms + 1e-12));
    if (snrDb < 20) warnings.push('訊雜比偏低，環境偏吵或敲擊太輕，建議在安靜處重敲。');
  }

  // 整體品質分數（0–1）
  let quality = 1;
  if (onsetCount === 0) quality = 0;
  else {
    const snrScore = clamp01((snrDb - 10) / 30); // 10dB→0, 40dB→1
    const clipScore = clipped ? 0.4 : 1;
    quality = clamp01(snrScore * clipScore);
  }

  return { snrDb, clipped, onsetCount, quality, warnings };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
