import { describe, it, expect } from 'vitest';
import type { FeatureVector, Scores } from '@ttr/shared';
import { fitCalibration, applyCalibration, type TrainingSample } from './calibration.js';

function feat(f0: number, q: number, ratio: number): FeatureVector {
  return {
    f0,
    modes: [],
    spectralCentroid: f0 * 1.2,
    spectralSpread: 300,
    lowHighEnergyRatio: ratio,
    tau: q / (Math.PI * f0),
    q,
    zeta: 1 / (2 * q),
  };
}

// 合成「真實」對應關係：硬度隨 f0、彈性隨 q、底勁隨低高頻比 上升
function trueScores(f0: number, q: number, ratio: number): Scores {
  return {
    hardness: 0.05 * f0,
    elasticity: 2.5 * q,
    lowEndSupport: 8 * ratio,
  };
}

describe('calibration', () => {
  const samples: TrainingSample[] = [
    [400, 8, 2],
    [600, 12, 4],
    [800, 16, 6],
    [1000, 20, 8],
    [1200, 24, 10],
  ].map(([f0, q, r]) => ({ features: feat(f0, q, r), scores: trueScores(f0, q, r) }));

  it('fits a model and recovers known scores on training data (within ridge shrinkage)', () => {
    const model = fitCalibration(samples);
    expect(model.sampleCount).toBe(5);

    // 嶺正則化會略為收縮擬合，容許小幅偏差
    for (const s of samples) {
      const pred = applyCalibration(model, s.features);
      expect(Math.abs(pred.hardness - s.scores.hardness)).toBeLessThan(3);
      expect(Math.abs(pred.elasticity - s.scores.elasticity)).toBeLessThan(3);
    }
  });

  it('predicts a held-out racket reasonably (interpolation)', () => {
    const model = fitCalibration(samples);
    const pred = applyCalibration(model, feat(700, 14, 5));
    // 介於 600 與 800 樣本之間
    expect(pred.hardness).toBeGreaterThan(28);
    expect(pred.hardness).toBeLessThan(42);
  });

  it('reports finite leave-one-out RMSE', () => {
    const model = fitCalibration(samples);
    expect(Number.isFinite(model.looRmse.hardness)).toBe(true);
    expect(model.looRmse.hardness).toBeLessThan(15);
  });

  it('clamps scores to 0–100', () => {
    const model = fitCalibration(samples);
    const pred = applyCalibration(model, feat(100000, 1000, 100));
    expect(pred.hardness).toBeLessThanOrEqual(100);
    expect(pred.hardness).toBeGreaterThanOrEqual(0);
  });

  it('throws with fewer than 2 samples', () => {
    expect(() => fitCalibration([samples[0]])).toThrow();
  });
});
