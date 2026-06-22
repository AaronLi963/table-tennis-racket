import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
} from 'recharts';
import type { Scores } from '@ttr/shared';

const AXIS = { stroke: '#64748b', fontSize: 11 };

export function SpectrumChart({ data }: { data: { freq: number[]; mag: number[] } }) {
  const rows = data.freq.map((f, i) => ({ freq: f, mag: data.mag[i] }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <XAxis dataKey="freq" tick={AXIS} unit="Hz" type="number" domain={['dataMin', 'dataMax']} />
        <YAxis tick={AXIS} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
          labelFormatter={(v) => `${v} Hz`}
          formatter={(v: number) => [v.toFixed(2), '幅度']}
        />
        <Line type="monotone" dataKey="mag" stroke="#38bdf8" dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DecayChart({ data }: { data: { t: number[]; v: number[] } }) {
  const rows = data.t.map((t, i) => ({ t, v: data.v[i] }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <XAxis dataKey="t" tick={AXIS} unit="ms" type="number" domain={['dataMin', 'dataMax']} />
        <YAxis tick={AXIS} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
          labelFormatter={(v) => `${v} ms`}
          formatter={(v: number) => [v.toFixed(3), '包絡']}
        />
        <Line type="monotone" dataKey="v" stroke="#f472b6" dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc'];

export function ScoreRadar({ series }: { series: { name: string; scores: Scores }[] }) {
  const axes = [
    { key: 'hardness', label: '軟硬度' },
    { key: 'elasticity', label: '彈性' },
    { key: 'lowEndSupport', label: '底勁' },
  ] as const;
  const data = axes.map((a) => {
    const row: Record<string, number | string> = { axis: a.label };
    series.forEach((s) => (row[s.name] = s.scores[a.key]));
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius={110}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: '#cbd5e1', fontSize: 13 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
        {series.map((s, i) => (
          <Radar
            key={s.name}
            name={s.name}
            dataKey={s.name}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.25}
          />
        ))}
        <Legend />
      </RadarChart>
    </ResponsiveContainer>
  );
}
