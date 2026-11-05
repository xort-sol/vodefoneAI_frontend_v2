import { useEffect, useMemo, useState, type MutableRefObject, type ReactNode } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useApp } from '../../store/store';
import { Card, ChartTip, CHART, Legend } from '../../components/ui';
import { dailySeries, summarize, type Range } from '../../lib/metrics';
import { fmtDur, fmtGBP, fmtInt, fmtPct } from '../../lib/format';
import { DAY, NOW, startOfDay, type DayStat } from '../../data/seed';
import type { Call, CallOutcome } from '../../data/types';

export type ExportRows = { name: string; rows: Record<string, unknown>[] };
export interface AnalyticsCtx {
  range: Range;
  calls: Call[]; // detailed calls in range, campaign/agent filters applied
  scopeCalls: Call[]; // detailed calls (any date) with campaign/agent filters applied
  campaignId: string; agentId: string; filtered: boolean;
  exportRef: MutableRefObject<(() => ExportRows) | null>;
}

export const DETAIL_START = new Date(startOfDay(NOW).getTime() - 89 * DAY);
export const AX = { tickLine: false, axisLine: false } as const;

/** Daily series (detailed logs + older aggregates). Aggregates cannot be split by campaign/agent, so they are zeroed when filtered. */
export function maskedDaily(calls: Call[], from: Date, to: Date, filtered: boolean): DayStat[] {
  const d = dailySeries(calls, from, to);
  if (!filtered) return d;
  return d.map((x) => (new Date(x.date) < DETAIL_START ? { ...x, calls: 0, connected: 0, qualified: 0, minutes: 0, cost: 0 } : x));
}
export const sumDays = (days: DayStat[]) => days.reduce((s, d) => ({ calls: s.calls + d.calls, connected: s.connected + d.connected, qualified: s.qualified + d.qualified, minutes: s.minutes + d.minutes, cost: s.cost + d.cost }), { calls: 0, connected: 0, qualified: 0, minutes: 0, cost: 0 });

