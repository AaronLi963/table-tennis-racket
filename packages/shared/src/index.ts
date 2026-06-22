/**
 * @ttr/shared — 跨平台共用型別
 *
 * 此套件刻意維持「純資料型別」，不依賴 DOM / Web Audio / Node，
 * 以便 Phase 1（瀏覽器）與 Phase 2（行動 App）共用。
 */

export const SCORE_KEYS = ['hardness', 'elasticity', 'lowEndSupport'] as const;
/** 三項指標的鍵：軟硬度、彈性、底勁 */
export type ScoreKey = (typeof SCORE_KEYS)[number];

/** 三項輸出指標（0–100 分，越高越「硬 / 彈 / 有底勁」） */
export interface Scores {
  /** 軟硬度 */
  hardness: number;
  /** 彈性（蓄能回彈） */
  elasticity: number;
  /** 底勁（大力支撐能力，校正估計值） */
  lowEndSupport: number;
}

// ---------------------------------------------------------------------------
// 音訊擷取抽象：Phase 1 由瀏覽器實作，Phase 2 由行動端原生錄音實作
// ---------------------------------------------------------------------------

/** 與平台無關的音訊資料（DSP 管線的唯一輸入） */
export interface AudioBufferData {
  /** 單聲道 PCM，範圍約 [-1, 1] */
  pcm: Float32Array;
  /** 取樣率 (Hz)，例如 44100 / 48000 */
  sampleRate: number;
}

/**
 * 音訊來源介面。任何平台只要能產生 {@link AudioBufferData} 即可接上 DSP 管線。
 * - 瀏覽器：麥克風 (getUserMedia) 或檔案 (decodeAudioData)
 * - 行動端：原生錄音模組
 */
export interface AudioSource {
  /** 取得一段擷取到的音訊（含敲擊） */
  capture(): Promise<AudioBufferData>;
}

// ---------------------------------------------------------------------------
// DSP 特徵與品質
// ---------------------------------------------------------------------------

/** 單一模態峰 */
export interface ModePeak {
  /** 頻率 (Hz) */
  freq: number;
  /** 線性幅度 */
  magnitude: number;
}

/** 一次敲擊萃取出的物理特徵向量 */
export interface FeatureVector {
  /** 基頻 / 主共振頻率 (Hz) — 對應軟硬度 */
  f0: number;
  /** 其他模態峰（依幅度排序） */
  modes: ModePeak[];
  /** 頻譜質心 (Hz) */
  spectralCentroid: number;
  /** 頻譜擴散（標準差，Hz） */
  spectralSpread: number;
  /** 低頻 / 高頻能量比（以 ~1.5kHz 為界） */
  lowHighEnergyRatio: number;
  /** 衰減時間常數 τ (s) */
  tau: number;
  /** 品質因子 Q = π·f0·τ */
  q: number;
  /** 阻尼比 ζ */
  zeta: number;
}

/** 量測品質指標，用於提示使用者是否需重敲 */
export interface QualityMetrics {
  /** 訊雜比 (dB) */
  snrDb: number;
  /** 是否削波（過載） */
  clipped: boolean;
  /** 偵測到的敲擊次數 */
  onsetCount: number;
  /** 0–1 的整體品質分數 */
  quality: number;
  /** 人類可讀的提示（中文） */
  warnings: string[];
}

/** 完整分析結果（特徵 + 品質 +（若已校正）分數） */
export interface AnalysisResult {
  features: FeatureVector;
  quality: QualityMetrics;
  /** 若校正模型存在則有分數，否則為 null */
  scores: Scores | null;
}

// ---------------------------------------------------------------------------
// 持久化實體（後端 / DB）
// ---------------------------------------------------------------------------

export interface Racket {
  id: string;
  name: string;
  brand?: string | null;
  /** 結構描述，例如 "5+2 ALC" */
  composition?: string | null;
  /** 使用者輸入的已知真實特性（用於校正），未知則為 null */
  knownScores?: Scores | null;
  createdAt: string;
}

export interface Measurement {
  id: string;
  racketId: string;
  features: FeatureVector;
  quality: QualityMetrics;
  scores: Scores | null;
  createdAt: string;
}

/** 每項指標一組線性回歸係數：score = intercept + Σ coef[i]·feature[i] */
export interface CalibrationCoefficients {
  /** 對應 {@link CALIBRATION_FEATURE_KEYS} 的權重 */
  weights: number[];
  intercept: number;
}

export interface CalibrationModel {
  id: string;
  hardness: CalibrationCoefficients;
  elasticity: CalibrationCoefficients;
  lowEndSupport: CalibrationCoefficients;
  /** 訓練樣本數 */
  sampleCount: number;
  /** leave-one-out 各指標 RMSE */
  looRmse: Scores;
  createdAt: string;
}

/** 進入校正回歸的特徵欄位（順序固定，與 weights 對齊） */
export const CALIBRATION_FEATURE_KEYS = [
  'f0',
  'spectralCentroid',
  'spectralSpread',
  'lowHighEnergyRatio',
  'q',
  'zeta',
] as const satisfies readonly (keyof FeatureVector)[];

export type CalibrationFeatureKey = (typeof CALIBRATION_FEATURE_KEYS)[number];

/** 將特徵向量轉成校正用的數值列（順序對齊 CALIBRATION_FEATURE_KEYS） */
export function featuresToRow(f: FeatureVector): number[] {
  return CALIBRATION_FEATURE_KEYS.map((k) => f[k] as number);
}

// ---------------------------------------------------------------------------
// 自動（相對）評分：無真實標籤時，以「整個收藏的分布」相對打分
// ---------------------------------------------------------------------------

/** 單一特徵在收藏中的平均與標準差 */
export interface FeatureStats {
  mean: number;
  std: number;
}

/**
 * 收藏的母體統計。新球拍的分數即是其特徵相對於此分布的標準分數（z-score）。
 * 樣本越多，相對分數越穩定。
 */
export interface PopulationStats {
  /** 參與評分的球拍數（每支取最新一次量測） */
  sampleCount: number;
  f0: FeatureStats;
  q: FeatureStats;
  lowHighEnergyRatio: FeatureStats;
}
