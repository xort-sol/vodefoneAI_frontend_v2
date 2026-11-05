import { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Download, FolderOpen, Save, Trash2 } from 'lucide-react';
import { useApp } from '../../store/store';
import { Button, Card, ChartTip, CHART, EmptyState, Field, FilterSelect, Legend, Modal, Segmented, Switch, SERIES, useConfirm } from '../../components/ui';
import { DateRangePicker, useRangeState } from '../../components/DateRange';
import { inRange, summarize, type RangeKey } from '../../lib/metrics';
import { downloadFile, fmtDur, fmtGBP, fmtInt, fmtPct, fmtRelative, toCSV } from '../../lib/format';
import type { Call } from '../../data/types';
import { AX, bucketLabel, DETAIL_START, useExport, type AnalyticsCtx, type SavedReport } from './common';

type Kind = 'count' | 'pct' | 'gbp' | 'dur';
const METRICS: { key: string; label: string; kind: Kind; get: (s: ReturnType<typeof summarize>) => number }[] = [
  { key: 'calls', label: 'Calls', kind: 'count', get: (s) => s.total },
  { key: 'connected', label: 'Connected', kind: 'count', get: (s) => s.connected },
  { key: 'qualified', label: 'Qualified', kind: 'count', get: (s) => s.qualified },
  { key: 'minutes', label: 'Minutes', kind: 'count', get: (s) => s.minutes },
  { key: 'cost', label: 'Spend (£)', kind: 'gbp', get: (s) => +s.cost.toFixed(2) },
  { key: 'connectRate', label: 'Connect rate', kind: 'pct', get: (s) => +s.connectRate.toFixed(1) },
  { key: 'qualRate', label: 'Qualification rate', kind: 'pct', get: (s) => +s.qualRate.toFixed(1) },
  { key: 'avgDuration', label: 'Avg. duration', kind: 'dur', get: (s) => Math.round(s.avgDuration) },
  { key: 'cpq', label: 'Cost / qualified (£)', kind: 'gbp', get: (s) => (s.qualified ? +(s.cost / s.qualified).toFixed(2) : 0) },
];
const DIMENSIONS = [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'campaign', label: 'Campaign' }, { value: 'agent', label: 'Agent' }, { value: 'product', label: 'Product' }] as const;
type Dim = (typeof DIMENSIONS)[number]['value'];
type ChartType = 'bar' | 'line' | 'area' | 'table';
const fmtKind = (k: Kind, v: number) => (k === 'pct' ? fmtPct(v) : k === 'gbp' ? fmtGBP(v, 2) : k === 'dur' ? fmtDur(v) : fmtInt(v));

