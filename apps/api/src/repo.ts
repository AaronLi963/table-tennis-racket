/** 資料存取：球拍、量測、校正模型。 */
import { randomUUID } from 'node:crypto';
import type {
  CalibrationModel,
  FeatureVector,
  Measurement,
  QualityMetrics,
  Racket,
  Scores,
} from '@ttr/shared';
import { db, parseJson } from './db.ts';

interface RacketRow {
  id: string;
  name: string;
  brand: string | null;
  composition: string | null;
  structure: string | null;
  weight: number | null;
  tags: string | null;
  notes: string | null;
  knownScores: string | null;
  createdAt: string;
}

interface MeasurementRow {
  id: string;
  racketId: string;
  features: string;
  quality: string;
  scores: string | null;
  createdAt: string;
}

function rowToRacket(r: RacketRow): Racket {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    composition: r.composition,
    structure: r.structure,
    weight: r.weight,
    tags: parseJson<string[]>(r.tags) ?? [],
    notes: r.notes,
    knownScores: parseJson<Scores>(r.knownScores),
    createdAt: r.createdAt,
  };
}

function rowToMeasurement(r: MeasurementRow): Measurement {
  return {
    id: r.id,
    racketId: r.racketId,
    features: parseJson<FeatureVector>(r.features)!,
    quality: parseJson<QualityMetrics>(r.quality)!,
    scores: parseJson<Scores>(r.scores),
    createdAt: r.createdAt,
  };
}

// ---- Rackets ----

export function createRacket(input: {
  name: string;
  brand?: string | null;
  composition?: string | null;
  structure?: string | null;
  weight?: number | null;
  tags?: string[];
  notes?: string | null;
}): Racket {
  const racket: Racket = {
    id: randomUUID(),
    name: input.name,
    brand: input.brand ?? null,
    composition: input.composition ?? null,
    structure: input.structure ?? null,
    weight: input.weight ?? null,
    tags: input.tags ?? [],
    notes: input.notes ?? null,
    knownScores: null,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO rackets (id, name, brand, composition, structure, weight, tags, notes, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    racket.id,
    racket.name,
    racket.brand ?? null,
    racket.composition ?? null,
    racket.structure ?? null,
    racket.weight ?? null,
    racket.tags && racket.tags.length > 0 ? JSON.stringify(racket.tags) : null,
    racket.notes ?? null,
    racket.createdAt,
  );
  return racket;
}

/** 更新球拍可編輯欄位（只更新有提供的欄位）。 */
export function updateRacket(
  id: string,
  patch: {
    name?: string;
    brand?: string | null;
    composition?: string | null;
    structure?: string | null;
    weight?: number | null;
    tags?: string[];
    notes?: string | null;
  },
): Racket | null {
  const existing = getRacket(id);
  if (!existing) return null;

  const merged = {
    name: patch.name ?? existing.name,
    brand: patch.brand !== undefined ? patch.brand : (existing.brand ?? null),
    composition:
      patch.composition !== undefined ? patch.composition : (existing.composition ?? null),
    structure: patch.structure !== undefined ? patch.structure : (existing.structure ?? null),
    weight: patch.weight !== undefined ? patch.weight : (existing.weight ?? null),
    tags: patch.tags !== undefined ? patch.tags : (existing.tags ?? []),
    notes: patch.notes !== undefined ? patch.notes : (existing.notes ?? null),
  };

  db.prepare(
    `UPDATE rackets
     SET name = ?, brand = ?, composition = ?, structure = ?, weight = ?, tags = ?, notes = ?
     WHERE id = ?`,
  ).run(
    merged.name,
    merged.brand,
    merged.composition,
    merged.structure,
    merged.weight,
    merged.tags.length > 0 ? JSON.stringify(merged.tags) : null,
    merged.notes,
    id,
  );
  return getRacket(id);
}

export function listRackets(): Racket[] {
  const rows = db
    .prepare('SELECT * FROM rackets ORDER BY createdAt DESC')
    .all() as unknown as RacketRow[];
  return rows.map(rowToRacket);
}

export function getRacket(id: string): Racket | null {
  const row = db.prepare('SELECT * FROM rackets WHERE id = ?').get(id) as unknown as
    | RacketRow
    | undefined;
  return row ? rowToRacket(row) : null;
}

export function updateRacketKnownScores(id: string, knownScores: Scores | null): Racket | null {
  const existing = getRacket(id);
  if (!existing) return null;
  db.prepare('UPDATE rackets SET knownScores = ? WHERE id = ?').run(
    knownScores ? JSON.stringify(knownScores) : null,
    id,
  );
  return getRacket(id);
}

// ---- Measurements ----

export function createMeasurement(input: {
  racketId: string;
  features: FeatureVector;
  quality: QualityMetrics;
  scores?: Scores | null;
}): Measurement {
  const m: Measurement = {
    id: randomUUID(),
    racketId: input.racketId,
    features: input.features,
    quality: input.quality,
    scores: input.scores ?? null,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO measurements (id, racketId, features, quality, scores, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    m.id,
    m.racketId,
    JSON.stringify(m.features),
    JSON.stringify(m.quality),
    m.scores ? JSON.stringify(m.scores) : null,
    m.createdAt,
  );
  return m;
}

export function listMeasurements(racketId: string): Measurement[] {
  const rows = db
    .prepare('SELECT * FROM measurements WHERE racketId = ? ORDER BY createdAt DESC')
    .all(racketId) as unknown as MeasurementRow[];
  return rows.map(rowToMeasurement);
}

export function latestMeasurement(racketId: string): Measurement | null {
  const row = db
    .prepare('SELECT * FROM measurements WHERE racketId = ? ORDER BY createdAt DESC LIMIT 1')
    .get(racketId) as unknown as MeasurementRow | undefined;
  return row ? rowToMeasurement(row) : null;
}

// ---- Calibration ----

export function saveCalibration(model: CalibrationModel): void {
  db.prepare('INSERT INTO calibration (id, model, createdAt) VALUES (?, ?, ?)').run(
    model.id,
    JSON.stringify(model),
    model.createdAt,
  );
}

export function latestCalibration(): CalibrationModel | null {
  const row = db
    .prepare('SELECT model FROM calibration ORDER BY createdAt DESC LIMIT 1')
    .get() as unknown as { model: string } | undefined;
  return row ? (JSON.parse(row.model) as CalibrationModel) : null;
}
