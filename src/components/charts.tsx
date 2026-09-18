import React from 'react';

/** Stacked daily bars: published (accent) with failed (danger) on top. Labels are direct, no legend needed beyond the caption. */
export function DailyBars({ data }: { data: { date: string; published: number; failed: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.published + d.failed));
  const W = 640, H = 160, pad = 4, gap = data.length > 45 ? 1 : 3;
  const bw = (W - pad * 2) / data.length - gap;
  const total = data.reduce((n, d) => n + d.published + d.failed, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="chart" role="img" aria-label={`Posts per day. ${total} posts in this period.`}>
      {[0, 0.5, 1].map(f => <line key={f} x1={0} x2={W} y1={H - f * (H - 8)} y2={H - f * (H - 8)} className="chart-grid" />)}
      <text x={0} y={10} className="chart-axis">{max}</text>
      {data.map((d, i) => {
        const x = pad + i * (bw + gap);
        const hp = (d.published / max) * (H - 8), hf = (d.failed / max) * (H - 8);
        return (
          <g key={d.date}>
            <title>{`${d.date}: ${d.published} published${d.failed ? `, ${d.failed} failed` : ''}`}</title>
            {d.published > 0 && <rect x={x} y={H - hp} width={bw} height={hp} rx={2} className="bar-ok" />}
            {d.failed > 0 && <rect x={x} y={H - hp - hf} width={bw} height={hf} rx={2} className="bar-fail" />}
          </g>
        );
      })}
      <text x={0} y={H + 16} className="chart-axis">{data[0]?.date.slice(5)}</text>
      <text x={W} y={H + 16} textAnchor="end" className="chart-axis">{data[data.length - 1]?.date.slice(5)}</text>
    </svg>
  );
}

export function Sparkline({ points, label }: { points: (number | null)[]; label: string }) {
  const vals = points.filter((p): p is number => p !== null);
  if (vals.length < 2) return <span className="hint">Collecting data…</span>;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const W = 120, H = 32;
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (vals.length - 1)) * W},${H - 3 - ((v - min) / range) * (H - 6)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" role="img" aria-label={label}>
      <path d={d} className="spark-line" />
    </svg>
  );
}