export default function BuilderTab({ ctx, saved, setSaved }: { ctx: AnalyticsCtx; saved: SavedReport[]; setSaved: (f: (p: SavedReport[]) => SavedReport[]) => void }) {
  const app = useApp(); const confirm = useConfirm();
  const rs = useRangeState('30d');
  const [metrics, setMetrics] = useState<string[]>(['calls', 'connected', 'qualified']);
  const [dim, setDim] = useState<Dim>('week');
  const [chart, setChart] = useState<ChartType>('bar');
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [sentiment, setSentiment] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState('');

  const calls = useMemo(() => ctx.scopeCalls.filter((c) => inRange(c.startedAt, rs.range) && (!connectedOnly || c.connected) && (!sentiment || c.sentiment === sentiment)), [ctx.scopeCalls, rs.range, connectedOnly, sentiment]);

  const data = useMemo(() => {
    const keyOf = (c: Call) => dim === 'day' || dim === 'week' ? bucketLabel(c.startedAt, dim)
      : dim === 'campaign' ? app.campaignById.get(c.campaignId)?.name ?? c.campaignId
        : dim === 'agent' ? app.agentById.get(c.agentId)?.name ?? c.agentId : app.productById.get(c.productId)?.name ?? c.productId;
    const sorted = dim === 'day' || dim === 'week' ? [...calls].sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt)) : calls;
    const m = new Map<string, Call[]>();
    sorted.forEach((c) => { const k = keyOf(c); m.set(k, [...(m.get(k) ?? []), c]); });
    const rows = [...m.entries()].map(([k, cs]) => { const s = summarize(cs); return { label: k, ...Object.fromEntries(METRICS.map((mm) => [mm.key, mm.get(s)])) } as Record<string, number | string> & { label: string }; });
    if (dim !== 'day' && dim !== 'week') rows.sort((a, b) => (b[metrics[0] ?? 'calls'] as number) - (a[metrics[0] ?? 'calls'] as number));
    return rows;
  }, [calls, dim, app.campaignById, app.agentById, app.productById, metrics]);

  const sel = METRICS.filter((m) => metrics.includes(m.key));
  const hasRight = sel.some((m) => m.kind !== 'count') && sel.some((m) => m.kind === 'count');
  const axisFor = (k: Kind) => (hasRight && k !== 'count' ? 'b' : 'a');
  const toggle = (k: string) => setMetrics((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const csvRows = () => data.map((r) => ({ [dim]: r.label, ...Object.fromEntries(sel.map((m) => [m.label, r[m.key]])) }));
  useExport(ctx, () => ({ name: 'custom-report', rows: csvRows() }));

  const save = () => {
    const n = name.trim();
    if (!n) { setNameErr('Give the report a name'); return; }
    if (saved.some((s) => s.name.toLowerCase() === n.toLowerCase())) { setNameErr('A saved report with this name already exists'); return; }
    setSaved((p) => [{ id: `RPT-${Date.now() % 100000}`, name: n, metrics, dimension: dim, chart, rangeKey: rs.key, connectedOnly, sentiment, createdAt: new Date().toISOString(), createdBy: app.me.name }, ...p]);
    app.audit('Saved custom report', n, 'Data');
    app.toast('Report saved', `“${n}” is available in Saved reports and can be scheduled.`);
    setSaveOpen(false); setName('');
  };
  const load = (r: SavedReport) => {
    setMetrics(r.metrics); setDim(r.dimension as Dim); setChart(r.chart as ChartType); setConnectedOnly(r.connectedOnly); setSentiment(r.sentiment);
    if (r.rangeKey !== 'custom') rs.setKey(r.rangeKey as RangeKey);
    app.toast('Report loaded', r.name, 'info');
  };
  const remove = async (r: SavedReport) => {
    if (!(await confirm({ title: 'Delete saved report?', desc: `“${r.name}” will be removed. Schedules that use it will keep their last configuration.`, confirmLabel: 'Delete', danger: true }))) return;
    setSaved((p) => p.filter((x) => x.id !== r.id));
    app.toast('Report deleted', r.name);
  };


  return (
    <>
      <div className="grid g-side-main" style={{ marginBottom: 16, alignItems: 'start' }}>
        <Card title="Build a report" sub="Changes apply instantly">
          <div className="col gap-16">
            <Field label="Date range"><div><DateRangePicker state={rs} /></div></Field>
            <div>
              <div className="field-label">Metrics</div>
              <div className="col mt-8" style={{ gap: 6 }}>
                {METRICS.map((m) => (
                  <label key={m.key} className="row small" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" className="checkbox" checked={metrics.includes(m.key)} onChange={() => toggle(m.key)} />{m.label}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Dimension">
              <select className="select sm" value={dim} onChange={(e) => setDim(e.target.value as Dim)}>{DIMENSIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
            </Field>
            <div>
              <div className="field-label">Filters</div>
              <div className="col mt-8">
                <label className="row small" style={{ gap: 8 }}><Switch on={connectedOnly} onChange={setConnectedOnly} label="Connected calls only" />Connected calls only</label>
                <FilterSelect label="Sentiment" value={sentiment} onChange={setSentiment} options={['Positive', 'Neutral', 'Negative']} />
                <div className="xs muted">Campaign and agent filters at the top of the page also apply.</div>
              </div>
            </div>
            <Field label="Chart type">
              <Segmented value={chart} onChange={setChart} options={[{ value: 'bar', label: 'Bar' }, { value: 'line', label: 'Line' }, { value: 'area', label: 'Area' }, { value: 'table', label: 'Table' }]} />
            </Field>
            <Button variant="primary" icon={<Save />} disabled={!metrics.length} onClick={() => { setSaveOpen(true); setNameErr(''); }}>Save report</Button>
          </div>
        </Card>

        <div className="col gap-16">
          <Card title="Preview" sub={`${sel.map((m) => m.label).join(', ') || 'No metrics'} by ${dim} · ${rs.range.label.toLowerCase()} · ${fmtInt(calls.length)} calls`}
            actions={<Button size="sm" icon={<Download />} disabled={!data.length || !sel.length} onClick={() => { downloadFile('custom-report.csv', toCSV(csvRows())); app.toast('Report downloaded', 'custom-report.csv'); }}>CSV</Button>}>
            {!sel.length ? <EmptyState title="Choose at least one metric" desc="Tick metrics on the left to build the preview." />
              : !data.length ? <EmptyState title="No data" desc="No calls match this range and filters." /> : (
                <>
                  {chart !== 'table' && (
                    <>
                      <Legend items={sel.map((m, i) => ({ label: m.label, color: SERIES[i % SERIES.length] }))} />
                      <div style={{ height: 280 }} className="mt-12">
                        <ResponsiveContainer>
                          <ComposedChart data={data} margin={{ left: -6, right: hasRight ? 0 : 8, top: 8 }}>
                            <CartesianGrid stroke={CHART.grid} vertical={false} />
                            <XAxis dataKey="label" {...AX} minTickGap={16} tick={{ fontSize: dim === 'day' || dim === 'week' ? 11 : 10 }} interval={dim === 'day' || dim === 'week' ? 'preserveStartEnd' : 0} tickFormatter={(v: string) => (dim === 'day' || dim === 'week' || v.length <= 14 ? v : v.slice(0, 13) + '…')} />
                            <YAxis yAxisId="a" {...AX} width={48} />
                            {hasRight && <YAxis yAxisId="b" orientation="right" {...AX} width={44} />}
                            <Tooltip content={<ChartTip fmt={(v, n) => fmtKind(sel.find((m) => m.label === n)?.kind ?? 'count', v)} />} cursor={{ fill: '#F7F7F7' }} />
                            {sel.map((m, i) => {
                              const color = SERIES[i % SERIES.length];
                              if (chart === 'bar') return <Bar key={m.key} yAxisId={axisFor(m.kind)} dataKey={m.key} name={m.label} fill={color} radius={[2, 2, 0, 0]} maxBarSize={22} />;
                              if (chart === 'area') return <Area key={m.key} yAxisId={axisFor(m.kind)} type="monotone" dataKey={m.key} name={m.label} stroke={color} fill={color} fillOpacity={0.06} strokeWidth={1.5} />;
                              return <Line key={m.key} yAxisId={axisFor(m.kind)} type="monotone" dataKey={m.key} name={m.label} stroke={color} strokeWidth={1.5} dot={false} />;
                            })}
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                  <div className="table-wrap" style={{ marginTop: chart === 'table' ? 0 : 16, maxHeight: 340, overflowY: 'auto' }}>
                    <table className="table">
                      <thead><tr><th style={{ textTransform: 'capitalize' }}>{dim}</th>{sel.map((m) => <th key={m.key} className="num">{m.label}</th>)}</tr></thead>
                      <tbody>
                        {data.map((r) => <tr key={r.label}><td className="cell-primary">{r.label}</td>{sel.map((m) => <td key={m.key} className="num mono">{fmtKind(m.kind, r[m.key] as number)}</td>)}</tr>)}
                      </tbody>
                    </table>
                  </div>
                  {rs.range.from < DETAIL_START && <div className="xs muted mt-8">Custom reports use the detailed call log, which covers the last 90 days.</div>}
                </>
              )}
          </Card>

          <Card flush title="Saved reports" sub={`${saved.length} saved in this browser`}>
            {saved.length ? (
              <div className="table-wrap">
                <table className="table table-responsive">
                  <thead><tr><th>Name</th><th>Metrics</th><th>Dimension</th><th>Created</th><th /></tr></thead>
                  <tbody>
                    {saved.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Name"><div className="cell-primary">{r.name}</div><div className="mono xs muted">{r.id}</div></td>
                        <td data-label="Metrics" className="small subtle" style={{ whiteSpace: 'normal' }}>{r.metrics.map((k) => METRICS.find((m) => m.key === k)?.label).join(', ')}</td>
                        <td data-label="Dimension" className="small" style={{ textTransform: 'capitalize' }}>{r.dimension} · {r.chart}</td>
                        <td data-label="Created" className="small muted">{fmtRelative(r.createdAt)} · {r.createdBy}</td>
                        <td data-label=""><span className="row" style={{ justifyContent: 'flex-end' }}>
                          <Button size="xs" icon={<FolderOpen />} onClick={() => load(r)}>Open</Button>
                          <Button size="xs" variant="ghost" iconOnly icon={<Trash2 />} aria-label="Delete report" onClick={() => remove(r)} />
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div style={{ padding: '0 16px 16px' }} className="small muted">No saved reports yet. Build a view above and choose “Save report”.</div>}
          </Card>
        </div>
      </div>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save report" desc="Saved reports can be reopened or scheduled for email delivery." footer={<>
        <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save</Button>
      </>}>
        <Field label="Report name" required error={nameErr}>
          <input className={`input ${nameErr ? 'invalid' : ''}`} autoFocus value={name} maxLength={60} placeholder="e.g. Weekly qualification by campaign" onChange={(e) => { setName(e.target.value); setNameErr(''); }} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <div className="xs muted mt-12">{sel.map((m) => m.label).join(', ')} · by {dim} · {chart} · {rs.range.label}</div>
      </Modal>
    </>
  );
}