export function yearBuckets(days: DayStat[]) {
  const m = new Map<number, DayStat & { label: string }>();
  for (const d of days) {
    const y = new Date(d.date).getFullYear();
    const cur = m.get(y) ?? { date: d.date, label: String(y), calls: 0, connected: 0, qualified: 0, minutes: 0, cost: 0 };
    cur.calls += d.calls; cur.connected += d.connected; cur.qualified += d.qualified; cur.minutes += d.minutes; cur.cost = +(cur.cost + d.cost).toFixed(2);
    m.set(y, cur);
  }
  return [...m.values()];
}
/** Same labels as bucketSeries so detailed-call breakdowns line up with series. */
export function bucketLabel(iso: string, by: 'day' | 'week' | 'month' | 'year') {
  const dt = new Date(iso);
  if (by === 'day') return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (by === 'week') { const m = new Date(dt); m.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return 'w/c ' + m.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  if (by === 'month') return dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  return String(dt.getFullYear());
}

export const OUTCOME_GROUPS: { key: string; label: string; color: string; outcomes: CallOutcome[] }[] = [
  { key: 'qualified', label: 'Qualified / transferred', color: CHART.green, outcomes: ['Qualified', 'Transferred to human'] },
  { key: 'interested', label: 'Interested', color: CHART.blue, outcomes: ['Interested'] },
  { key: 'callback', label: 'Callback', color: CHART.purple, outcomes: ['Callback requested'] },
  { key: 'declined', label: 'Declined / opted out', color: CHART.ink, outcomes: ['Not interested', 'Opted out'] },
  { key: 'unreached', label: 'No answer / VM / busy', color: CHART.light, outcomes: ['No answer', 'Voicemail', 'Busy'] },
  { key: 'failed', label: 'Failed', color: CHART.orange, outcomes: ['Failed'] },
];
export const groupOf = (o: CallOutcome) => OUTCOME_GROUPS.find((g) => g.outcomes.includes(o))!.key;

export function StatStrip({ items, cols }: { items: { label: string; value: ReactNode; foot?: ReactNode }[]; cols?: number }) {
  return (
    <div className="stat-strip" style={{ gridTemplateColumns: `repeat(${cols ?? items.length}, minmax(0,1fr))`, marginBottom: 16 }}>
      {items.map((i) => (
        <div key={i.label}>
          <div className="kpi-label">{i.label}</div>
          <div className="kpi-value mt-4">{i.value}</div>
          {i.foot && <div className="kpi-foot mt-4"><span className="truncate">{i.foot}</span></div>}
        </div>
      ))}
    </div>
  );
}

export function useExport(ctx: AnalyticsCtx, fn: () => ExportRows) {
  useEffect(() => { ctx.exportRef.current = fn; });
}

export function NoteFiltered({ ctx, from }: { ctx: AnalyticsCtx; from: Date }) {
  if (!ctx.filtered || from >= DETAIL_START) return null;
  return <div className="xs muted mt-8">Daily aggregates before {DETAIL_START.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} are not split by campaign or agent, so they are excluded while a filter is active.</div>;
}

/* ---------------- Campaign comparison ---------------- */
export function campaignStats(calls: Call[], campaignId: string, leadsQualified: number) {
  const cs = calls.filter((c) => c.campaignId === campaignId);
  const s = summarize(cs);
  return { ...s, cpq: s.qualified ? s.cost / s.qualified : 0, cpc: s.total ? s.cost / s.total : 0, leadsQualified };
}

export function CampaignComparison({ ctx, mode = 'calls' }: { ctx: AnalyticsCtx; mode?: 'calls' | 'cost' }) {
  const app = useApp();
  const inRangeAll = useMemo(() => app.calls.filter((c) => +new Date(c.startedAt) >= +ctx.range.from && +new Date(c.startedAt) <= +ctx.range.to && (!ctx.agentId || c.agentId === ctx.agentId)), [app.calls, ctx.range, ctx.agentId]);
  const camps = app.campaigns.filter((c) => inRangeAll.some((x) => x.campaignId === c.id));
  const ranked = [...camps].sort((a, b) => inRangeAll.filter((x) => x.campaignId === b.id).length - inRangeAll.filter((x) => x.campaignId === a.id).length);
  const [sel, setSel] = useState<string[]>(() => ranked.slice(0, 2).map((c) => c.id));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id]));
  const stats = sel.map((id) => ({ id, name: app.campaignById.get(id)?.name ?? id, ...campaignStats(inRangeAll, id, 0) }));
  const COLORS = [CHART.ink, CHART.blue, CHART.orange];
  const metrics: { label: string; get: (s: (typeof stats)[number]) => number; fmt: (v: number) => string; better: 'high' | 'low' }[] = mode === 'calls' ? [
    { label: 'Attempts', get: (s) => s.total, fmt: fmtInt, better: 'high' },
    { label: 'Connected', get: (s) => s.connected, fmt: fmtInt, better: 'high' },
    { label: 'Connect rate', get: (s) => s.connectRate, fmt: (v) => fmtPct(v), better: 'high' },
    { label: 'Qualified', get: (s) => s.qualified, fmt: fmtInt, better: 'high' },
    { label: 'Qualification rate', get: (s) => s.qualRate, fmt: (v) => fmtPct(v), better: 'high' },
    { label: 'Avg. duration', get: (s) => s.avgDuration, fmt: fmtDur, better: 'high' },
    { label: 'Spend', get: (s) => s.cost, fmt: (v) => fmtGBP(v, 2), better: 'low' },
  ] : [
    { label: 'Spend', get: (s) => s.cost, fmt: (v) => fmtGBP(v, 2), better: 'low' },
    { label: 'Minutes', get: (s) => s.minutes, fmt: fmtInt, better: 'high' },
    { label: 'Cost per call', get: (s) => s.cpc, fmt: (v) => fmtGBP(v, 3), better: 'low' },
    { label: 'Cost per connected', get: (s) => (s.connected ? s.cost / s.connected : 0), fmt: (v) => fmtGBP(v, 3), better: 'low' },
    { label: 'Cost per qualified', get: (s) => s.cpq, fmt: (v) => fmtGBP(v, 2), better: 'low' },
  ];
  const chartData = metrics.slice(0, 4).map((m) => {
    const max = Math.max(1e-9, ...stats.map((s) => m.get(s)));
    return { metric: m.label, ...Object.fromEntries(stats.map((s) => [s.id, +((m.get(s) / max) * 100).toFixed(1)])) };
  });
  return (
    <Card title="Campaign comparison" sub="Pick 2–3 campaigns to compare side by side · best value in each row highlighted">
      <div className="row-wrap" style={{ gap: 6 }}>
        {ranked.map((c) => {
          const on = sel.includes(c.id); const i = sel.indexOf(c.id);
          return (
            <button key={c.id} className="tag" onClick={() => toggle(c.id)} disabled={!on && sel.length >= 3} title={!on && sel.length >= 3 ? 'Up to 3 campaigns' : undefined}
              style={{ cursor: 'pointer', borderColor: on ? COLORS[i] : undefined, color: on ? 'var(--ink)' : undefined, opacity: !on && sel.length >= 3 ? 0.5 : 1 }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: on ? COLORS[i] : 'var(--smoke)', display: 'inline-block' }} />{c.name}
            </button>
          );
        })}
      </div>
      {stats.length < 2 ? <div className="small muted mt-16">Select at least two campaigns.</div> : (
        <div className="col mt-16" style={{ gap: 16 }}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Metric</th>{stats.map((s, i) => <th key={s.id} className="num"><span className="row gap-4" style={{ justifyContent: 'flex-end' }}><i style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i], display: 'inline-block' }} />{s.name}</span></th>)}</tr></thead>
              <tbody>
                {metrics.map((m) => {
                  const vals = stats.map((s) => m.get(s));
                  const best = m.better === 'high' ? Math.max(...vals) : Math.min(...vals.filter((v) => v > 0));
                  return <tr key={m.label}><td className="subtle">{m.label}</td>{stats.map((s, i) => <td key={s.id} className={`num mono ${vals[i] === best ? 'strong' : ''}`} style={vals[i] === best ? { color: CHART.green } : undefined}>{m.fmt(vals[i])}</td>)}</tr>;
                })}
              </tbody>
            </table>
          </div>
          <div>
            <Legend items={stats.map((s, i) => ({ label: s.name, color: COLORS[i] }))} />
            <div style={{ height: 180 }} className="mt-8">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ left: -20, right: 4, top: 8 }} barGap={2}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="metric" {...AX} interval={0} tick={{ fontSize: 10 }} />
                  <YAxis {...AX} width={44} domain={[0, 100]} tickFormatter={(v) => `${v}`} />
                  <Tooltip content={<ChartTip fmt={(v) => `${v}% of best`} />} cursor={{ fill: '#F5F5F5' }} />
                  {stats.map((s, i) => <Bar key={s.id} dataKey={s.id} name={s.name} fill={COLORS[i]} radius={[2, 2, 0, 0]} maxBarSize={14} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="xs muted">Indexed to the best campaign (=100) per metric.</div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------------- local persistence for saved reports & schedules ---------------- */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; }
  });
  const set = (n: T | ((p: T) => T)) => setV((p) => {
    const next = typeof n === 'function' ? (n as (p: T) => T)(p) : n;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  return [v, set];
}

export interface SavedReport {
  id: string; name: string; metrics: string[]; dimension: string; chart: string; rangeKey: string; connectedOnly: boolean; sentiment: string; createdAt: string; createdBy: string;
}
export interface Schedule {
  id: string; report: string; frequency: 'Daily' | 'Weekly' | 'Monthly'; day: string; time: string; recipients: string[]; format: 'PDF' | 'CSV' | 'Excel'; active: boolean; lastRun: string | null; createdBy: string;
}
