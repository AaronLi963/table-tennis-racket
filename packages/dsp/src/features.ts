/** 從幅度頻譜萃取頻域特徵（f0、模態峰、質心、能量分布）。 */
import type { ModePeak } from '@ttr/shared';
import { binToHz } from './fft.js';

/** 分析頻段（Hz）。桌球拍敲擊主要模態落在數百 Hz ~ 數 kHz。 */
export const ANALYSIS_BAND = { min: 150, max: 8000 } as const;
/** 區分「低頻 / 高頻」能量的界線 (Hz) */
export const LOW_HIGH_SPLIT_HZ = 1500;

export interface SpectralFeatures {
  f0: number;
  modes: ModePeak[];
  spectralCentroid: number;
  spectralSpread: number;
  lowHighEnergyRatio: number;
}

/**
 * 拋物線內插求精確峰值頻率。
 * @returns 相對 bin 的偏移量（-0.5 ~ 0.5）
 */
function parabolicOffset(yl: number, yc: number, yr: number): number {
  const denom = yl - 2 * yc + yr;
  if (Math.abs(denom) < 1e-20) return 0;
  return (0.5 * (yl - yr)) / denom;
}

/** 在頻譜中尋找局部峰值（已限制於分析頻段），依幅度排序 */
function findPeaks(
  mag: Float64Array,
  fftSize: number,
  sampleRate: number,
  maxPeaks: number,
): ModePeak[] {
  const binMin = Math.max(1, Math.floor((ANALYSIS_BAND.min * fftSize) / sampleRate));
  const binMax = Math.min(mag.length - 2, Math.ceil((ANALYSIS_BAND.max * fftSize) / sampleRate));

  const peaks: ModePeak[] = [];
  for (let i = binMin; i <= binMax; i++) {
    if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1]) {
      const offset = parabolicOffset(mag[i - 1], mag[i], mag[i + 1]);
      peaks.push({
        freq: binToHz(i + offset, fftSize, sampleRate),
        magnitude: mag[i],
      });
    }
  }
  peaks.sort((a, b) => b.magnitude - a.magnitude);
  return peaks.slice(0, maxPeaks);
}

/**
 * 從單邊幅度頻譜計算頻域特徵。
 * @param mag magnitudeSpectrum 的輸出（長度 fftSize/2 + 1）
 */
export function extractSpectralFeatures(
  mag: Float64Array,
  fftSize: number,
  sampleRate: number,
): SpectralFeatures {
  const peaks = findPeaks(mag, fftSize, sampleRate, 6);
  const f0 = peaks.length > 0 ? peaks[0].freq : 0;

  const binMin = Math.max(1, Math.floor((ANALYSIS_BAND.min * fftSize) / sampleRate));
  const binMax = Math.min(mag.length - 1, Math.ceil((ANALYSIS_BAND.max * fftSize) / sampleRate));

  // 頻譜質心與擴散（以幅度為權重）
  let sumMag = 0;
  let sumFMag = 0;
  let lowEnergy = 0;
  let highEnergy = 0;
  for (let i = binMin; i <= binMax; i++) {
    const f = binToHz(i, fftSize, sampleRate);
    const m = mag[i];
    sumMag += m;
    sumFMag += f * m;
    if (f < LOW_HIGH_SPLIT_HZ) lowEnergy += m * m;
    else highEnergy += m * m;
  }
  const centroid = sumMag > 0 ? sumFMag / sumMag : 0;

  let sumVar = 0;
  for (let i = binMin; i <= binMax; i++) {
    const f = binToHz(i, fftSize, sampleRate);
    sumVar += (f - centroid) * (f - centroid) * mag[i];
  }
  const spread = sumMag > 0 ? Math.sqrt(sumVar / sumMag) : 0;

  // 比值上限設 100，避免高頻能量趨近 0 時產生 Infinity（會破壞下游回歸）
  const rawRatio = highEnergy > 0 ? lowEnergy / highEnergy : lowEnergy > 0 ? 100 : 0;
  const lowHighEnergyRatio = Math.min(rawRatio, 100);

  return {
    f0,
    modes: peaks,
    spectralCentroid: centroid,
    spectralSpread: spread,
    lowHighEnergyRatio,
  };
}
