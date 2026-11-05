import { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, ChartTip, CHART, Legend, Segmented, StatusBadge } from '../../components/ui';
import { bucketSeries } from '../../lib/metrics';
import { fmtCompact, fmtDur, fmtGBP, fmtInt, fmtPct } from '../../lib/format';
import { AX, bucketLabel, CampaignComparison, groupOf, maskedDaily, NoteFiltered, OUTCOME_GROUPS, StatStrip, sumDays, useExport, yearBuckets, type AnalyticsCtx } from './common';
import type { CallOutcome } from '../../data/types';

type Bucket = 'day' | 'week' | 'month' | 'year';

export default function CallsTab({ ctx }: { ctx: AnalyticsCtx }) {
  const lenDays = Math.round((+ctx.range.to - +ctx.range.from) / 86400000);
  const [bucket, setBucket] = useState<Bucket>(lenDays > 120 ? 'month' : lenDays > 35 ? 'week' : 'day');

  const days = useMemo(() => maskedDaily(ctx.scopeCalls, ctx.range.from, ctx.range.to, ctx.filtered), [ctx.scopeCalls, ctx.range, ctx.filtered]);
  const tot = sumDays(days);
  const connectedDetailed = ctx.calls.filter((c) => c.connected);
  const avgDur = connectedDetailed.length ? connectedDetailed.reduce((s, c) => s + c.duration, 0) / connectedDetailed.length : 0;

  const series = useMemo(() => {
    const b = bucket === 'year' ? yearBuckets(days) : bucketSeries(days, bucket);
    return b.map((d) => ({ ...d, failed: d.calls - d.connected }));
  }, [days, bucket]);

  const outcomeBy: Bucket = bucket === 'year' ? 'month' : bucket;
  const outcomeSeries = useMemo(() => {
    const m = new Map<string, Record<string, number | string>>();
    const sorted = [...ctx.calls].sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt));
    for (const c of sorted) {
      const k = bucketLabel(c.startedAt, outcomeBy);
      const row = m.get(k) ?? { label: k, ...Object.fromEntries(OUTCOME_GROUPS.map((g) => [g.key, 0])) };
      row[groupOf(c.outcome)] = (row[groupOf(c.outcome)] as number) + 1;
      m.set(k, row);
    }
    return [...m.values()];
  }, [ctx.calls, outcomeBy]);

  const hours = useMemo(() => Array.from({ length: 11 }, (_, i) => {
    const h = i + 9; const cs = ctx.calls.filter((c) => new Date(c.startedAt).getHours() === h);
    const conn = cs.filter((c) => c.connected).length;
    return { label: `${String(h).padStart(2, '0')}:00`, calls: cs.length, connected: conn, rate: cs.length ? +((conn / cs.length) * 100).toFixed(1) : 0 };
  }), [ctx.calls]);
  const bestHour = [...hours].filter((h) => h.calls >= 5).sort((a, b) => b.rate - a.rate)[0];

  const outcomes = useMemo(() => {
    const m = new Map<CallOutcome, { n: number; secs: number; cost: number }>();
    ctx.calls.forEach((c) => { const r = m.get(c.outcome) ?? { n: 0, secs: 0, cost: 0 }; r.n++; r.secs += c.duration; r.cost += c.cost; m.set(c.outcome, r); });
    return [...m.entries()].map(([o, r]) => ({ outcome: o, ...r })).sort((a, b) => b.n - a.n);
  }, [ctx.calls]);

  useExport(ctx, () => ({ name: 'call-analytics', rows: series.map((d) => ({ period: d.label, attempts: d.calls, connected: d.connected, unsuccessful: d.failed, qualified: d.qualified, minutes: d.minutes, cost_gbp: d.cost })) }));

  return (
    <>
      <StatStrip items={[
        { label: 'Total attempts', value: fmtInt(tot.calls), foot: ctx.range.label.toLowerCase() },
        { label: 'Connected', value: fmtInt(tot.connected), foot: `${fmtPct(tot.calls ? (tot.connected / tot.calls) * 100 : 0)} connect rate` },
        { label: 'Failed / unreached', value: fmtInt(tot.calls - tot.connected), foot: `${fmtInt(ctx.calls.filter((c) => c.outcome === 'Failed').length)} technical failures` },
        { label: 'Avg. duration', value: fmtDur(avgDur), foot: 'connected calls' },
        { label: 'Total minutes', value: fmtCompact(tot.minutes), foot: `${fmtInt(tot.minutes / Math.max(1, days.length))} per day` },
        { label: 'Expenditure', value: fmtGBP(tot.cost, 0), foot: `${fmtGBP(tot.calls ? tot.cost / tot.calls : 0, 3)} per attempt` },
      ]} />

      <div className="grid" style={{ marginBottom: 16 }}>
        <Card title="Calls over time" sub="Connected vs unsuccessful attempts, with qualified outcomes"
          actions={<Segmented value={bucket} onChange={setBucket} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />}>
          <Legend items={[{ label: 'Connected', color: CHART.ink }, { label: 'Unsuccessful', color: CHART.light }, { label: 'Qualified', color: CHART.green }]} />
          <div style={{ height: 260 }} className="mt-12">
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ left: -12, right: 4, top: 8 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" {...AX} minTickGap={24} />
                <YAxis {...AX} width={44} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#F7F7F7' }} />
                <Bar dataKey="connected" name="Connected" stackId="a" fill={CHART.ink} maxBarSize={28} />
                <Bar dataKey="failed" name="Unsuccessful" stackId="a" fill={CHART.light} radius={[2, 2, 0, 0]} maxBarSize={28} />
                <Line type="monotone" dataKey="qualified" name="Qualified" stroke={CHART.green} strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <NoteFiltered ctx={ctx} from={ctx.range.from} />
        </Card>
      </div>

      <div className="grid g-main-side" style={{ marginBottom: 16 }}>
        <Card title="Outcomes over time" sub={`Detailed call log · by ${outcomeBy}`}>
          <Legend items={OUTCOME_GROUPS.map((g) => ({ label: g.label, color: g.color }))} />
          <div style={{ height: 240 }} className="mt-12">
            <ResponsiveContainer>
              <BarChart data={outcomeSeries} margin={{ left: -12, right: 4, top: 8 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" {...AX} minTickGap={24} />
                <YAxis {...AX} width={44} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#F7F7F7' }} />
                {OUTCOME_GROUPS.map((g, i) => <Bar key={g.key} dataKey={g.key} name={g.label} stackId="o" fill={g.color} maxBarSize={28} radius={i === OUTCOME_GROUPS.length - 1 ? [2, 2, 0, 0] : undefined} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Calls by hour" sub={bestHour ? `Best connect rate at ${bestHour.label} (${fmtPct(bestHour.rate)})` : 'Attempts and connect rate'}>
          <div style={{ height: 268 }}>
            <ResponsiveContainer>
              <ComposedChart data={hours} margin={{ left: -16, right: 0, top: 8 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" {...AX} interval={1} tickFormatter={(v: string) => v.slice(0, 2)} />
                <YAxis yAxisId="a" {...AX} width={40} />
                <YAxis yAxisId="b" orientation="right" {...AX} width={44} tickFormatter={(v) => `${v}%`} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
                <Tooltip content={<ChartTip fmt={(v, n) => (n === 'Connect rate' ? `${v}%` : fmtInt(v))} />} cursor={{ fill: '#F7F7F7' }} />
                <Bar yAxisId="a" dataKey="calls" name="Attempts" fill={CHART.light} radius={[2, 2, 0, 0]} maxBarSize={18} />
                <Bar yAxisId="a" dataKey="connected" name="Connected" fill={CHART.blue} radius={[2, 2, 0, 0]} maxBarSize={18} />
                <Line yAxisId="b" type="monotone" dataKey="rate" name="Connect rate" stroke={CHART.ink} strokeWidth={1.25} strokeDasharray="3 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid g-main-side" style={{ marginBottom: 16 }}>
        <CampaignComparison ctx={ctx} mode="calls" />
        <Card flush title="Outcome breakdown" sub="Detailed call log">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Outcome</th><th className="num">Calls</th><th className="num">Share</th><th className="num">Avg dur.</th></tr></thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.outcome}>
                    <td><StatusBadge status={o.outcome} /></td>
                    <td className="num mono">{fmtInt(o.n)}</td>
                    <td className="num mono">{fmtPct((o.n / Math.max(1, ctx.calls.length)) * 100)}</td>
                    <td className="num mono">{fmtDur(o.secs / o.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
