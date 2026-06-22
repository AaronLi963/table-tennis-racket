import { useEffect, useState } from 'react';
import type { PopulationStats } from '@ttr/shared';
import { api, type CompareEntry } from '../api.ts';

export function CalibrationPage() {
  const [stats, setStats] = useState<PopulationStats | null>(null);
  const [minRequired, setMinRequired] = useState(2);
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const [pop, rackets] = await Promise.all([api.getPopulation(), api.listRackets()]);
    setStats(pop.stats);
    setMinRequired(pop.minRequired);
    if (rackets.length > 0) {
      setEntries(await api.compare(rackets.map((r) => r.id)));
    } else {
      setEntries([]);
    }
    setMsg('已更新。');
  }

  const scored = entries.filter((e) => e.scores).length;

  return (
    <div>
      <div className="card">
        <h2>自動評分（相對分數）</h2>
        <p className="muted">
          你不需要輸入任何真實數據。系統會把每支球拍的物理特徵，
          <strong>相對於你整批已量測球拍的分布</strong>自動換算成 0–100 分：
          50 分 ≈ 收藏平均，越高代表在你的收藏中越「硬 / 彈 / 有底勁」。
          球拍量得越多，相對分數越穩定。底勁屬非線性特性，僅為估計值。
        </p>
        {stats ? (
          <p>
            目前以 <strong>{stats.sampleCount}</strong> 支球拍的最新量測為基準 · 收藏平均：f0{' '}
            {stats.f0.mean.toFixed(0)} Hz、Q {stats.q.mean.toFixed(1)}、低/高頻比{' '}
            {stats.lowHighEnergyRatio.mean.toFixed(2)}
          </p>
        ) : (
          <p className="warn">
            ⚠️ 至少需要 {minRequired} 支「已量測」的球拍才能產生相對分數。請到「量測」頁多測幾支。
          </p>
        )}
        <button onClick={load}>🔄 重新整理</button>
        {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
      </div>

      <div className="card">
        <h2>各球拍目前分數</h2>
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
        {entries.length === 0 && <p className="muted">尚無球拍，請先到「量測」頁新增並量測。</p>}
        {entries.length > 0 && scored === 0 && (
          <p className="muted">尚無球拍有分數（需先量測足夠球拍）。</p>
        )}
      </div>
    </div>
  );
}
