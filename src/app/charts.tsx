// Hand-rolled SVG charts in the app's amber-on-dark style. Each has an aria-label
// summary for screen readers and an honest empty state.
const W = 320, H = 140, PAD = { l: 34, r: 8, t: 10, b: 22 };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export type LinePoint = { date: string; value: number };
export function LineChart({ points, label, unit = "" }: { points: LinePoint[]; label: string; unit?: string }) {
  if (points.length < 2) return <p className="app-chart-empty">Log at least two sessions to see a trend.</p>;
  const values = points.map(point => point.value);
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const x = (i: number) => PAD.l + i / (points.length - 1) * (W - PAD.l - PAD.r);
  const y = (value: number) => PAD.t + (1 - (value - min) / span) * (H - PAD.t - PAD.b);
  const last = points[points.length - 1];
  return <svg className="app-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${points.length} sessions, from ${points[0].value}${unit} to ${last.value}${unit}`}>
    {[min, max].map(value => <g key={value}><line x1={PAD.l} x2={W - PAD.r} y1={y(value)} y2={y(value)} /><text x={PAD.l - 4} y={y(value) + 3} textAnchor="end">{Math.round(value).toLocaleString()}</text></g>)}
    <polyline points={points.map((point, i) => `${x(i)},${y(point.value)}`).join(" ")} />
    {points.length <= 30 && points.map((point, i) => <circle key={i} cx={x(i)} cy={y(point.value)} r="2.5" />)}
    <text x={PAD.l} y={H - 6}>{shortDate(points[0].date)}</text>
    <text x={W - PAD.r} y={H - 6} textAnchor="end">{shortDate(last.date)}</text>
  </svg>;
}

export type Bar = { label: string; value: number };
export function BarChart({ bars, target, label }: { bars: Bar[]; target?: number; label: string }) {
  if (!bars.some(bar => bar.value > 0)) return <p className="app-chart-empty">No training days in this period yet.</p>;
  const max = Math.max(target ?? 0, ...bars.map(bar => bar.value), 1);
  const slot = (W - PAD.l - PAD.r) / bars.length;
  const y = (value: number) => PAD.t + (1 - value / max) * (H - PAD.t - PAD.b);
  return <svg className="app-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${bars.map(bar => `${bar.label} ${bar.value}`).join(", ")}`}>
    <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} /><text x={PAD.l - 4} y={y(0) + 3} textAnchor="end">0</text>
    {target !== undefined && <g className="app-chart-target"><line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} /><text x={PAD.l - 4} y={y(target) + 3} textAnchor="end">{target}</text></g>}
    {bars.map((bar, i) => bar.value > 0 && <rect key={i} x={PAD.l + i * slot + slot * 0.15} width={slot * 0.7} y={y(bar.value)} height={y(0) - y(bar.value)} />)}
    <text x={PAD.l} y={H - 6}>{bars[0].label}</text>
    <text x={W - PAD.r} y={H - 6} textAnchor="end">{bars[bars.length - 1].label}</text>
  </svg>;
}
