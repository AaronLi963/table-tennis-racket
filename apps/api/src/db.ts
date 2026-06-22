/**
 * 持久化層：使用 Node 24 內建的 node:sqlite（檔案式 SQLite，零外部依賴）。
 * JSON 欄位（特徵、品質、分數、係數）以 TEXT 儲存。
 */
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.TTR_DB ?? join(dataDir, 'ttr.db');
export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS rackets (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    brand       TEXT,
    composition TEXT,
    knownScores TEXT,            -- JSON Scores | null
    createdAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS measurements (
    id        TEXT PRIMARY KEY,
    racketId  TEXT NOT NULL REFERENCES rackets(id) ON DELETE CASCADE,
    features  TEXT NOT NULL,     -- JSON FeatureVector
    quality   TEXT NOT NULL,     -- JSON QualityMetrics
    scores    TEXT,              -- JSON Scores | null
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calibration (
    id        TEXT PRIMARY KEY,
    model     TEXT NOT NULL,     -- JSON CalibrationModel
    createdAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_measurements_racket ON measurements(racketId);
`);

/** JSON 欄位 parse 小工具 */
export function parseJson<T>(value: unknown): T | null {
  if (value == null || value === '') return null;
  return JSON.parse(String(value)) as T;
}
