/** @ttr/dsp — 純 TypeScript 訊號處理（零 DOM / Web Audio 依賴，前後端與行動端共用）。 */

export { fft, magnitudeSpectrum, nextPow2, binToHz } from './fft.js';
export { hann, removeDc, normalizePeak, rms } from './window.js';
export { detectOnsets, extractMainTap, type Onset } from './onset.js';
export { analyticEnvelope, bandpass } from './envelope.js';
export { fitExponentialDecay, type DecayFit } from './fit.js';
export {
  extractSpectralFeatures,
  ANALYSIS_BAND,
  LOW_HIGH_SPLIT_HZ,
  type SpectralFeatures,
} from './features.js';
export { assessQuality } from './quality.js';
export {
  analyze,
  analyzeForViz,
  extractFeatures,
  type AnalyzeOptions,
  type VizResult,
} from './analyze.js';
export {
  fitCalibration,
  applyCalibration,
  type TrainingSample,
} from './calibration.js';
export { fitPopulation, scoreWithPopulation } from './autoScore.js';
