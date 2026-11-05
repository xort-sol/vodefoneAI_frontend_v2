import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, ComposedChart,
} from 'recharts';
import { AlertTriangle, ArrowRight, PhoneOff, Plus, Radio, RefreshCw, Users, PhoneCall, PhoneIncoming, Flame, BadgeCheck, Percent, Clock, PoundSterling, Timer, CalendarDays, Activity } from 'lucide-react';
import { useApp, STAGES } from '../store/store';
import { Badge, Button, Card, ChartTip, CHART, KpiCard, Legend, PageHeader, ScoreBar, StatusBadge, Avatar, SimBadge, Segmented, Progress, ExportMenu } from '../components/ui';
import { DateRangePicker, useRangeState } from '../components/DateRange';
import { bucketSeries, callsIn, dailySeries, makeRange, previousRange, summarize, leadBuckets, inRange } from '../lib/metrics';
import { fmtCompact, fmtDur, fmtGBP, fmtInt, fmtPct, fmtRelative, fmtTime, pctChange, fmtDateShort, WD } from '../lib/format';
import { DAY, NOW, startOfDay } from '../data/seed';

export default function Overview() {
  const app = useApp(); const nav = useNavigate();
  const rs = useRangeState('30d');
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('day');
  const { range } = rs;
  const prev = previousRange(range);

  const cur = useMemo(() => summarize(callsIn(app.calls, range)), [app.calls, range]);
  const prv = useMemo(() => summarize(callsIn(app.calls, prev)), [app.calls, prev]);

  // Fixed-period volume (uses detailed logs + daily aggregates beyond 90 days)
  const year = useMemo(() => dailySeries(app.calls, new Date(startOfDay(NOW).getTime() - 364 * DAY), new Date(startOfDay(NOW).getTime() + DAY - 1)), [app.calls]);
  const sumDays = (n: number, offset = 0) => year.slice(year.length - n - offset, year.length - offset).reduce((s, d) => s + d.calls, 0);
  const vol = {
    today: sumDays(1), yesterday: sumDays(1, 1), week: sumDays(7), prevWeek: sumDays(7, 7), month: sumDays(30), prevMonth: sumDays(30, 30),
    year: year.reduce((s, d) => s + d.calls, 0),
  };
  const spark = (n: number, key: 'calls' | 'connected' | 'qualified' | 'minutes' | 'cost' = 'calls') => year.slice(-n).map((d) => d[key]);

  const activeLeads = app.leads.filter((l) => !l.archived);
  const qualifiedInRange = app.leads.filter((l) => ['Hot', 'Warm', 'Converted'].includes(l.status) && l.lastCallAt && inRange(l.lastCallAt, range));
  const qualifiedPrev = app.leads.filter((l) => ['Hot', 'Warm', 'Converted'].includes(l.status) && l.lastCallAt && inRange(l.lastCallAt, prev));
  const warmInRange = qualifiedInRange.filter((l) => l.status === 'Warm').length;
  const warmPrev = qualifiedPrev.filter((l) => l.status === 'Warm').length;
  const convRate = cur.connected ? (qualifiedInRange.filter((l) => l.status === 'Converted').length / Math.max(1, qualifiedInRange.length)) * 100 : 0;
  const convPrev = qualifiedPrev.length ? (qualifiedPrev.filter((l) => l.status === 'Converted').length / qualifiedPrev.length) * 100 : 0;
  const newLeads = app.leads.filter((l) => inRange(l.createdAt, range)).length;
  const prevNewLeads = app.leads.filter((l) => inRange(l.createdAt, prev)).length;

  const series = useMemo(() => {
    const from = range.key === 'today' || range.key === 'yesterday' ? new Date(range.from.getTime() - 13 * DAY) : range.from;
    return bucketSeries(dailySeries(app.calls, from, range.to), bucket);
  }, [app.calls, range, bucket]);

  const rangeCalls = useMemo(() => callsIn(app.calls, range), [app.calls, range]);
  const outcomeMix = useMemo(() => {
    const m: Record<string, number> = {};
    rangeCalls.forEach((c) => { const k = c.connected ? 'Connected' : c.outcome; m[k] = (m[k] ?? 0) + 1; });
    return [
      { name: 'Connected', value: m.Connected ?? 0, color: CHART.ink },
      { name: 'No answer', value: m['No answer'] ?? 0, color: CHART.light },
      { name: 'Voicemail', value: m.Voicemail ?? 0, color: CHART.grey },
      { name: 'Busy', value: m.Busy ?? 0, color: '#E5E5E5' },
      { name: 'Failed', value: m.Failed ?? 0, color: CHART.orange },
    ];
  }, [rangeCalls]);

  const funnel = useMemo(() => {
    const inCamp = activeLeads.filter((l) => l.campaignId);
    const attempted = inCamp.filter((l) => l.attempts > 0);
    const reached = attempted.filter((l) => !['Unreachable', 'Contacted'].includes(l.status));
    const interested = reached.filter((l) => ['Hot', 'Warm', 'Converted', 'Callback requested'].includes(l.status));
    const qualified = reached.filter((l) => ['Hot', 'Warm', 'Converted'].includes(l.status));
    const converted = reached.filter((l) => l.status === 'Converted');
    return [
      { label: 'Eligible leads', v: inCamp.length }, { label: 'Attempted', v: attempted.length }, { label: 'Reached', v: reached.length },
      { label: 'Interested', v: interested.length }, { label: 'Qualified', v: qualified.length }, { label: 'Converted', v: converted.length },
    ];
  }, [activeLeads]);

  const buckets = leadBuckets(activeLeads);
  const temp = [
    { label: 'Hot', v: buckets.hot, color: CHART.orange }, { label: 'Warm', v: buckets.warm, color: '#F59E0B' },
    { label: 'Callback', v: buckets.callback, color: CHART.purple }, { label: 'Cold', v: buckets.cold, color: CHART.blue }, { label: 'Converted', v: buckets.converted, color: CHART.green },
  ];
  const tempTotal = temp.reduce((s, t) => s + t.v, 0) || 1;

  const productMix = useMemo(() => {
    const m = new Map<string, number>();
    rangeCalls.filter((c) => c.connected && c.intent >= 50).forEach((c) => m.set(c.productId, (m.get(c.productId) ?? 0) + 1));
    return [...m.entries()].map(([id, v]) => ({ name: app.productById.get(id)?.name ?? id, v })).sort((a, b) => b.v - a.v);
  }, [rangeCalls, app.productById]);
  const productMax = Math.max(1, ...productMix.map((p) => p.v));

  const campPerf = app.campaigns.filter((c) => c.attempted > 0).map((c) => ({
    ...c, connectRate: c.attempted ? (c.connected / Math.max(1, c.attempted * 1.6)) * 100 : 0, qualRate: c.connected ? (c.qualified / c.connected) * 100 : 0, cost: c.minutes * c.costPerMinute,
  })).sort((a, b) => b.qualified - a.qualified);

  const agentPerf = [...app.agents].filter((a) => a.totalCalls > 0).sort((a, b) => b.qualificationRate - a.qualificationRate);

  const heat = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(11).fill(0));
    rangeCalls.forEach((c) => { const d = new Date(c.startedAt); const h = d.getHours() - 9; if (h >= 0 && h < 11) grid[(d.getDay() + 6) % 7][h]++; });
    const max = Math.max(1, ...grid.flat());
    return { grid, max };
  }, [rangeCalls]);

  const weeklyConv = useMemo(() => bucketSeries(dailySeries(app.calls, new Date(startOfDay(NOW).getTime() - 83 * DAY), new Date(startOfDay(NOW).getTime() + DAY - 1)), 'week')
    .map((w) => ({ label: w.label.replace('w/c ', ''), rate: w.connected ? +((w.qualified / w.connected) * 100).toFixed(1) : 0, qualified: w.qualified })), [app.calls]);

  const recent = app.calls.slice(0, 7);
  const latestQualified = app.leads.filter((l) => ['Hot', 'Warm'].includes(l.status)).sort((a, b) => +new Date(b.lastCallAt!) - +new Date(a.lastCallAt!)).slice(0, 6);
  const upcoming = app.appointments.filter((a) => new Date(a.start) > NOW && ['Scheduled', 'Confirmed'].includes(a.status)).sort((a, b) => +new Date(a.start) - +new Date(b.start)).slice(0, 5);
  const pending = app.leads.filter((l) => ['Hot', 'Warm'].includes(l.status) && !l.assignedRepId).length;
  const overdue = app.tasks.filter((t) => !t.done && new Date(t.due) < NOW).length;
  const failed = app.calls.filter((c) => c.outcome === 'Failed').slice(0, 4);
  const alerts = app.notifications.filter((n) => ['Capacity', 'Agents', 'Security', 'Offers'].includes(n.category) && !n.read).slice(0, 4);
  const activeCamps = app.campaigns.filter((c) => c.status === 'Active');
  const totalCapacity = activeCamps.reduce((s, c) => s + c.dailyCap, 0);

  const exportDash = (fmt: string) => app.toast(`Dashboard exported as ${fmt}`, `${range.label} · generated from demonstration data`);

  return (
    <>
      <PageHeader
        title="Overview"
        desc="Performance of the AI outbound sales operation — calling, qualification, handover and spend."
        eyebrow={<><Badge tone="green" dot live>{app.live.length} calls in progress</Badge><SimBadge /></>}
        actions={<>
          <DateRangePicker state={rs} />
          <ExportMenu onExport={exportDash} />
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => nav('/campaigns/new')}>New campaign</Button>
        </>}
      />

      {/* Calling volume strip */}
      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', marginBottom: 16 }}>
        {[
          ['Calls today', vol.today, pctChange(vol.today, vol.yesterday), 'vs yesterday', 14],
          ['Calls this week', vol.week, pctChange(vol.week, vol.prevWeek), 'vs previous 7 days', 28],
          ['Calls this month', vol.month, pctChange(vol.month, vol.prevMonth), 'vs previous 30 days', 60],
          ['Calls this year', vol.year, 38.2, 'vs last year', 365],
          ['Total leads', activeLeads.length, pctChange(newLeads, prevNewLeads), `${fmtInt(newLeads)} added · ${range.label.toLowerCase()}`, 0],
        ].map(([label, v, d, p, n], i) => (
          <div key={i} className="card-link" onClick={() => nav(i === 4 ? '/leads' : '/history')} style={{ cursor: 'pointer' }}>
            <div className="kpi-label">{label as string}</div>
            <div className="row between mt-4" style={{ alignItems: 'flex-end' }}>
              <div className="kpi-value">{fmtInt(v as number)}</div>
              {(n as number) > 0 && <div style={{ width: 72 }}><MiniBars data={spark(Math.min(n as number, 30))} /></div>}
            </div>
            <div className="kpi-foot mt-4"><DeltaInline v={d as number} /><span className="truncate">{p as string}</span></div>
          </div>
        ))}
      </div>

      {/* Range KPIs */}
      <div className="grid g-4 keep-2" style={{ marginBottom: 16 }}>
        <KpiCard label="Total calls" icon={<PhoneCall size={13} />} value={fmtInt(cur.total)} delta={pctChange(cur.total, prv.total)} prevLabel={`${fmtInt(prv.total)} prev.`} spark={spark(30)} onClick={() => nav('/history')} />
        <KpiCard label="Connected calls" icon={<PhoneIncoming size={13} />} value={fmtInt(cur.connected)} delta={pctChange(cur.connected, prv.connected)} prevLabel={`${fmtPct(cur.connectRate)} connect rate`} spark={spark(30, 'connected')} sparkColor={CHART.blue} onClick={() => nav('/conversations')} />
        <KpiCard label="Warm leads" icon={<Flame size={13} />} value={fmtInt(warmInRange)} delta={pctChange(warmInRange, warmPrev)} prevLabel={`${fmtInt(warmPrev)} prev.`} onClick={() => nav('/qualified?cat=Warm')} />
        <KpiCard label="Qualified leads" icon={<BadgeCheck size={13} />} value={fmtInt(qualifiedInRange.length)} delta={pctChange(qualifiedInRange.length, qualifiedPrev.length)} prevLabel={`${fmtPct(cur.qualRate)} of connected`} spark={spark(30, 'qualified')} sparkColor={CHART.green} onClick={() => nav('/qualified')} />
        <KpiCard label="Conversion rate" icon={<Percent size={13} />} value={fmtPct(convRate)} delta={convRate - convPrev} prevLabel="qualified → sale, pts" onClick={() => nav('/analytics?tab=leads')} />
        <KpiCard label="Calling minutes" icon={<Clock size={13} />} value={fmtCompact(cur.minutes)} delta={pctChange(cur.minutes, prv.minutes)} prevLabel={`${fmtCompact(prv.minutes)} prev.`} spark={spark(30, 'minutes')} sparkColor={CHART.purple} onClick={() => nav('/analytics?tab=cost')} />
        <KpiCard label="Calling expenditure" icon={<PoundSterling size={13} />} value={fmtGBP(cur.cost)} delta={pctChange(cur.cost, prv.cost)} invert prevLabel={`${fmtGBP(cur.connected ? cur.cost / Math.max(1, qualifiedInRange.length) : 0, 2)} per qualified`} spark={spark(30, 'cost')} sparkColor={CHART.orange} onClick={() => nav('/analytics?tab=cost')} />
        <KpiCard label="Avg. call duration" icon={<Timer size={13} />} value={fmtDur(cur.avgDuration)} delta={pctChange(cur.avgDuration, prv.avgDuration)} prevLabel={`${fmtDur(prv.avgDuration)} prev. · connected only`} onClick={() => nav('/analytics?tab=ai')} />
      </div>

      <div className="grid g-main-side" style={{ marginBottom: 16 }}>
        <Card title="Calling activity" sub={`Calls placed vs connected · ${range.label.toLowerCase()}`} actions={<Segmented value={bucket} onChange={setBucket} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />}>
          <Legend items={[{ label: 'Calls placed', color: CHART.ink }, { label: 'Connected', color: CHART.blue }, { label: 'Qualified', color: CHART.green }]} />
          <div style={{ height: 260 }} className="mt-12">
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ left: -16, right: 4, top: 8 }}>
                <defs>
                  <linearGradient id="gCalls" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={CHART.ink} stopOpacity={0.08} /><stop offset="1" stopColor={CHART.ink} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTip />} cursor={{ stroke: CHART.light }} />
                <Area type="monotone" dataKey="calls" name="Calls placed" stroke={CHART.ink} strokeWidth={1.75} fill="url(#gCalls)" />
                <Line type="monotone" dataKey="connected" name="Connected" stroke={CHART.blue} strokeWidth={1.75} dot={false} />
                <Bar dataKey="qualified" name="Qualified" fill={CHART.green} barSize={bucket === 'day' ? 4 : 12} radius={[2, 2, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Call outcomes" sub="Connected vs unsuccessful">
          <div className="row" style={{ alignItems: 'center', gap: 16 }}>
            <div style={{ width: 150, height: 150, position: 'relative', flexShrink: 0 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={outcomeMix} dataKey="value" innerRadius={50} outerRadius={70} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270}>
                    {outcomeMix.map((o) => <Cell key={o.name} fill={o.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <div style={{ textAlign: 'center' }}><div className="strong" style={{ fontSize: 20 }}>{fmtPct(cur.connectRate, 0)}</div><div className="xs muted">connected</div></div>
              </div>
            </div>
            <div className="col grow" style={{ gap: 6 }}>
              {outcomeMix.map((o) => (
                <div key={o.name} className="row between small"><span className="row gap-4"><i style={{ width: 8, height: 8, borderRadius: 2, background: o.color, display: 'inline-block', border: o.color === '#E5E5E5' ? '1px solid #d4d4d4' : 0 }} />{o.name}</span><span className="mono tnum">{fmtInt(o.value)}</span></div>
              ))}
            </div>
          </div>
          <div className="divider" />
          <div className="row between small"><span className="muted">Failed (technical)</span><button className="btn link small" onClick={() => nav('/history?outcome=Failed')}>{fmtInt(cur.total ? outcomeMix[4].value : 0)} calls · review</button></div>
        </Card>
      </div>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Card title="Lead qualification funnel" sub="All active campaigns, lifetime">
          <div className="col" style={{ gap: 2 }}>
            {funnel.map((f, i) => (
              <div key={f.label} className="funnel-row" style={{ gridTemplateColumns: '96px 1fr 64px' }}>
                <span className="small subtle">{f.label}</span>
                <div><div className="funnel-bar" style={{ width: `${Math.max(4, (f.v / funnel[0].v) * 100)}%`, background: i >= 4 ? CHART.green : i === 0 ? CHART.ink : `rgba(10,10,10,${0.85 - i * 0.12})` }} /></div>
                <span className="mono tnum small" style={{ textAlign: 'right' }}>{fmtInt(f.v)}<span className="muted"> {i > 0 ? `${((f.v / funnel[i - 1].v) * 100).toFixed(0)}%` : ''}</span></span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Lead temperature" sub="Current distribution of engaged leads" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/qualified')}>Open</Button>}>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
            {temp.map((t) => <div key={t.label} style={{ width: `${(t.v / tempTotal) * 100}%`, background: t.color }} title={`${t.label}: ${t.v}`} />)}
          </div>
          <div className="col mt-16" style={{ gap: 10 }}>
            {temp.map((t) => (
              <div key={t.label} className="row between small card-link" style={{ cursor: 'pointer' }} onClick={() => nav(`/qualified?cat=${t.label === 'Callback' ? 'Callback requested' : t.label}`)}>
                <span className="row gap-4"><i style={{ width: 8, height: 8, borderRadius: 999, background: t.color, display: 'inline-block' }} />{t.label}</span>
                <span className="row"><span className="mono tnum">{fmtInt(t.v)}</span><span className="muted mono" style={{ width: 44, textAlign: 'right' }}>{((t.v / tempTotal) * 100).toFixed(1)}%</span></span>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="row between small"><span className="muted">Not interested / unreachable</span><span className="mono">{fmtInt(buckets.notInterested)} / {fmtInt(buckets.unreachable)}</span></div>
        </Card>
        <Card title="Product interest" sub="Connected calls with intent ≥ 50">
          <div className="col" style={{ gap: 9 }}>
            {productMix.slice(0, 8).map((p) => (
              <div key={p.name}>
                <div className="row between small"><span className="truncate">{p.name}</span><span className="mono tnum">{p.v}</span></div>
                <div className="progress mt-4" style={{ height: 4 }}><div style={{ width: `${(p.v / productMax) * 100}%`, background: CHART.ink }} /></div>
              </div>
            ))}
            {!productMix.length && <div className="small muted">No connected calls in this range.</div>}
          </div>
        </Card>
      </div>

      <div className="grid g-main-side" style={{ marginBottom: 16 }}>
        <Card flush title="Campaign performance" sub="Ranked by qualified leads" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/campaigns')}>All campaigns</Button>}>
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead><tr><th>Campaign</th><th>Status</th><th className="num">Attempted</th><th className="num">Connected</th><th className="num">Qualified</th><th>Qual. rate</th><th className="num">Spend</th></tr></thead>
              <tbody>
                {campPerf.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => nav(`/campaigns/${c.id}`)}>
                    <td data-label="Campaign"><div className="cell-primary">{c.name}</div><div className="mono muted">{c.id}</div></td>
                    <td data-label="Status"><StatusBadge status={c.status} /></td>
                    <td data-label="Attempted" className="num">{fmtInt(c.attempted)}</td>
                    <td data-label="Connected" className="num">{fmtInt(c.connected)}</td>
                    <td data-label="Qualified" className="num strong">{fmtInt(c.qualified)}</td>
                    <td data-label="Qual. rate"><div className="row"><div style={{ width: 64 }}><Progress value={c.qualRate * 2.5} color={CHART.green} /></div><span className="mono small">{fmtPct(c.qualRate)}</span></div></td>
                    <td data-label="Spend" className="num mono">{fmtGBP(c.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="AI agent performance" sub="Qualification rate on connected calls" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/agents')}>Agents</Button>}>
          <div className="list">
            {agentPerf.map((a) => (
              <div key={a.id} className="list-item clickable" onClick={() => nav(`/agents/${a.id}`)}>
                <Avatar initials={a.initials} color={a.color} agent />
                <div className="grow">
                  <div className="row between"><span className="cell-primary">{a.name}</span><span className="mono small">{fmtPct(a.qualificationRate)}</span></div>
                  <div className="row between mt-4"><span className="cell-sub">{fmtInt(a.totalCalls)} calls · avg {fmtDur(a.avgDuration)}</span><StatusBadge status={a.status} /></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Card title="Calling minutes" sub="Daily consumption, last 30 days">
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={year.slice(-30).map((d) => ({ ...d, label: fmtDateShort(d.date) }))} margin={{ left: -6, right: 0, top: 8 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTip fmt={(v) => `${fmtInt(v)} min`} />} cursor={{ fill: '#F5F5F5' }} />
                <Bar dataKey="minutes" name="Minutes" fill={CHART.purple} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="row between small mt-8"><span className="muted">Month to date</span><span className="mono">{fmtInt(year.slice(-NOW.getDate()).reduce((s, d) => s + d.minutes, 0))} / 60,000 min plan</span></div>
          <div className="mt-4"><Progress value={(year.slice(-NOW.getDate()).reduce((s, d) => s + d.minutes, 0) / 60000) * 100} color={CHART.purple} /></div>
        </Card>
        <Card title="Calling cost trend" sub="Weekly spend and cost per qualified lead">
          <div style={{ height: 206 }}>
            <ResponsiveContainer>
              <LineChart data={bucketSeries(year.slice(-84), 'week').map((w) => ({ label: w.label.replace('w/c ', ''), cost: w.cost, cpq: w.qualified ? +(w.cost / w.qualified).toFixed(2) : 0 }))} margin={{ left: -16, right: 4, top: 8 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis yAxisId="a" tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `£${v}`} />
                <YAxis yAxisId="b" orientation="right" tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `£${v}`} />
                <Tooltip content={<ChartTip fmt={(v) => fmtGBP(v, 2)} />} cursor={{ stroke: CHART.light }} />
                <Line yAxisId="a" type="monotone" dataKey="cost" name="Weekly spend" stroke={CHART.orange} strokeWidth={1.75} dot={false} />
                <Line yAxisId="b" type="monotone" dataKey="cpq" name="Cost / qualified" stroke={CHART.ink} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Sales conversion" sub="Weekly qualification rate of connected calls">
          <div style={{ height: 206 }}>
            <ResponsiveContainer>
              <AreaChart data={weeklyConv} margin={{ left: -6, right: 4, top: 8 }}>
                <defs><linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={CHART.green} stopOpacity={0.15} /><stop offset="1" stopColor={CHART.green} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTip fmt={(v, n) => n === 'Rate' ? `${v}%` : String(v)} />} cursor={{ stroke: CHART.light }} />
                <Area type="monotone" dataKey="rate" name="Rate" stroke={CHART.green} strokeWidth={1.75} fill="url(#gConv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid g-main-side" style={{ marginBottom: 16 }}>
        <Card title="Calls by hour and day" sub={`Call attempts · ${range.label.toLowerCase()} · darker = more calls`}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 520 }}>
              <div className="heatmap" style={{ gridTemplateColumns: '36px repeat(11, 1fr)' }}>
                <span />
                {Array.from({ length: 11 }, (_, h) => <span key={h} className="mono xs muted" style={{ textAlign: 'center' }}>{String(h + 9).padStart(2, '0')}</span>)}
                {heat.grid.map((row, d) => (
                  <Row key={d} label={WD[(d + 1) % 7]} row={row} max={heat.max} />
                ))}
              </div>
              <div className="row xs muted mt-12" style={{ justifyContent: 'flex-end' }}>Fewer {[0.08, 0.25, 0.45, 0.65, 0.9].map((o) => <i key={o} style={{ width: 14, height: 10, borderRadius: 2, background: `rgba(37,99,235,${o})`, display: 'inline-block' }} />)} More</div>
            </div>
          </div>
        </Card>
        <Card title="Live calling activity" sub="Simulated in real time" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/calling')}>Calling centre</Button>}>
          <div className="list">
            {app.live.slice(0, 6).map((lc) => {
              const l = app.leadById.get(lc.leadId); const a = app.agentById.get(lc.agentId);
              return (
                <div key={lc.id} className="list-item clickable" onClick={() => nav(`/calling?call=${lc.id}`)}>
                  <span className="live-dot" />
                  <div className="grow">
                    <div className="row between"><span className="cell-primary truncate">{l?.name}</span><span className="mono small tnum">{fmtDur(lc.elapsed * 4)}</span></div>
                    <div className="row between"><span className="cell-sub truncate">{a?.name} · {STAGES[lc.stage]}</span><StatusBadge status={lc.sentiment} dot={false} /></div>
                  </div>
                </div>
              );
            })}
            {!app.live.length && <div className="small muted">{app.settings.callingPaused ? 'Calling is paused.' : 'No calls in progress.'}</div>}
          </div>
        </Card>
      </div>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Card flush title="Recent calls" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/history')}>History</Button>}>
          <div style={{ padding: '0 16px 8px' }} className="list">
            {recent.map((c) => (
              <div key={c.id} className="list-item clickable" onClick={() => nav(`/conversations/${c.id}`)}>
                <div className="grow"><div className="cell-primary truncate">{app.leadById.get(c.leadId)?.name}</div><div className="cell-sub mono">{c.id} · {fmtRelative(c.startedAt)}</div></div>
                <StatusBadge status={c.outcome} />
              </div>
            ))}
          </div>
        </Card>
        <Card flush title="Latest qualified leads" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/qualified')}>Handover</Button>}>
          <div style={{ padding: '0 16px 8px' }} className="list">
            {latestQualified.map((l) => (
              <div key={l.id} className="list-item clickable" onClick={() => nav(`/qualified?lead=${l.id}`)}>
                <div className="grow"><div className="cell-primary truncate">{l.name}</div><div className="cell-sub truncate">{app.productById.get(l.productInterest)?.name}</div></div>
                <ScoreBar value={l.score} /><StatusBadge status={l.status} />
              </div>
            ))}
          </div>
        </Card>
        <Card flush title="Upcoming appointments" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/appointments')}>Calendar</Button>}>
          <div style={{ padding: '0 16px 8px' }} className="list">
            {upcoming.map((a) => (
              <div key={a.id} className="list-item clickable" onClick={() => nav(`/appointments?appt=${a.id}`)}>
                <div className="inset-box" style={{ padding: '4px 8px', textAlign: 'center', minWidth: 48 }}><div className="xs muted">{fmtDateShort(a.start)}</div><div className="mono small strong">{fmtTime(a.start)}</div></div>
                <div className="grow"><div className="cell-primary truncate">{app.leadById.get(a.leadId)?.name}</div><div className="cell-sub truncate">{a.type} · {app.memberById.get(a.repId)?.name}</div></div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g-4 keep-2">
        <Card title="Active campaigns" sub={`${activeCamps.length} running · ${fmtInt(totalCapacity)} calls/day capacity`}>
          <div className="col" style={{ gap: 12 }}>
            {activeCamps.map((c) => (
              <div key={c.id} className="card-link" style={{ cursor: 'pointer' }} onClick={() => nav(`/campaigns/${c.id}`)}>
                <div className="row between small"><span className="medium truncate" style={{ color: 'var(--ink)' }}>{c.name}</span><span className="mono muted">{Math.round((c.attempted / Math.max(1, c.totalLeads)) * 100)}%</span></div>
                <div className="mt-4"><Progress value={(c.attempted / Math.max(1, c.totalLeads)) * 100} /></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Pending human follow-ups">
          <div className="col gap-12">
            <div className="row between card-link" style={{ cursor: 'pointer' }} onClick={() => nav('/qualified?view=unassigned')}><span className="row small"><Users size={14} className="muted" />Awaiting assignment</span><span className="strong mono">{pending}</span></div>
            <div className="row between card-link" style={{ cursor: 'pointer' }} onClick={() => nav('/workspace?tab=overdue')}><span className="row small"><AlertTriangle size={14} className="orange" />Overdue tasks</span><span className="strong mono">{overdue}</span></div>
            <div className="row between card-link" style={{ cursor: 'pointer' }} onClick={() => nav('/appointments')}><span className="row small"><CalendarDays size={14} className="muted" />Appointments today</span><span className="strong mono">{app.appointments.filter((a) => new Date(a.start).toDateString() === NOW.toDateString()).length}</span></div>
            <div className="row between card-link" style={{ cursor: 'pointer' }} onClick={() => nav('/qualified?cat=Callback requested')}><span className="row small"><RefreshCw size={14} className="muted" />Callbacks requested</span><span className="strong mono">{buckets.callback}</span></div>
          </div>
        </Card>
        <Card title="Failed calls" sub="Technical failures, most recent" actions={<Button size="xs" variant="ghost" onClick={() => nav('/history?outcome=Failed')}>View</Button>}>
          <div className="list">
            {failed.map((c) => (
              <div key={c.id} className="list-item clickable" style={{ padding: '7px 0' }} onClick={() => nav(`/conversations/${c.id}`)}>
                <PhoneOff size={14} className="orange" />
                <div className="grow"><div className="small truncate" style={{ color: 'var(--ink)' }}>{c.failureReason}</div><div className="mono xs muted">{c.id} · {fmtRelative(c.startedAt)}</div></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="System alerts" actions={<Button size="xs" variant="ghost" onClick={() => nav('/notifications')}>All</Button>}>
          <div className="list">
            {alerts.map((n) => (
              <div key={n.id} className="list-item clickable" style={{ padding: '7px 0', alignItems: 'flex-start' }} onClick={() => { app.markNotification(n.id, true); nav(n.link); }}>
                {n.category === 'Agents' ? <Radio size={14} className="orange" style={{ marginTop: 3 }} /> : n.category === 'Security' ? <AlertTriangle size={14} className="red" style={{ marginTop: 3 }} /> : <Activity size={14} className="blue" style={{ marginTop: 3 }} />}
                <div className="grow"><div className="small medium" style={{ color: 'var(--ink)' }}>{n.title}</div><div className="xs muted">{fmtRelative(n.at)}</div></div>
              </div>
            ))}
            {!alerts.length && <div className="small muted">All clear.</div>}
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, row, max }: { label: string; row: number[]; max: number }) {
  return (
    <>
      <span className="xs muted" style={{ alignSelf: 'center' }}>{label}</span>
      {row.map((v, h) => <div key={h} className="heat-cell" title={`${label} ${h + 9}:00 — ${v} calls`} style={{ background: v ? `rgba(37,99,235,${0.06 + (v / max) * 0.86})` : '#F5F5F5' }} />)}
    </>
  );
}
function MiniBars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 26 }}>{data.map((v, i) => <span key={i} style={{ flex: 1, height: `${Math.max(4, (v / max) * 100)}%`, background: i === data.length - 1 ? CHART.ink : CHART.light, borderRadius: 1 }} />)}</div>;
}
function DeltaInline({ v }: { v: number }) {
  return <span className={`delta ${v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat'}`}>{v > 0 ? '↑' : v < 0 ? '↓' : ''}{Math.abs(v).toFixed(1)}%</span>;
}
