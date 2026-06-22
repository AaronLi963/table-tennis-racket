import { describe, it, expect } from 'vitest';
import type { FeatureVector } from '@ttr/shared';
import { fitPopulation, scoreWithPopulation } from './autoScore.js';

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

describe('autoScore (relative, no labels)', () => {
  const collection = [
    feat(450, 8, 2),
    feat(650, 12, 4),
    feat(850, 16, 6),
    feat(1050, 20, 8),
  ];
  const stats = fitPopulation(collection);

  it('scores the collection average near 50', () => {
    const mid = feat(stats.f0.mean, stats.q.mean, stats.lowHighEnergyRatio.mean);
    const s = scoreWithPopulation(stats, mid);
    expect(s.hardness).toBeGreaterThan(45);
    expect(s.hardness).toBeLessThan(55);
  });

  it('a stiffer racket (higher f0) ranks higher on hardness', () => {
    const soft = scoreWithPopulation(stats, feat(450, 14, 4));
    const hard = scoreWithPopulation(stats, feat(1050, 14, 4));
    expect(hard.hardness).toBeGreaterThan(soft.hardness);
  });

  it('a longer-ringing racket (higher Q) ranks higher on elasticity', () => {
    const dull = scoreWithPopulation(stats, feat(700, 8, 4));
    const lively = scoreWithPopulation(stats, feat(700, 20, 4));
    expect(lively.elasticity).toBeGreaterThan(dull.elasticity);
  });

  it('keeps all scores within 0–100', () => {
    const extreme = scoreWithPopulation(stats, feat(5000, 200, 100));
    for (const v of Object.values(extreme)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('identical collection (zero variance) scores 50', () => {
    const flat = fitPopulation([feat(700, 12, 4), feat(700, 12, 4)]);
    const s = scoreWithPopulation(flat, feat(700, 12, 4));
    expect(s.hardness).toBeCloseTo(50, 5);
    expect(s.elasticity).toBeCloseTo(50, 5);
  });
});
