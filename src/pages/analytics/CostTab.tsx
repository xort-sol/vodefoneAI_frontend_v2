import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useApp } from '../../store/store';
import { Avatar, Card, ChartTip, CHART, Legend, Progress } from '../../components/ui';
import { bucketSeries, summarize } from '../../lib/metrics';
import { fmtGBP, fmtInt, fmtPct } from '../../lib/format';
import { DAY, NOW, startOfDay } from '../../data/seed';
import { AX, CampaignComparison, maskedDaily, NoteFiltered, StatStrip, sumDays, useExport, type AnalyticsCtx } from './common';

export default function CostTab({ ctx }: { ctx: AnalyticsCtx }) {
  const app = useApp();
  const days = useMemo(() => maskedDaily(ctx.scopeCalls, ctx.range.from, ctx.range.to, ctx.filtered), [ctx.scopeCalls, ctx.range, ctx.filtered]);
  const tot = sumDays(days);
  const conversions = useMemo(() => new Set(ctx.calls.filter((c) => c.outcome === 'Qualified' || c.outcome === 'Transferred to human').map((c) => c.leadId).filter((id) => app.leadById.get(id)?.status === 'Converted')).size, [ctx.calls, app.leadById]);

  const yearFrom = new Date(startOfDay(NOW).getTime() - 364 * DAY);
  const monthly = useMemo(() => bucketSeries(maskedDaily(ctx.scopeCalls, yearFrom, new Date(startOfDay(NOW).getTime() + DAY - 1), ctx.filtered), 'month')
    .map((m) => ({ ...m, cpq: m.qualified ? +(m.cost / m.qualified).toFixed(2) : 0, cpm: m.minutes ? +(m.cost / m.minutes).toFixed(3) : 0 })), [ctx.scopeCalls, ctx.filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const byCampaign = useMemo(() => app.campaigns.map((c) => {
    const s = summarize(ctx.calls.filter((x) => x.campaignId === c.id));
    return { id: c.id, name: c.name, cost: +s.cost.toFixed(2), qualified: s.qualified, cpq: s.qualified ? s.cost / s.qualified : 0, minutes: s.minutes, rate: c.costPerMinute };
  }).filter((r) => r.cost > 0).sort((a, b) => b.cost - a.cost), [app.campaigns, ctx.calls]);

  const byAgent = useMemo(() => {
    const total = ctx.calls.reduce((s, c) => s + c.cost, 0) || 1;
    return app.agents.map((a) => {
      const s = summarize(ctx.calls.filter((c) => c.agentId === a.id));
      return { agent: a, ...s, share: (s.cost / total) * 100 };
    }).filter((r) => r.total > 0).sort((a, b) => b.cost - a.cost);
  }, [app.agents, ctx.calls]);

  useExport(ctx, () => ({ name: 'cost-analytics', rows: byCampaign.map((r) => ({ campaign: r.name, spend_gbp: r.cost, minutes: r.minutes, qualified: r.qualified, cost_per_qualified_gbp: r.cpq.toFixed(2), rate_per_min_gbp: r.rate })) }));

  return (
    <>
      <StatStrip items={[
        { label: 'Total spend', value: fmtGBP(tot.cost, 0), foot: `${fmtInt(tot.minutes)} billable minutes` },
        { label: 'Cost per call', value: fmtGBP(tot.calls ? tot.cost / tot.calls : 0, 3), foot: `${fmtInt(tot.calls)} attempts` },
        { label: 'Per connected call', value: fmtGBP(tot.connected ? tot.cost / tot.connected : 0, 3), foot: `${fmtInt(tot.connected)} connected` },
        { label: 'Per qualified lead', value: fmtGBP(tot.qualified ? tot.cost / tot.qualified : 0, 2), foot: `${fmtInt(tot.qualified)} qualified` },
        { label: 'Per conversion', value: fmtGBP(conversions ? ctx.calls.reduce((s, c) => s + c.cost, 0) / conversions : 0, 2), foot: `${fmtInt(conversions)} sales (detailed log)` },
      ]} />

      <div className="grid g-main-side" style={{ marginBottom: 16 }}>
        <Card title="Monthly cost trend" sub="Last 12 months · spend and cost per qualified lead (includes daily aggregates)">
          <Legend items={[{ label: 'Spend', color: CHART.orange }, { label: 'Cost / qualified', color: CHART.ink }]} />
          <div style={{ height: 250 }} className="mt-12">
            <ResponsiveContainer>
              <ComposedChart data={monthly} margin={{ left: -6, right: 0, top: 8 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" {...AX} />
                <YAxis yAxisId="a" {...AX} width={48} tickFormatter={(v) => `£${v}`} />
                <YAxis yAxisId="b" orientation="right" {...AX} width={40} tickFormatter={(v) => `£${v}`} />
                <Tooltip content={<ChartTip fmt={(v) => fmtGBP(v, 2)} />} cursor={{ fill: '#F7F7F7' }} />
                <Bar yAxisId="a" dataKey="cost" name="Spend" fill={CHART.orange} radius={[2, 2, 0, 0]} maxBarSize={26} fillOpacity={0.85} />
                <Line yAxisId="b" type="monotone" dataKey="cpq" name="Cost / qualified" stroke={CHART.ink} strokeWidth={1.5} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <NoteFiltered ctx={ctx} from={yearFrom} />
        </Card>
        <Card title="Campaign expenditure" sub={ctx.range.label}>
          <div style={{ height: 270 }}>
            <ResponsiveContainer>
              <BarChart data={byCampaign} layout="vertical" margin={{ left: 0, right: 16, top: 4 }}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" {...AX} tickFormatter={(v) => `£${v}`} />
                <YAxis type="category" dataKey="name" {...AX} width={120} tick={{ fontSize: 10.5 }} />
                <Tooltip content={<ChartTip fmt={(v) => fmtGBP(v, 2)} />} cursor={{ fill: '#F7F7F7' }} />
                <Bar dataKey="cost" name="Spend" fill={CHART.ink} barSize={12} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <Card flush title="Agent usage" sub="Minutes and spend by AI agent">
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead><tr><th>Agent</th><th className="num">Calls</th><th className="num">Minutes</th><th className="num">Spend</th><th>Share</th><th className="num">£ / qualified</th></tr></thead>
              <tbody>
                {byAgent.map((r) => (
                  <tr key={r.agent.id}>
                    <td data-label="Agent"><span className="row"><Avatar initials={r.agent.initials} color={r.agent.color} agent size="sm" />{r.agent.name}</span></td>
                    <td data-label="Calls" className="num mono">{fmtInt(r.total)}</td>
                    <td data-label="Minutes" className="num mono">{fmtInt(r.minutes)}</td>
                    <td data-label="Spend" className="num mono">{fmtGBP(r.cost, 2)}</td>
                    <td data-label="Share"><div className="row"><div style={{ width: 60 }}><Progress value={r.share} color={CHART.orange} /></div><span className="mono small">{fmtPct(r.share)}</span></div></td>
                    <td data-label="£ / qualified" className="num mono">{r.qualified ? fmtGBP(r.cost / r.qualified, 2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card flush title="Campaign unit economics" sub="Rate card and efficiency">
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead><tr><th>Campaign</th><th className="num">Rate / min</th><th className="num">Minutes</th><th className="num">Qualified</th><th className="num">£ / qualified</th></tr></thead>
              <tbody>
                {byCampaign.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Campaign" className="cell-primary">{r.name}</td>
                    <td data-label="Rate / min" className="num mono">{fmtGBP(r.rate, 3)}</td>
                    <td data-label="Minutes" className="num mono">{fmtInt(r.minutes)}</td>
                    <td data-label="Qualified" className="num mono">{fmtInt(r.qualified)}</td>
                    <td data-label="£ / qualified" className="num mono strong">{r.qualified ? fmtGBP(r.cpq, 2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <CampaignComparison ctx={ctx} mode="cost" />
    </>
  );
}
