/** 後端 REST 客戶端（經 Vite proxy 的 /api）。 */
import type {
  FeatureVector,
  Measurement,
  PopulationStats,
  QualityMetrics,
  Racket,
  RacketInput,
  Scores,
} from '@ttr/shared';

const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface RacketDetail extends Racket {
  latestMeasurement: Measurement | null;
  latestScores: Scores | null;
}

export interface CompareEntry {
  id: string;
  name?: string;
  brand?: string | null;
  structure?: string | null;
  weight?: number | null;
  tags?: string[];
  features: FeatureVector | null;
  scores: Scores | null;
  error?: string;
}

export interface PopulationResponse {
  stats: PopulationStats | null;
  minRequired: number;
}

export const api = {
  listRackets: () => req<Racket[]>('/rackets'),
  getRacket: (id: string) => req<RacketDetail>(`/rackets/${id}`),
  createRacket: (input: RacketInput & { name: string }) =>
    req<Racket>('/rackets', { method: 'POST', body: JSON.stringify(input) }),
  updateRacket: (id: string, patch: RacketInput) =>
    req<Racket>(`/rackets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createMeasurement: (input: {
    racketId: string;
    features: FeatureVector;
    quality: QualityMetrics;
  }) => req<Measurement>('/measurements', { method: 'POST', body: JSON.stringify(input) }),
  listMeasurements: (racketId: string) => req<Measurement[]>(`/rackets/${racketId}/measurements`),
  getPopulation: () => req<PopulationResponse>('/population'),
  compare: (ids: string[]) => req<CompareEntry[]>(`/compare?ids=${ids.join(',')}`),
};
