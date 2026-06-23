import { useEffect, useMemo, useState } from 'react';
import type { PopulationStats } from '@ttr/shared';
import { api, type CompareEntry } from '../api.ts';

type SortKey = 'name' | 'brand' | 'structure' | 'hardness' | 'elasticity' | 'lowEndSupport' | 'f0' | 'q';

interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
  get: (e: CompareEntry) => number | string | null;
  render: (e: CompareEntry) => string;
}

const COLUMNS: Column[] = [
  { key: 'name', label: '球拍', numeric: false, get: (e) => e.name ?? e.id, render: (e) => e.name ?? e.id },
  { key: 'brand', label: '品牌', numeric: false, get: (e) => e.brand ?? null, render: (e) => e.brand ?? '—' },
  { key: 'structure', label: '結構', numeric: false, get: (e) => e.structure ?? null, render: (e) => e.structure ?? '—' },
  { key: 'hardness', label: '軟硬度', numeric: true, get: (e) => e.scores?.hardness ?? null, render: (e) => (e.scores ? e.scores.hardness.toFixed(0) : '—') },
  { key: 'elasticity', label: '彈性', numeric: true, get: (e) => e.scores?.elasticity ?? null, render: (e) => (e.scores ? e.scores.elasticity.toFixed(0) : '—') },
  { key: 'lowEndSupport', label: '底勁', numeric: true, get: (e) => e.scores?.lowEndSupport ?? null, render: (e) => (e.scores ? e.scores.lowEndSupport.toFixed(0) : '—') },
  { key: 'f0', label: 'f0 (Hz)', numeric: true, get: (e) => e.features?.f0 ?? null, render: (e) => (e.features ? e.features.f0.toFixed(0) : '—') },
  { key: 'q', label: 'Q', numeric: true, get: (e) => e.features?.q ?? null, render: (e) => (e.features ? e.features.q.toFixed(1) : '—') },
];

export function CalibrationPage() {
  const [stats, setStats] = useState<PopulationStats | null>(null);
  const [minRequired, setMinRequired] = useState(2);
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [msg, setMsg] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'hardness',
    dir: 'desc',
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const [pop, rackets] = await Promise.all([api.getPopulation(), api.listRackets()]);
    setStats(pop.stats);
    setMinRequired(pop.minRequired);
    setEntries(rackets.length > 0 ? await api.compare(rackets.map((r) => r.id)) : []);
    setMsg('已更新。');
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  }

  const sortedEntries = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key)!;
    return [...entries].sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      // 無資料一律排在最後（與排序方向無關）
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = col.numeric
        ? (va as number) - (vb as number)
        : String(va).localeCompare(String(vb), 'zh-Hant');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [entries, sort]);

  const scored = entries.filter((e) => e.scores).length;

  return (
    <div>
      <div className="card">
        <h2>自動評分（相對分數）</h2>
        <p className="muted">
          你不需要輸入任何真實數據。系統會把每支球拍的物理特徵，
          <strong>相對於你整批已量測球拍的分布</strong>自動換算成 0–100 分：
          <strong>50 分 ≈ 收藏平均</strong>，越高代表在你的收藏中越突出。球拍量得越多，相對分數越穩定。
        </p>

        <p className="muted" style={{ marginBottom: 6 }}>各數值的意義：</p>
        <ul className="defList">
          <li>
            <b>軟硬度</b>：板身剛度。由<b>一階質量修正剛度 E1 = f1²·m</b>得出（f1 為基礎共振頻率，m 為重量）。越高越硬挺、回饋越直接。
          </li>
          <li>
            <b>彈性</b>：能量回彈 / 餘音長短。由<b>品質因子 Q</b>得出。越高代表振動衰減越慢、蓄能回彈越好（越「彈」）。
          </li>
          <li>
            <b>底勁</b>：大力量下的支撐力（屬非線性特性，為<b>估計值</b>）。由<b>高階質量修正剛度 E4 = f4²·m</b>得出（f4 為較高階振動模態）。越高越能在重擊下撐住。
          </li>
          <li>
            <b>f0 (Hz)</b>：主共振頻率，敲擊後最強的振動頻率；越高通常越硬。
          </li>
          <li>
            <b>Q</b>：品質因子，反映餘音衰減快慢；越大代表餘音越長、能量損耗越小。
          </li>
        </ul>
        <p className="muted">
          計算方式參考 踢猫Boll「我量化了乒乓球底板性能」：以質量修正剛度 <b>E ∝ f²·m</b> 評估，
          同樣音高下越重的板越剛。
        </p>

        {stats ? (
          <p>
            目前以 <strong>{stats.sampleCount}</strong> 支球拍的最新量測為基準
            （缺重量者以 {stats.fallbackWeight.toFixed(0)} g 代入）。
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
        <p className="muted">點欄位標題可排序。</p>
        <table className="featTable">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <td
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  title="點擊排序"
                >
                  {c.label}
                  {sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((e) => (
              <tr key={e.id}>
                {COLUMNS.map((c) => (
                  <td key={c.key}>{c.render(e)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <p className="muted">尚無球拍, 請先到「量測」頁新增並量測。</p>}
        {entries.length > 0 && scored === 0 && (
          <p className="muted">尚無球拍有分數（需先量測足夠球拍）。</p>
        )}
      </div>
    </div>
  );
}
