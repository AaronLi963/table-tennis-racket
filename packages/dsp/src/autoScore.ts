/**
 * 自動（相對）評分：在沒有真實標籤的情況下，由「整個收藏」自動產生分數。
 *
 * 計算方式參考 踢猫Boll「我量化了乒乓球底板性能」：以**質量修正剛度**評估硬度，
 * 而非只看頻率。對板狀物，撓曲剛度 E ∝ f²·m，故同樣音高下越重者越剛。
 * 取兩個振動模態：
 *   - E1 = f1²·m（一階模態）→ 軟硬度
 *   - E4 = f4²·m（四階模態）→ 底勁（高頻、大力下的支撐）
 * 彈性則用品質因子 Q（餘音越長、損耗越小越彈）。
 *
 * 每支球拍的指標相對於收藏分布做標準分數（z-score），再映射到 0–100
 * （50 = 收藏平均，±3σ ≈ 0 與 100）。樣本越多越穩定。
 */
import type { FeatureStats, FeatureVector, PopulationStats, Scores } from '@ttr/shared';

/** ±3σ 對應 0..100，故每 1σ = 100/6 分 */
const SPREAD = 100 / 6;
/** 缺重量時的預設值 (g)，約為一般底板裸板重量 */
const DEFAULT_WEIGHT_G = 85;

/** 一支球拍的評分輸入：特徵 + 重量（可缺） */
export interface RacketSample {
  features: FeatureVector;
  weight?: number | null;
}

function stat(values: number[]): FeatureStats {
  const n = values.length || 1;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance) };
}

function median(values: number[]): number {
  if (values.length === 0) return DEFAULT_WEIGHT_G;
  const a = [...values].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** 一階模態頻率 f1：最低的顯著模態，退而用 f0 */
function f1Of(f: FeatureVector): number {
  return f.modalFreqs && f.modalFreqs.length > 0 ? f.modalFreqs[0] : f.f0;
}

/** 高階（四階）模態頻率 f4；缺則以頻譜質心作為高頻代表，再退用 f0 */
function f4Of(f: FeatureVector): number {
  if (f.modalFreqs && f.modalFreqs.length >= 4) return f.modalFreqs[3];
  return f.spectralCentroid > 0 ? f.spectralCentroid : f.f0;
}

function effectiveWeight(weight: number | null | undefined, fallback: number): number {
  return weight && weight > 0 ? weight : fallback;
}

/** 質量修正剛度 E = f²·m（÷1e6 只為讓數值好讀，z-score 後與尺度無關） */
function rigidity(freqHz: number, weightG: number): number {
  return (freqHz * freqHz * weightG) / 1e6;
}

/** 由一支球拍算出三個原始指標 E1 / E4 / Q */
function indicesOf(sample: RacketSample, fallbackWeight: number): { e1: number; e4: number; q: number } {
  const m = effectiveWeight(sample.weight, fallbackWeight);
  return {
    e1: rigidity(f1Of(sample.features), m),
    e4: rigidity(f4Of(sample.features), m),
    q: sample.features.q,
  };
}

/** 由收藏中所有球拍（特徵 + 重量）擬合母體統計。 */
export function fitPopulation(samples: RacketSample[]): PopulationStats {
  const weights = samples
    .map((s) => s.weight)
    .filter((w): w is number => typeof w === 'number' && w > 0);
  const fallbackWeight = median(weights);
  const idx = samples.map((s) => indicesOf(s, fallbackWeight));
  return {
    sampleCount: samples.length,
    fallbackWeight,
    e1: stat(idx.map((i) => i.e1)),
    e4: stat(idx.map((i) => i.e4)),
    q: stat(idx.map((i) => i.q)),
  };
}

function z(value: number, s: FeatureStats): number {
  return s.std < 1e-9 ? 0 : (value - s.mean) / s.std;
}

function toScore(zScore: number): number {
  return Math.max(0, Math.min(100, 50 + SPREAD * zScore));
}

/**
 * 以母體統計把單支球拍轉成相對分數（0–100）。
 * - 軟硬度 ← E1（一階質量修正剛度）
 * - 底勁 ← E4（高階質量修正剛度，校正估計）
 * - 彈性 ← Q（餘音 / 能量回彈）
 */
export function scoreWithPopulation(
  stats: PopulationStats,
  features: FeatureVector,
  weight?: number | null,
): Scores {
  const i = indicesOf({ features, weight }, stats.fallbackWeight);
  return {
    hardness: toScore(z(i.e1, stats.e1)),
    elasticity: toScore(z(i.q, stats.q)),
    lowEndSupport: toScore(z(i.e4, stats.e4)),
  };
}
