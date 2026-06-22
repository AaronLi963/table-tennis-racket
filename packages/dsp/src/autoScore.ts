/**
 * 自動（相對）評分：在沒有真實標籤的情況下，由「整個收藏」自動產生分數。
 *
 * 作法：把每支球拍的物理特徵相對於收藏的分布做標準分數（z-score），
 * 再線性映射到 0–100（50 = 收藏平均，±3σ ≈ 0 與 100）。
 * 因此分數是「相對於你自己這批球拍」的位置，樣本越多越穩定。
 */
import type { FeatureStats, FeatureVector, PopulationStats, Scores } from '@ttr/shared';

/** ±3σ 對應 0..100，故每 1σ = 100/6 分 */
const SPREAD = 100 / 6;

/** 底勁（非線性、無法直接量測）的啟發式權重：剛度 + 低頻支撐 + 餘音 */
const LOW_END_WEIGHTS = { f0: 0.5, lowHighEnergyRatio: 0.3, q: 0.2 } as const;

function stat(values: number[]): FeatureStats {
  const n = values.length || 1;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance) };
}

/** 由收藏中所有球拍的特徵擬合母體統計。 */
export function fitPopulation(features: FeatureVector[]): PopulationStats {
  return {
    sampleCount: features.length,
    f0: stat(features.map((f) => f.f0)),
    q: stat(features.map((f) => f.q)),
    lowHighEnergyRatio: stat(features.map((f) => f.lowHighEnergyRatio)),
  };
}

function z(value: number, s: FeatureStats): number {
  return s.std < 1e-9 ? 0 : (value - s.mean) / s.std;
}

function toScore(zScore: number): number {
  return Math.max(0, Math.min(100, 50 + SPREAD * zScore));
}

/**
 * 以母體統計把單支球拍的特徵轉成相對分數（0–100）。
 * - 軟硬度 ← f0（越高越硬）
 * - 彈性 ← Q（餘音越長越彈）
 * - 底勁 ← f0 + 低/高頻能量比 + Q 的加權（校正估計）
 */
export function scoreWithPopulation(stats: PopulationStats, f: FeatureVector): Scores {
  const zf0 = z(f.f0, stats.f0);
  const zq = z(f.q, stats.q);
  const zr = z(f.lowHighEnergyRatio, stats.lowHighEnergyRatio);
  const zLowEnd =
    LOW_END_WEIGHTS.f0 * zf0 +
    LOW_END_WEIGHTS.lowHighEnergyRatio * zr +
    LOW_END_WEIGHTS.q * zq;
  return {
    hardness: toScore(zf0),
    elasticity: toScore(zq),
    lowEndSupport: toScore(zLowEnd),
  };
}
