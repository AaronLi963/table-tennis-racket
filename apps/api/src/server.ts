/** Express REST API：球拍、量測、自動相對評分、比較。 */
import express, { type Express } from 'express';
import cors from 'cors';
import { fitPopulation, scoreWithPopulation, type RacketSample } from '@ttr/dsp';
import type { FeatureVector, PopulationStats, Scores } from '@ttr/shared';
import {
  createMeasurement,
  createRacket,
  getRacket,
  latestMeasurement,
  listMeasurements,
  listRackets,
  updateRacket,
} from './repo.ts';

/** 產生相對分數所需的最少球拍數（每支至少一次量測） */
const MIN_POPULATION = 2;

export function createServer(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  /**
   * 由所有球拍「最新一次量測」的特徵擬合母體統計。
   * 不足 {@link MIN_POPULATION} 支時回 null（相對分數無意義）。
   */
  function populationStats(): PopulationStats | null {
    const samples: RacketSample[] = [];
    for (const r of listRackets()) {
      const m = latestMeasurement(r.id);
      if (m) samples.push({ features: m.features, weight: r.weight });
    }
    return samples.length >= MIN_POPULATION ? fitPopulation(samples) : null;
  }

  /**
   * 以目前收藏的分布，對特徵自動打出相對分數（資料不足則回 null）。
   * 需帶該球拍重量以計算質量修正剛度（缺重量則以收藏中位數代入）。
   */
  function scoreFeatures(features: FeatureVector, weight?: number | null): Scores | null {
    const stats = populationStats();
    return stats ? scoreWithPopulation(stats, features, weight) : null;
  }

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // ---- Rackets ----
  app.post('/rackets', (req, res) => {
    const { name, brand, composition, structure, weight, tags, notes } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name 為必填' });
    }
    res.status(201).json(
      createRacket({ name, brand, composition, structure, weight: normWeight(weight), tags, notes }),
    );
  });

  app.get('/rackets', (_req, res) => res.json(listRackets()));

  // 更新球拍資料（結構 / 重量 / 標籤 / 備註等）
  app.patch('/rackets/:id', (req, res) => {
    const { name, brand, composition, structure, weight, tags, notes } = req.body ?? {};
    const patch: Parameters<typeof updateRacket>[1] = {};
    if (name !== undefined) patch.name = name;
    if (brand !== undefined) patch.brand = brand;
    if (composition !== undefined) patch.composition = composition;
    if (structure !== undefined) patch.structure = structure;
    if (weight !== undefined) patch.weight = normWeight(weight);
    if (tags !== undefined) patch.tags = Array.isArray(tags) ? tags : [];
    if (notes !== undefined) patch.notes = notes;
    const racket = updateRacket(req.params.id, patch);
    if (!racket) return res.status(404).json({ error: '找不到球拍' });
    res.json(racket);
  });

  app.get('/rackets/:id', (req, res) => {
    const racket = getRacket(req.params.id);
    if (!racket) return res.status(404).json({ error: '找不到球拍' });
    const latest = latestMeasurement(racket.id);
    res.json({
      ...racket,
      latestMeasurement: latest,
      latestScores: latest ? scoreFeatures(latest.features, racket.weight) : null,
    });
  });

  // ---- Measurements ----
  app.post('/measurements', (req, res) => {
    const { racketId, features, quality } = req.body ?? {};
    if (!racketId || !features || !quality) {
      return res.status(400).json({ error: 'racketId、features、quality 為必填' });
    }
    const racket = getRacket(racketId);
    if (!racket) return res.status(404).json({ error: '找不到球拍' });
    const scores = scoreFeatures(features, racket.weight);
    const m = createMeasurement({ racketId, features, quality, scores });
    res.status(201).json(m);
  });

  app.get('/rackets/:id/measurements', (req, res) => {
    if (!getRacket(req.params.id)) return res.status(404).json({ error: '找不到球拍' });
    res.json(listMeasurements(req.params.id));
  });

  // ---- 自動相對評分（母體統計） ----
  app.get('/population', (_req, res) => {
    const stats = populationStats();
    res.json({ stats, minRequired: MIN_POPULATION });
  });

  // ---- Compare ----
  app.get('/compare', (req, res) => {
    const ids = String(req.query.ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const out = ids.map((id) => {
      const racket = getRacket(id);
      if (!racket) return { id, error: '找不到球拍' };
      const latest = latestMeasurement(id);
      return {
        id,
        name: racket.name,
        brand: racket.brand,
        structure: racket.structure,
        weight: racket.weight,
        tags: racket.tags,
        features: latest?.features ?? null,
        scores: latest ? scoreFeatures(latest.features, racket.weight) : null,
      };
    });
    res.json(out);
  });

  return app;
}

/** 把表單傳來的重量轉成 number | null（空字串 / 非數字 → null） */
function normWeight(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
