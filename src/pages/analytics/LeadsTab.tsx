import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useApp } from '../../store/store';
import { Card, ChartTip, CHART, Legend, Progress, Segmented } from '../../components/ui';
import { inRange } from '../../lib/metrics';
import { fmtInt, fmtPct } from '../../lib/format';
import { AX, StatStrip, useExport, type AnalyticsCtx } from './common';
import type { Lead } from '../../data/types';

const REACHED_EXCLUDE = ['New', 'Queued', 'Contacted', 'Unreachable'];
const QUAL = ['Hot', 'Warm', 'Converted'];

function stats(ls: Lead[]) {
  const contacted = ls.filter((l) => l.attempts > 0);
  const reached = contacted.filter((l) => !REACHED_EXCLUDE.includes(l.status));
  const qualified = reached.filter((l) => QUAL.includes(l.status));
  const converted = reached.filter((l) => l.status === 'Converted');
  return {
    total: ls.length, contacted: contacted.length, reached: reached.length, qualified: qualified.length, converted: converted.length,
    hot: ls.filter((l) => l.status === 'Hot').length, warm: ls.filter((l) => l.status === 'Warm').length, cold: ls.filter((l) => l.status === 'Cold').length,
    callback: ls.filter((l) => l.status === 'Callback requested').length,
    qualPct: reached.length ? (qualified.length / reached.length) * 100 : 0,
    convPct: qualified.length ? (converted.length / qualified.length) * 100 : 0,
  };
}

