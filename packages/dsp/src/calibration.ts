/**
 * 校正模型：以已知球拍的「特徵 → 真實分數」做多元嶺回歸（ridge regression）。
 * 樣本少、特徵共線時，嶺正則化可避免過擬合與數值不穩。
 */
import {
  CALIBRATION_FEATURE_KEYS,
  SCORE_KEYS,
  featuresToRow,
  type CalibrationCoefficients,
  type CalibrationModel,
  type FeatureVector,
  type ScoreKey,
  type Scores,
} from '@ttr/shared';

export interface TrainingSample {
  features: FeatureVector;
  scores: Scores;
}

/** 嶺回歸的正則化強度（標準化空間） */
const DEFAULT_LAMBDA = 1.0;

/**
 * 用已標記樣本擬合校正模型。需至少 2 筆樣本。
 */
export function fitCalibration(
  samples: TrainingSample[],
  lambda = DEFAULT_LAMBDA,
): Omit<CalibrationModel, 'id' | 'createdAt'> {
  if (samples.length < 2) {
    throw new Error('校正至少需要 2 支已知球拍。');
  }

  const X = samples.map((s) => featuresToRow(s.features));
  const coeffs = {} as Record<ScoreKey, CalibrationCoefficients>;
  const looRmse = {} as Scores;

  for (const key of SCORE_KEYS) {
    const y = samples.map((s) => s.scores[key]);
    coeffs[key] = fitRidge(X, y, lambda);
    looRmse[key] = leaveOneOutRmse(X, y, lambda);
  }

  return {
    hardness: coeffs.hardness,
    elasticity: coeffs.elasticity,
    lowEndSupport: coeffs.lowEndSupport,
    sampleCount: samples.length,
    looRmse,
  };
}

/** 套用校正模型，將特徵向量轉成 0–100 分數。 */
export function applyCalibration(
  model: Pick<CalibrationModel, ScoreKey>,
  features: FeatureVector,
): Scores {
  const row = featuresToRow(features);
  return {
    hardness: clampScore(predict(model.hardness, row)),
    elasticity: clampScore(predict(model.elasticity, row)),
    lowEndSupport: clampScore(predict(model.lowEndSupport, row)),
  };
}

function predict(c: CalibrationCoefficients, row: number[]): number {
  let s = c.intercept;
  for (let j = 0; j < row.length; j++) s += c.weights[j] * row[j];
  return s;
}

function clampScore(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

/**
 * 標準化 + 嶺回歸，回傳「原始特徵空間」的權重與截距，
 * 使預測可直接用 featuresToRow 的原始數值。
 */
function fitRidge(X: number[][], y: number[], lambda: number): CalibrationCoefficients {
  const n = X.length;
  const k = CALIBRATION_FEATURE_KEYS.length;

  // 各欄平均與標準差
  const mean = new Array(k).fill(0);
  const std = new Array(k).fill(0);
  for (let j = 0; j < k; j++) {
    let m = 0;
    for (let i = 0; i < n; i++) m += X[i][j];
    m /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (X[i][j] - m) ** 2;
    mean[j] = m;
    std[j] = Math.sqrt(v / n) || 1; // 常數欄以 1 代替，避免除以 0
  }

  // 標準化設計矩陣與中心化目標
  const ybar = y.reduce((a, b) => a + b, 0) / n;
  const Xs: number[][] = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  const yc = y.map((v) => v - ybar);

  // 正規方程 (XsᵀXs + λI) w = Xsᵀ yc
  const A: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let a = 0; a < k; a++) {
    for (let c = 0; c < k; c++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += Xs[i][a] * Xs[i][c];
      A[a][c] = s + (a === c ? lambda : 0);
    }
    let s = 0;
    for (let i = 0; i < n; i++) s += Xs[i][a] * yc[i];
    b[a] = s;
  }

  const wStd = solveLinear(A, b);

  // 轉回原始特徵空間
  const weights = new Array(k);
  let intercept = ybar;
  for (let j = 0; j < k; j++) {
    weights[j] = wStd[j] / std[j];
    intercept -= (wStd[j] * mean[j]) / std[j];
  }
  return { weights, intercept };
}

/** 高斯消去法解 A w = b（A 為 k×k） */
function solveLinear(Ain: number[][], bin: number[]): number[] {
  const k = bin.length;
  const A = Ain.map((row) => row.slice());
  const b = bin.slice();

  for (let col = 0; col < k; col++) {
    // 部分樞軸
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < 1e-12) continue; // 奇異，跳過
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];

    const diag = A[col][col];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const factor = A[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c < k; c++) A[r][c] -= factor * A[col][c];
      b[r] -= factor * b[col];
    }
  }

  const w = new Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    if (Math.abs(A[i][i]) > 1e-12) w[i] = b[i] / A[i][i];
  }
  return w;
}

/** leave-one-out 交叉驗證 RMSE */
function leaveOneOutRmse(X: number[][], y: number[], lambda: number): number {
  const n = X.length;
  if (n < 3) return NaN; // 樣本太少，LOO 無意義
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const Xtrain = X.filter((_, idx) => idx !== i);
    const ytrain = y.filter((_, idx) => idx !== i);
    const c = fitRidge(Xtrain, ytrain, lambda);
    const pred = predict(c, X[i]);
    sse += (pred - y[i]) ** 2;
  }
  return Math.sqrt(sse / n);
}
