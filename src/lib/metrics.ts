// Shared selectors so every page computes metrics the same way.
import { DAY, NOW, startOfDay, dailyHistory, type DayStat } from '../data/seed';
import type { Call, Lead } from '../data/types';

export type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | '90d' | '12m' | 'custom';
export interface Range { key: RangeKey; from: Date; to: Date; label: string }
export const RANGE_LABELS: Record<RangeKey, string> = { today: 'Today', yesterday: 'Yesterday', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months', custom: 'Custom range' };

export function makeRange(key: RangeKey, custom?: { from: string; to: string }): Range {
  const today = startOfDay(NOW);
  const end = new Date(today.getTime() + DAY - 1);
  switch (key) {
    case 'today': return { key, from: today, to: end, label: RANGE_LABELS[key] };
    case 'yesterday': return { key, from: new Date(today.getTime() - DAY), to: new Date(today.getTime() - 1), label: RANGE_LABELS[key] };
    case '7d': return { key, from: new Date(today.getTime() - 6 * DAY), to: end, label: RANGE_LABELS[key] };
    case '30d': return { key, from: new Date(today.getTime() - 29 * DAY), to: end, label: RANGE_LABELS[key] };
    case '90d': return { key, from: new Date(today.getTime() - 89 * DAY), to: end, label: RANGE_LABELS[key] };
    case '12m': return { key, from: new Date(today.getTime() - 364 * DAY), to: end, label: RANGE_LABELS[key] };
    case 'custom': {
      const f = custom?.from ? startOfDay(new Date(custom.from)) : new Date(today.getTime() - 13 * DAY);
      const t = custom?.to ? new Date(startOfDay(new Date(custom.to)).getTime() + DAY - 1) : end;
      return { key, from: f, to: t, label: `${f.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` };
    }
  }
}
export function previousRange(r: Range): Range {
  const len = r.to.getTime() - r.from.getTime() + 1;
  return { ...r, from: new Date(r.from.getTime() - len), to: new Date(r.from.getTime() - 1), label: 'previous period' };
}
export const inRange = (iso: string, r: Range) => { const t = new Date(iso).getTime(); return t >= r.from.getTime() && t <= r.to.getTime(); };
export const callsIn = (calls: Call[], r: Range) => calls.filter((c) => inRange(c.startedAt, r));

/** Daily series combining 90-day detailed logs with older daily aggregates. */
export function dailySeries(calls: Call[], from: Date, to: Date): DayStat[] {
  const map = new Map<string, DayStat>();
  for (let t = startOfDay(from).getTime(); t <= to.getTime(); t += DAY) {
    const k = new Date(t).toDateString();
    map.set(k, { date: new Date(t).toISOString(), calls: 0, connected: 0, qualified: 0, minutes: 0, cost: 0 });
  }
  for (const h of dailyHistory) { const k = new Date(h.date).toDateString(); if (map.has(k)) map.set(k, { ...h, date: map.get(k)!.date }); }
  for (const c of calls) {
    const k = new Date(c.startedAt).toDateString(); const d = map.get(k); if (!d) continue;
    d.calls++; if (c.connected) d.connected++; if (c.outcome === 'Qualified' || c.outcome === 'Transferred to human') d.qualified++;
    d.minutes += c.duration / 60; d.cost += c.cost;
  }
  return [...map.values()].map((d) => ({ ...d, minutes: Math.round(d.minutes), cost: +d.cost.toFixed(2) }));
}

export function bucketSeries(days: DayStat[], by: 'day' | 'week' | 'month') {
  if (by === 'day') return days.map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }));
  const map = new Map<string, DayStat & { label: string }>();
  for (const d of days) {
    const dt = new Date(d.date);
    let key: string; let label: string;
    if (by === 'week') { const m = new Date(dt); m.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); key = m.toDateString(); label = 'w/c ' + m.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
    else { key = `${dt.getFullYear()}-${dt.getMonth()}`; label = dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); }
    const cur = map.get(key) ?? { date: d.date, label, calls: 0, connected: 0, qualified: 0, minutes: 0, cost: 0 };
    cur.calls += d.calls; cur.connected += d.connected; cur.qualified += d.qualified; cur.minutes += d.minutes; cur.cost = +(cur.cost + d.cost).toFixed(2);
    map.set(key, cur);
  }
  return [...map.values()];
}

export function summarize(calls: Call[]) {
  const connected = calls.filter((c) => c.connected);
  const qualified = calls.filter((c) => c.outcome === 'Qualified' || c.outcome === 'Transferred to human');
  const warm = calls.filter((c) => c.outcome === 'Interested');
  const secs = calls.reduce((s, c) => s + c.duration, 0);
  const cost = calls.reduce((s, c) => s + c.cost, 0);
  return {
    total: calls.length, connected: connected.length, failed: calls.length - connected.length,
    qualified: qualified.length, warm: warm.length,
    minutes: Math.round(secs / 60), cost,
    avgDuration: connected.length ? connected.reduce((s, c) => s + c.duration, 0) / connected.length : 0,
    connectRate: calls.length ? (connected.length / calls.length) * 100 : 0,
    qualRate: connected.length ? (qualified.length / connected.length) * 100 : 0,
  };
}

export const leadBuckets = (leads: Lead[]) => ({
  hot: leads.filter((l) => l.status === 'Hot').length,
  warm: leads.filter((l) => l.status === 'Warm').length,
  cold: leads.filter((l) => l.status === 'Cold').length,
  converted: leads.filter((l) => l.status === 'Converted').length,
  callback: leads.filter((l) => l.status === 'Callback requested').length,
  notInterested: leads.filter((l) => l.status === 'Not interested').length,
  unreachable: leads.filter((l) => l.status === 'Unreachable').length,
});

export const QUALIFIED_STATUSES = ['Hot', 'Warm', 'Callback requested', 'Converted'] as const;