export default function LeadsTab({ ctx }: { ctx: AnalyticsCtx }) {
  const app = useApp();
  const [cohort, setCohort] = useState<'range' | 'all'>('range');
  const leads = useMemo(() => app.leads.filter((l) => {
    if (l.archived) return false;
    if (ctx.campaignId && l.campaignId !== ctx.campaignId) return false;
    if (ctx.agentId && (!l.campaignId || app.campaignById.get(l.campaignId)?.agentId !== ctx.agentId)) return false;
    if (cohort === 'range' && !inRange(l.createdAt, ctx.range)) return false;
    return true;
  }), [app.leads, app.campaignById, ctx.campaignId, ctx.agentId, ctx.range, cohort]);
  const s = stats(leads);

  const funnel = [
    { label: 'Imported', v: s.total }, { label: 'Contacted', v: s.contacted }, { label: 'Reached', v: s.reached },
    { label: 'Interested', v: s.qualified + s.callback }, { label: 'Qualified', v: s.qualified }, { label: 'Converted', v: s.converted },
  ];

  const by = <K extends string>(key: (l: Lead) => K) => {
    const m = new Map<K, Lead[]>();
    leads.forEach((l) => { const k = key(l); m.set(k, [...(m.get(k) ?? []), l]); });
    return [...m.entries()].map(([k, ls]) => ({ key: k, ...stats(ls) })).sort((a, b) => b.total - a.total);
  };
  const bySource = by((l) => l.source);
  const byType = by((l) => l.customerType);
  const byProduct = by((l) => l.productInterest).map((r) => ({ ...r, name: app.productById.get(r.key)?.name ?? r.key }));

  useExport(ctx, () => ({ name: 'lead-analytics', rows: byProduct.map((r) => ({ product: r.name, leads: r.total, contacted: r.contacted, reached: r.reached, qualified: r.qualified, converted: r.converted, qualified_pct: r.qualPct.toFixed(1), conversion_pct: r.convPct.toFixed(1) })) }));

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="small muted">{cohort === 'range' ? `Leads imported ${ctx.range.label.toLowerCase()}` : 'All active leads, any import date'}</span>
        <Segmented value={cohort} onChange={setCohort} options={[{ value: 'range', label: 'Imported in range' }, { value: 'all', label: 'All leads' }]} />
      </div>
      <StatStrip cols={8} items={[
        { label: 'Imported', value: fmtInt(s.total) },
        { label: 'Contacted', value: fmtInt(s.contacted), foot: fmtPct(s.total ? (s.contacted / s.total) * 100 : 0) },
        { label: 'Reached', value: fmtInt(s.reached), foot: fmtPct(s.contacted ? (s.reached / s.contacted) * 100 : 0) },
        { label: 'Hot', value: fmtInt(s.hot) },
        { label: 'Warm', value: fmtInt(s.warm) },
        { label: 'Cold', value: fmtInt(s.cold) },
        { label: 'Qualified', value: fmtPct(s.qualPct), foot: 'of reached' },
        { label: 'Sales conversion', value: fmtPct(s.convPct), foot: 'qualified → sale' },
      ]} />

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <Card title="Lead funnel" sub="Stage-to-stage conversion">
          <div className="col" style={{ gap: 2 }}>
            {funnel.map((f, i) => (
              <div key={f.label} className="funnel-row" style={{ gridTemplateColumns: '96px 1fr 88px' }}>
                <span className="small subtle">{f.label}</span>
                <div><div className="funnel-bar" style={{ width: `${Math.max(3, (f.v / Math.max(1, funnel[0].v)) * 100)}%`, background: i >= 4 ? CHART.green : `rgba(10,10,10,${0.9 - i * 0.14})` }} /></div>
                <span className="mono tnum small" style={{ textAlign: 'right' }}>{fmtInt(f.v)}<span className="muted"> {i > 0 && funnel[i - 1].v ? `${((f.v / funnel[i - 1].v) * 100).toFixed(0)}%` : ''}</span></span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Leads by source" sub="Volume and qualified share">
          <Legend items={[{ label: 'Leads', color: CHART.light }, { label: 'Qualified', color: CHART.green }]} />
          <div style={{ height: 230 }} className="mt-8">
            <ResponsiveContainer>
              <BarChart data={bySource} layout="vertical" margin={{ left: 8, right: 16, top: 4 }} barGap={-12}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" {...AX} />
                <YAxis type="category" dataKey="key" {...AX} width={110} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#F7F7F7' }} />
                <Bar dataKey="total" name="Leads" fill={CHART.light} barSize={12} radius={[0, 2, 2, 0]} />
                <Bar dataKey="qualified" name="Qualified" fill={CHART.green} barSize={12} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid g-main-side" style={{ marginBottom: 16 }}>
        <Card flush title="By product" sub="Product of interest">
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead><tr><th>Product</th><th className="num">Leads</th><th className="num">Reached</th><th className="num">Qualified</th><th className="num">Converted</th><th>Qualified %</th><th className="num">Conv. %</th></tr></thead>
              <tbody>
                {byProduct.map((r) => (
                  <tr key={r.key}>
                    <td data-label="Product" className="cell-primary">{r.name}</td>
                    <td data-label="Leads" className="num mono">{fmtInt(r.total)}</td>
                    <td data-label="Reached" className="num mono">{fmtInt(r.reached)}</td>
                    <td data-label="Qualified" className="num mono">{fmtInt(r.qualified)}</td>
                    <td data-label="Converted" className="num mono">{fmtInt(r.converted)}</td>
                    <td data-label="Qualified %"><div className="row"><div style={{ width: 60 }}><Progress value={r.qualPct} color={CHART.green} /></div><span className="mono small">{fmtPct(r.qualPct)}</span></div></td>
                    <td data-label="Conv. %" className="num mono">{fmtPct(r.convPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="By customer type">
          <div className="col" style={{ gap: 14 }}>
            {byType.map((r) => (
              <div key={r.key}>
                <div className="row between small"><span className="medium" style={{ color: 'var(--ink)' }}>{r.key}</span><span className="mono">{fmtInt(r.total)} <span className="muted">leads</span></span></div>
                <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', gap: 1, background: '#F5F5F5' }} className="mt-4">
                  <div style={{ width: `${(r.hot / Math.max(1, r.total)) * 100}%`, background: CHART.orange }} />
                  <div style={{ width: `${(r.warm / Math.max(1, r.total)) * 100}%`, background: '#F59E0B' }} />
                  <div style={{ width: `${(r.converted / Math.max(1, r.total)) * 100}%`, background: CHART.green }} />
                  <div style={{ width: `${(r.cold / Math.max(1, r.total)) * 100}%`, background: CHART.blue }} />
                </div>
                <div className="row between xs muted mt-4"><span>{fmtPct(r.qualPct)} qualified</span><span>{fmtPct(r.convPct)} conversion</span></div>
              </div>
            ))}
          </div>
          <div className="mt-16"><Legend items={[{ label: 'Hot', color: CHART.orange }, { label: 'Warm', color: '#F59E0B' }, { label: 'Converted', color: CHART.green }, { label: 'Cold', color: CHART.blue }]} /></div>
        </Card>
      </div>
    </>
  );
}
