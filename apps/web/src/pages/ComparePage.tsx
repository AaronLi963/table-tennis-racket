import { useEffect, useMemo, useState } from 'react';
import type { Racket, Scores } from '@ttr/shared';
import { api, type CompareEntry } from '../api.ts';
import { ScoreRadar } from '../components/Charts.tsx';

const ALL = '__all__';
const NO_BRAND = '__none__';

type Mode = 'racket' | 'brand';

export function ComparePage() {
  const [rackets, setRackets] = useState<Racket[]>([]);
  const [brandFilter, setBrandFilter] = useState<string>(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [mode, setMode] = useState<Mode>('racket');

  useEffect(() => {
    api.listRackets().then(setRackets);
  }, []);

  // 不重複的品牌清單
  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const r of rackets) set.add(r.brand?.trim() || NO_BRAND);
    return [...set].sort();
  }, [rackets]);

  // 依品牌篩選後可選的球拍
  const visibleRackets = useMemo(() => {
    if (brandFilter === ALL) return rackets;
    return rackets.filter((r) => (r.brand?.trim() || NO_BRAND) === brandFilter);
  }, [rackets, brandFilter]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visibleRackets.map((r) => r.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  useEffect(() => {
    const ids = [...selected];
    if (ids.length === 0) {
      setEntries([]);
      return;
    }
    api.compare(ids).then(setEntries);
  }, [selected]);

  // 逐拍：每支球拍一條
  const racketSeries = entries
    .filter((e) => e.scores)
    .map((e) => ({ name: e.name ?? e.id, scores: e.scores! }));

  // 依品牌：同品牌分數取平均，一個品牌一條
  const brandSeries = useMemo(() => groupByBrandAverage(entries), [entries]);

  const series = mode === 'brand' ? brandSeries : racketSeries;

  return (
    <div>
      <div className="card">
        <h2>選擇要比較的球拍</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <label>品牌篩選</label>
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
              <option value={ALL}>全部品牌</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b === NO_BRAND ? '（未填品牌）' : b}
                </option>
              ))}
            </select>
          </div>
          <button className="secondary" onClick={selectAllVisible}>
            全選此品牌
          </button>
          <button className="secondary" onClick={clearSelection}>
            清除
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {visibleRackets.map((r) => (
            <button
              key={r.id}
              className={selected.has(r.id) ? '' : 'secondary'}
              onClick={() => toggle(r.id)}
            >
              {r.name}
              {r.brand ? ` · ${r.brand}` : ''}
            </button>
          ))}
        </div>
        {visibleRackets.length === 0 && <p className="muted">此品牌尚無球拍。</p>}
      </div>

      {entries.length > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>三項指標雷達圖</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={mode === 'racket' ? '' : 'secondary'}
                onClick={() => setMode('racket')}
              >
                逐拍比較
              </button>
              <button
                className={mode === 'brand' ? '' : 'secondary'}
                onClick={() => setMode('brand')}
              >
                依品牌比較（平均）
              </button>
            </div>
          </div>
          {series.length > 0 ? (
            <ScoreRadar series={series} />
          ) : (
            <p className="muted">選取的球拍尚無分數（需先量測並建立校正模型）。</p>
          )}
        </div>
      )}

      {entries.length > 0 && (
        <div className="card">
          <h2>明細</h2>
          <table className="featTable">
            <thead>
              <tr>
                <td>球拍</td>
                <td>品牌</td>
                <td>軟硬度</td>
                <td>彈性</td>
                <td>底勁</td>
                <td>f0 (Hz)</td>
                <td>Q</td>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.name ?? e.id}</td>
                  <td>{e.brand ?? '—'}</td>
                  <td>{e.scores ? e.scores.hardness.toFixed(0) : '—'}</td>
                  <td>{e.scores ? e.scores.elasticity.toFixed(0) : '—'}</td>
                  <td>{e.scores ? e.scores.lowEndSupport.toFixed(0) : '—'}</td>
                  <td>{e.features ? e.features.f0.toFixed(0) : '—'}</td>
                  <td>{e.features ? e.features.q.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 將有分數的球拍依品牌分組，分數取平均 */
function groupByBrandAverage(entries: CompareEntry[]): { name: string; scores: Scores }[] {
  const groups = new Map<string, Scores[]>();
  for (const e of entries) {
    if (!e.scores) continue;
    const brand = e.brand?.trim() || '（未填品牌）';
    const arr = groups.get(brand) ?? [];
    arr.push(e.scores);
    groups.set(brand, arr);
  }
  return [...groups.entries()].map(([name, list]) => ({
    name: `${name}（${list.length} 支）`,
    scores: {
      hardness: avg(list.map((s) => s.hardness)),
      elasticity: avg(list.map((s) => s.elasticity)),
      lowEndSupport: avg(list.map((s) => s.lowEndSupport)),
    },
  }));
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}
