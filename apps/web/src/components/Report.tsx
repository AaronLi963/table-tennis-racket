import type { FeatureVector, QualityMetrics, Scores } from '@ttr/shared';

export function ScoreCards({ scores }: { scores: Scores | null }) {
  if (!scores) {
    return (
      <p className="muted">
        相對分數需要至少 2 支「已量測」的球拍才能產生。請再量測並儲存幾支球拍，分數會自動出現。
      </p>
    );
  }
  const items: { label: string; key: keyof Scores; note?: string }[] = [
    { label: '軟硬度', key: 'hardness' },
    { label: '彈性', key: 'elasticity' },
    { label: '底勁', key: 'lowEndSupport', note: '估計' },
  ];
  return (
    <div className="scoreGrid">
      {items.map((it) => (
        <div className="scoreBox" key={it.key}>
          <div className="val">{scores[it.key].toFixed(0)}</div>
          <p className="label">
            {it.label}
            {it.note && <span className="badge">{it.note}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

const FEATURE_ROWS: { label: string; fmt: (f: FeatureVector) => string }[] = [
  { label: '主共振頻率 f0', fmt: (f) => `${f.f0.toFixed(1)} Hz` },
  { label: '頻譜質心', fmt: (f) => `${f.spectralCentroid.toFixed(0)} Hz` },
  { label: '頻譜擴散', fmt: (f) => `${f.spectralSpread.toFixed(0)} Hz` },
  { label: '低/高頻能量比', fmt: (f) => f.lowHighEnergyRatio.toFixed(2) },
  { label: '衰減時間 τ', fmt: (f) => `${(f.tau * 1000).toFixed(1)} ms` },
  { label: '品質因子 Q', fmt: (f) => f.q.toFixed(1) },
  { label: '阻尼比 ζ', fmt: (f) => f.zeta.toFixed(4) },
];

export function FeatureTable({ features }: { features: FeatureVector }) {
  return (
    <table className="featTable">
      <tbody>
        {FEATURE_ROWS.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td>{r.fmt(features)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function QualityWarnings({ quality }: { quality: QualityMetrics }) {
  return (
    <div>
      <p className="muted">
        品質 {(quality.quality * 100).toFixed(0)}% · SNR {quality.snrDb.toFixed(0)} dB · 偵測到{' '}
        {quality.onsetCount} 次敲擊
      </p>
      {quality.warnings.map((w, i) => (
        <div className="warn" key={i}>
          ⚠️ {w}
        </div>
      ))}
    </div>
  );
}
