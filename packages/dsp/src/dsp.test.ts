import { describe, it, expect } from 'vitest';
import type { AudioBufferData } from '@ttr/shared';
import { fft, magnitudeSpectrum, nextPow2 } from './fft.js';
import { analyticEnvelope } from './envelope.js';
import { fitExponentialDecay } from './fit.js';
import { extractFeatures, analyze } from './analyze.js';

const SR = 44100;

/** 合成「敲擊」：阻尼衰減正弦 sin(2π f0 t)·exp(-t/τ)，前面補一段靜音。 */
function syntheticTap(f0: number, tau: number, durSec: number, leadSec = 0.02): Float64Array {
  const lead = Math.round(SR * leadSec);
  const n = Math.round(SR * durSec);
  const out = new Float64Array(lead + n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[lead + i] = Math.sin(2 * Math.PI * f0 * t) * Math.exp(-t / tau);
  }
  return out;
}

describe('fft', () => {
  it('forward then inverse recovers the signal', () => {
    const n = 16;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 3 * i) / n);
    const re0 = re.slice();
    fft(re, im, false);
    fft(re, im, true);
    for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(re0[i], 6);
  });

  it('locates a pure tone in the magnitude spectrum', () => {
    const fftSize = 4096;
    const f = 1000;
    const sig = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) sig[i] = Math.sin((2 * Math.PI * f * i) / SR);
    const mag = magnitudeSpectrum(sig, fftSize);
    let peak = 0;
    for (let i = 1; i < mag.length; i++) if (mag[i] > mag[peak]) peak = i;
    const hz = (peak * SR) / fftSize;
    expect(hz).toBeGreaterThan(f - 20);
    expect(hz).toBeLessThan(f + 20);
  });
});

describe('analyticEnvelope', () => {
  it('tracks the exponential envelope of a damped sine', () => {
    const tau = 0.05;
    const sig = syntheticTap(800, tau, 0.2, 0);
    const env = analyticEnvelope(sig);
    // 包絡在峰值附近應接近 1，且隨時間衰減
    const early = env[Math.round(SR * 0.005)];
    const late = env[Math.round(SR * 0.1)];
    expect(early).toBeGreaterThan(late);
    expect(late / early).toBeLessThan(0.2); // 0.1s ≈ 2τ → e^-2 ≈ 0.135
  });
});

describe('fitExponentialDecay', () => {
  it('recovers tau from a clean exponential envelope', () => {
    const tau = 0.08;
    const n = Math.round(SR * 0.4);
    const env = new Float64Array(n);
    for (let i = 0; i < n; i++) env[i] = Math.exp(-i / SR / tau);
    const fit = fitExponentialDecay(env, SR);
    expect(fit.tau).toBeGreaterThan(tau * 0.9);
    expect(fit.tau).toBeLessThan(tau * 1.1);
    expect(fit.r2).toBeGreaterThan(0.99);
  });
});

describe('extractFeatures', () => {
  it('measures f0 and tau of a synthetic tap within tolerance', () => {
    const f0 = 650;
    const tau = 0.09;
    const tap = syntheticTap(f0, tau, 0.4, 0);
    const feat = extractFeatures(tap, SR);
    expect(feat.f0).toBeGreaterThan(f0 * 0.97);
    expect(feat.f0).toBeLessThan(f0 * 1.03);
    expect(feat.tau).toBeGreaterThan(tau * 0.7);
    expect(feat.tau).toBeLessThan(tau * 1.3);
    expect(feat.q).toBeGreaterThan(0);
    expect(feat.zeta).toBeGreaterThan(0);
  });

  it('a harder (higher f0) tap reads higher f0 than a softer one', () => {
    const soft = extractFeatures(syntheticTap(450, 0.06, 0.4, 0), SR);
    const hard = extractFeatures(syntheticTap(1200, 0.06, 0.4, 0), SR);
    expect(hard.f0).toBeGreaterThan(soft.f0);
  });

  it('a longer-ringing tap reads higher Q (more elastic)', () => {
    const dull = extractFeatures(syntheticTap(700, 0.03, 0.4, 0), SR);
    const lively = extractFeatures(syntheticTap(700, 0.15, 0.4, 0), SR);
    expect(lively.q).toBeGreaterThan(dull.q);
  });
});

describe('analyze (full pipeline)', () => {
  it('detects the onset and extracts sensible features from raw PCM', () => {
    const tap = syntheticTap(600, 0.08, 0.4, 0.05);
    const pcm = new Float32Array(tap.length);
    for (let i = 0; i < tap.length; i++) pcm[i] = tap[i] * 0.6;
    const audio: AudioBufferData = { pcm, sampleRate: SR };

    const result = analyze(audio);
    expect(result.quality.onsetCount).toBeGreaterThanOrEqual(1);
    expect(result.features.f0).toBeGreaterThan(560);
    expect(result.features.f0).toBeLessThan(640);
    expect(result.scores).toBeNull(); // 尚未校正
  });
});

describe('nextPow2', () => {
  it('rounds up to the next power of two', () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(17)).toBe(32);
    expect(nextPow2(1024)).toBe(1024);
  });
});
