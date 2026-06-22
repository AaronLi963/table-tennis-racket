/** 頂層分析管線：AudioBufferData → FeatureVector + QualityMetrics（+ 可視化資料）。 */
import type { AnalysisResult, AudioBufferData, FeatureVector } from '@ttr/shared';
import { binToHz, magnitudeSpectrum, nextPow2 } from './fft.js';
import { hann, removeDc } from './window.js';
import { detectOnsets, extractMainTap } from './onset.js';
import { ANALYSIS_BAND, extractSpectralFeatures } from './features.js';
import { analyticEnvelope, bandpass } from './envelope.js';
import { fitExponentialDecay } from './fit.js';
import { assessQuality } from './quality.js';

export interface AnalyzeOptions {
  /** 分析窗長度（秒），自主敲擊起算 */
  tapDurationSec?: number;
  /** 頻譜 FFT 大小上限（2 的次方） */
  maxFftSize?: number;
}

/** 萃取結果與供繪圖的中間資料 */
interface FeatureComputation {
  features: FeatureVector;
  /** 分析頻段內的頻譜（已降採樣供繪圖） */
  spectrum: { freq: number[]; mag: number[] };
  /** 主模態帶通後的振幅包絡（已降採樣供繪圖） */
  envelope: { t: number[]; v: number[] };
  decayR2: number;
}

/** 繪圖用的完整輸出 */
export interface VizResult extends AnalysisResult {
  spectrum: { freq: number[]; mag: number[] };
  envelope: { t: number[]; v: number[] };
  decayR2: number;
}

/**
 * 對一段音訊執行完整分析。回傳的 scores 為 null —
 * 分數需由校正模型（@ttr/dsp/calibration）另行套用。
 */
export function analyze(audio: AudioBufferData, opts: AnalyzeOptions = {}): AnalysisResult {
  const v = analyzeForViz(audio, opts);
  return { features: v.features, quality: v.quality, scores: v.scores };
}

/** 與 analyze 相同，但額外回傳頻譜與包絡曲線供前端繪圖。 */
export function analyzeForViz(audio: AudioBufferData, opts: AnalyzeOptions = {}): VizResult {
  const { tapDurationSec = 0.4, maxFftSize = 1 << 16 } = opts;
  const { sampleRate } = audio;
  const raw = audio.pcm;

  // Float32 → Float64 並去 DC
  const f64 = new Float64Array(raw.length);
  for (let i = 0; i < raw.length; i++) f64[i] = raw[i];
  const signal = removeDc(f64);

  const onsets = detectOnsets(signal, sampleRate);
  const quality = assessQuality(signal, raw, onsets, sampleRate);

  const { segment } = extractMainTap(signal, onsets, sampleRate, tapDurationSec);
  const comp = computeFeatures(segment, sampleRate, maxFftSize);

  return {
    features: comp.features,
    quality,
    scores: null,
    spectrum: comp.spectrum,
    envelope: comp.envelope,
    decayR2: comp.decayR2,
  };
}

/** 從已切好的主敲擊段萃取特徵向量（可單獨測試）。 */
export function extractFeatures(
  segment: Float64Array,
  sampleRate: number,
  maxFftSize = 1 << 16,
): FeatureVector {
  return computeFeatures(segment, sampleRate, maxFftSize).features;
}

function computeFeatures(
  segment: Float64Array,
  sampleRate: number,
  maxFftSize: number,
): FeatureComputation {
  // ---- 頻域：加 Hann 窗後 FFT ----
  const fftSize = Math.min(maxFftSize, nextPow2(segment.length));
  const windowed = new Float64Array(fftSize);
  const wlen = Math.min(segment.length, fftSize);
  const w = hann(wlen);
  for (let i = 0; i < wlen; i++) windowed[i] = segment[i] * w[i];
  const mag = magnitudeSpectrum(windowed, fftSize);
  const spectral = extractSpectralFeatures(mag, fftSize, sampleRate);

  // ---- 時域：帶通 → Hilbert 包絡 → 指數擬合 ----
  let tau = 0;
  let decayR2 = 0;
  let envForViz: Float64Array = new Float64Array(0);
  if (spectral.f0 > 0) {
    const bw = Math.max(spectral.f0 * 0.25, 100);
    const filtered = bandpass(segment, sampleRate, spectral.f0 - bw, spectral.f0 + bw);
    envForViz = analyticEnvelope(filtered);
    const fit = fitExponentialDecay(envForViz, sampleRate);
    tau = Number.isFinite(fit.tau) ? fit.tau : 0;
    decayR2 = fit.r2;
  }

  const q = spectral.f0 > 0 && tau > 0 ? Math.PI * spectral.f0 * tau : 0;
  const zeta = q > 0 ? 1 / (2 * q) : 0;

  const features: FeatureVector = {
    f0: spectral.f0,
    modes: spectral.modes,
    spectralCentroid: spectral.spectralCentroid,
    spectralSpread: spectral.spectralSpread,
    lowHighEnergyRatio: spectral.lowHighEnergyRatio,
    tau,
    q,
    zeta,
  };

  return {
    features,
    spectrum: downsampleSpectrum(mag, fftSize, sampleRate),
    envelope: downsampleEnvelope(envForViz, sampleRate),
    decayR2,
  };
}

/** 將頻譜降採樣到分析頻段內約 ~400 點 */
function downsampleSpectrum(
  mag: Float64Array,
  fftSize: number,
  sampleRate: number,
): { freq: number[]; mag: number[] } {
  const binMin = Math.max(1, Math.floor((ANALYSIS_BAND.min * fftSize) / sampleRate));
  const binMax = Math.min(mag.length - 1, Math.ceil((ANALYSIS_BAND.max * fftSize) / sampleRate));
  const target = 400;
  const step = Math.max(1, Math.floor((binMax - binMin) / target));
  const freq: number[] = [];
  const out: number[] = [];
  for (let i = binMin; i <= binMax; i += step) {
    // 取此區塊最大值，保留峰
    let m = 0;
    for (let j = i; j < Math.min(i + step, binMax + 1); j++) if (mag[j] > m) m = mag[j];
    freq.push(Math.round(binToHz(i, fftSize, sampleRate)));
    out.push(m);
  }
  return { freq, mag: out };
}

/** 將包絡降採樣到 ~300 點 */
function downsampleEnvelope(env: Float64Array, sampleRate: number): { t: number[]; v: number[] } {
  if (env.length === 0) return { t: [], v: [] };
  const target = 300;
  const step = Math.max(1, Math.floor(env.length / target));
  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < env.length; i += step) {
    t.push(+((i / sampleRate) * 1000).toFixed(1)); // ms
    v.push(env[i]);
  }
  return { t, v };
}
