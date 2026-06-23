import { describe, it, expect } from 'vitest';
import type { FeatureVector } from '@ttr/shared';
import { fitPopulation, scoreWithPopulation, type RacketSample } from './autoScore.js';

/** f1..f4 升冪的模態頻率 + Q */
function feat(modal: number[], q: number): FeatureVector {
  const f0 = modal[0];
  return {
    f0,
    modes: [],
    modalFreqs: modal,
    spectralCentroid: modal[modal.length - 1] * 1.1,
    spectralSpread: 300,
    lowHighEnergyRatio: 4,
    tau: q / (Math.PI * f0),
    q,
    zeta: 1 / (2 * q),
  };
}

function sample(modal: number[], q: number, weight?: number): RacketSample {
  return { features: feat(modal, q), weight };
}

describe('autoScore (mass-corrected, relative)', () => {
  const collection: RacketSample[] = [
    sample([450, 900, 1400, 2000], 8, 80),
    sample([650, 1200, 1800, 2600], 12, 85),
    sample([850, 1500, 2300, 3200], 16, 88),
    sample([1050, 1900, 2900, 4000], 20, 90),
  ];
  const stats = fitPopulation(collection);

  it('scores the collection average near 50', () => {
    const mid = collection[1];
    const s = scoreWithPopulation(stats, mid.features, mid.weight);
    expect(s.hardness).toBeGreaterThan(35);
    expect(s.hardness).toBeLessThan(65);
  });

  it('a stiffer racket (higher f1) ranks higher on hardness', () => {
    const soft = scoreWithPopulation(stats, feat([450, 900, 1400, 2000], 14), 85);
    const hard = scoreWithPopulation(stats, feat([1050, 1900, 2900, 4000], 14), 85);
    expect(hard.hardness).toBeGreaterThan(soft.hardness);
  });

  it('mass correction: heavier blade at same pitch reads harder', () => {
    const light = scoreWithPopulation(stats, feat([700, 1300, 2000, 2800], 14), 78);
    const heavy = scoreWithPopulation(stats, feat([700, 1300, 2000, 2800], 14), 95);
    expect(heavy.hardness).toBeGreaterThan(light.hardness);
  });

  it('higher 4th-mode rigidity ranks higher on 底勁', () => {
    const lowE4 = scoreWithPopulation(stats, feat([700, 1200, 1700, 2200], 14), 85);
    const highE4 = scoreWithPopulation(stats, feat([700, 1400, 2400, 3600], 14), 85);
    expect(highE4.lowEndSupport).toBeGreaterThan(lowE4.lowEndSupport);
  });

  it('a longer-ringing racket (higher Q) ranks higher on elasticity', () => {
    const dull = scoreWithPopulation(stats, feat([700, 1300, 2000, 2800], 8), 85);
    const lively = scoreWithPopulation(stats, feat([700, 1300, 2000, 2800], 20), 85);
    expect(lively.elasticity).toBeGreaterThan(dull.elasticity);
  });

  it('falls back gracefully when weight is missing (uses median)', () => {
    const s = scoreWithPopulation(stats, feat([700, 1300, 2000, 2800], 14));
    for (const v of Object.values(s)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('keeps all scores within 0–100', () => {
    const extreme = scoreWithPopulation(stats, feat([5000, 8000, 11000, 14000], 200), 200);
    for (const v of Object.values(extreme)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
