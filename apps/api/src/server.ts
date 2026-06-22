/** Express REST API：球拍、量測、自動相對評分、比較。 */
import express, { type Express } from 'express';
import cors from 'cors';
import { fitPopulation, scoreWithPopulation } from '@ttr/dsp';
import type { FeatureVector, PopulationStats, Scores } from '@ttr/shared';
import {
  createMeasurement,
  createRacket,
  getRacket,
  latestMeasurement,
  listMeasurements,
  listRackets,
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
    const features: FeatureVector[] = [];
    for (const r of listRackets()) {
      const m = latestMeasurement(r.id);
      if (m) features.push(m.features);
    }
    return features.length >= MIN_POPULATION ? fitPopulation(features) : null;
  }

  /** 以目前收藏的分布，對特徵自動打出相對分數（資料不足則回 null）。 */
  function scoreFeatures(features: FeatureVector): Scores | null {
    const stats = populationStats();
    return stats ? scoreWithPopulation(stats, features) : null;
  }

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // ---- Rackets ----
  app.post('/rackets', (req, res) => {
    const { name, brand, composition } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name 為必填' });
    }
    res.status(201).json(createRacket({ name, brand, composition }));
  });

  app.get('/rackets', (_req, res) => res.json(listRackets()));

  app.get('/rackets/:id', (req, res) => {
    const racket = getRacket(req.params.id);
    if (!racket) return res.status(404).json({ error: '找不到球拍' });
    const latest = latestMeasurement(racket.id);
    res.json({
      ...racket,
      latestMeasurement: latest,
      latestScores: latest ? scoreFeatures(latest.features) : null,
    });
  });

  // ---- Measurements ----
  app.post('/measurements', (req, res) => {
    const { racketId, features, quality } = req.body ?? {};
    if (!racketId || !features || !quality) {
      return res.status(400).json({ error: 'racketId、features、quality 為必填' });
    }
    if (!getRacket(racketId)) return res.status(404).json({ error: '找不到球拍' });
    const scores = scoreFeatures(features);
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
        features: latest?.features ?? null,
        scores: latest ? scoreFeatures(latest.features) : null,
      };
    });
    res.json(out);
  });

  return app;
}
