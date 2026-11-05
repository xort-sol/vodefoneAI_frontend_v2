import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Clock, Copy, Download, Pause, Pencil, PhoneCall, PhoneIncoming, Play, PoundSterling, Square, Target, Users, Megaphone, Timer, Flame,
} from 'lucide-react';
import { useApp, STAGES } from '../store/store';
import {
  Avatar, Badge, Button, Card, ChartTip, CHART, DataTable, EmptyState, KpiCard, KV, Legend, PageHeader, Progress, ScoreBar, Segmented, SimBadge, StatusBadge, Tabs, type Column,
} from '../components/ui';
import { fmtDate, fmtDateShort, fmtDateTime, fmtDur, fmtGBP, fmtInt, fmtPct, fmtRelative } from '../lib/format';
import { DAY, NOW, startOfDay } from '../data/seed';
import type { Call } from '../data/types';
import { EditCampaignModal, campaignHistory, daysRange, getCampaignExtras, isToday, pctOf, spendOf, useCampaignActions, ModulePage } from './campaigns/shared';

type Tab = 'performance' | 'calls' | 'qualified' | 'config' | 'activity';
const OUTCOME_COLORS: Record<string, string> = {
  Qualified: CHART.green, 'Transferred to human': CHART.purple, Interested: CHART.blue, 'Callback requested': '#A78BFA', 'Not interested': CHART.grey,
  'No answer': CHART.light, Voicemail: '#E5E5E5', Busy: '#D4D4D4', Failed: CHART.orange, 'Opted out': '#DC2626',
};

export default function CampaignDetail() {
  const { id = '' } = useParams();
  const app = useApp(); const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'performance';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); if (t === 'performance') n.delete('tab'); else n.set('tab', t); setSp(n, { replace: true }); };
  const [editOpen, setEditOpen] = useState(false);
  const [span, setSpan] = useState<'14' | '30' | '90'>('30');
  const acts = useCampaignActions();
  const c = app.campaignById.get(id);

  const calls = useMemo(() => app.calls.filter((x) => x.campaignId === id), [app.calls, id]);
  const leads = useMemo(() => app.leads.filter((l) => l.campaignId === id), [app.leads, id]);
  const live = app.live.filter((l) => l.campaignId === id);

  const series = useMemo(() => {
    const days = +span;
    const from = startOfDay(new Date(NOW.getTime() - (days - 1) * DAY));
    const map = new Map<string, { label: string; calls: number; connected: number; qualified: number }>();
    for (let t = from.getTime(); t <= startOfDay(NOW).getTime(); t += DAY) map.set(new Date(t).toDateString(), { label: fmtDateShort(new Date(t)), calls: 0, connected: 0, qualified: 0 });
    for (const x of calls) {
      const d = map.get(new Date(x.startedAt).toDateString()); if (!d) continue;
      d.calls++; if (x.connected) d.connected++; if (x.outcome === 'Qualified' || x.outcome === 'Transferred to human') d.qualified++;
    }
    return [...map.values()];
  }, [calls, span]);

  if (!c) {
    return <EmptyState icon={<Megaphone size={18} />} title="Campaign not found" desc={`No campaign with ID ${id}.`} action={<Button size="sm" onClick={() => nav('/campaigns')}>Back to campaigns</Button>} />;
  }

  const agent = app.agentById.get(c.agentId);
  const product = app.productById.get(c.productId);
  const offer = c.offerId ? app.offers.find((o) => o.id === c.offerId) : undefined;
  const extras = getCampaignExtras(c.id);
  const spend = spendOf(c);
  const callCost = calls.reduce((s, x) => s + x.cost, 0);
  const todayCalls = calls.filter((x) => isToday(x.startedAt));
  const connectedCalls = calls.filter((x) => x.connected);
  const qualCalls = calls.filter((x) => x.outcome === 'Qualified' || x.outcome === 'Transferred to human');
  const avgDur = connectedCalls.length ? connectedCalls.reduce((s, x) => s + x.duration, 0) / connectedCalls.length : 0;
  const connectRate = pctOf(connectedCalls.length, calls.length);
  const remaining = Math.max(0, c.totalLeads - c.attempted);
  const perLead = c.attempted ? spend / c.attempted : (c.costPerMinute * 2.4);
  const projected = spend + remaining * perLead;
  const elapsedDays = Math.max(1, Math.round((Math.min(Date.now(), new Date(c.endDate).getTime()) - new Date(c.startDate).getTime()) / DAY));
  const daysLeft = Math.max(0, Math.ceil((new Date(c.endDate).getTime() - Date.now()) / DAY));
  const pace = c.attempted / elapsedDays;
  const daysToFinish = pace > 0 ? Math.ceil(remaining / pace) : Infinity;

  const outcomes = (() => {
    const m = new Map<string, number>(); calls.forEach((x) => m.set(x.outcome, (m.get(x.outcome) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const funnel = (() => {
    const attempted = leads.filter((l) => l.attempts > 0);
    const reached = attempted.filter((l) => !['Unreachable', 'Contacted', 'Queued', 'New'].includes(l.status));
    const interested = reached.filter((l) => ['Hot', 'Warm', 'Converted', 'Callback requested'].includes(l.status));
    const qualified = reached.filter((l) => ['Hot', 'Warm', 'Converted'].includes(l.status));
    const converted = reached.filter((l) => l.status === 'Converted');
    return [
      { label: 'Leads', v: leads.length }, { label: 'Attempted', v: attempted.length }, { label: 'Reached', v: reached.length },
      { label: 'Interested', v: interested.length }, { label: 'Qualified', v: qualified.length }, { label: 'Converted', v: converted.length },
    ];
  })();
  const qualifiedLeads = leads.filter((l) => ['Hot', 'Warm', 'Converted'].includes(l.status)).sort((a, b) => b.score - a.score);
  const history = campaignHistory(c, app);

  const statusActions = (
    <>
      {c.status === 'Active' && <Button size="sm" icon={<Pause />} disabled={!acts.canManage} title={acts.canManage ? undefined : acts.denied} onClick={() => acts.pause(c)}>Pause</Button>}
      {c.status === 'Paused' && <Button size="sm" icon={<Play />} disabled={!acts.canManage} title={acts.canManage ? undefined : acts.denied} onClick={() => acts.resume(c)}>Resume</Button>}
      {['Scheduled', 'Draft'].includes(c.status) && <Button size="sm" variant="primary" icon={<Play />} disabled={!acts.canManage} title={acts.canManage ? undefined : acts.denied} onClick={() => acts.resume(c)}>Launch now</Button>}
      {!['Completed', 'Stopped'].includes(c.status) && <Button size="sm" icon={<Pencil />} disabled={!acts.canManage} title={acts.canManage ? undefined : acts.denied} onClick={() => setEditOpen(true)}>Edit</Button>}
      <Button size="sm" icon={<Copy />} disabled={!acts.canManage} title={acts.canManage ? undefined : acts.denied} onClick={() => acts.duplicate(c)}>Duplicate</Button>
      <Button size="sm" icon={<Download />} onClick={() => acts.exportCalls(c)}>Export CSV</Button>
      {['Active', 'Paused', 'Scheduled'].includes(c.status) && <Button size="sm" variant="danger" icon={<Square />} disabled={!acts.canManage} title={acts.canManage ? undefined : acts.denied} onClick={() => acts.stop(c)}>Stop</Button>}
    </>
  );

  const callCols: Column<Call>[] = [
    { key: 'id', header: 'Call', sort: (x) => x.startedAt, render: (x) => <div><div className="mono" style={{ color: 'var(--ink)' }}>{x.id}</div><div className="xs muted">{fmtDateTime(x.startedAt)}</div></div> },
    { key: 'lead', header: 'Customer', sort: (x) => app.leadById.get(x.leadId)?.name ?? '', render: (x) => <span className="cell-primary">{app.leadById.get(x.leadId)?.name}</span> },
    { key: 'agent', header: 'Agent', render: (x) => { const a = app.agentById.get(x.agentId); return <span className="row gap-4"><Avatar initials={a?.initials} color={a?.color} size="sm" agent />{a?.name}</span>; } },
    { key: 'outcome', header: 'Outcome', sort: (x) => x.outcome, render: (x) => <StatusBadge status={x.outcome} /> },
    { key: 'dur', header: 'Duration', align: 'right', sort: (x) => x.duration, render: (x) => <span className="mono">{fmtDur(x.duration)}</span> },
    { key: 'score', header: 'Score', sort: (x) => x.score, render: (x) => <ScoreBar value={x.score} /> },
    { key: 'sent', header: 'Sentiment', render: (x) => <StatusBadge status={x.sentiment} dot={false} /> },
    { key: 'cost', header: 'Cost', align: 'right', sort: (x) => x.cost, render: (x) => <span className="mono">{fmtGBP(x.cost, 2)}</span> },
  ];

  return (
    <ModulePage>
      <PageHeader
        title={c.name}
        desc={c.description}
        eyebrow={<>
          <Button size="xs" variant="ghost" icon={<ArrowLeft size={12} />} onClick={() => nav('/campaigns')}>Campaigns</Button>
          <StatusBadge status={c.status} /><span className="mono muted nowrap">{c.id}</span>
          {live.length > 0 && <Badge tone="green" dot live>{live.length} live</Badge>}<SimBadge />
        </>}
        actions={statusActions}
      />

      {c.status === 'Paused' && <div className="banner warn" style={{ marginBottom: 16 }}><Pause />This campaign is paused — no new simulated calls will be placed until it is resumed.</div>}
      {c.status === 'Scheduled' && <div className="banner info" style={{ marginBottom: 16 }}><Clock />Scheduled to start {fmtDate(c.startDate)} at {c.schedule.start}. {fmtInt(c.totalLeads)} leads are queued.</div>}
      {c.status === 'Draft' && <div className="banner info" style={{ marginBottom: 16 }}><Pencil />Draft — review the configuration and launch when ready.</div>}

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'performance', label: 'Performance' }, { value: 'calls', label: 'Calls', count: calls.length },
        { value: 'qualified', label: 'Qualified leads', count: qualifiedLeads.length }, { value: 'config', label: 'Configuration' },
        { value: 'activity', label: 'Activity', count: history.length },
      ]} />

      {tab === 'performance' && (<>
        <div className="grid g-4 keep-2" style={{ marginBottom: 16 }}>
          <KpiCard label="Total leads" icon={<Users size={13} />} value={fmtInt(c.totalLeads)} prevLabel={`${fmtInt(remaining)} not yet attempted`} />
          <KpiCard label="Leads attempted" icon={<PhoneCall size={13} />} value={fmtInt(c.attempted)} prevLabel={`${fmtPct(pctOf(c.attempted, c.totalLeads), 0)} of list · ${fmtInt(calls.length)} calls`} />
          <KpiCard label="Connected calls" icon={<PhoneIncoming size={13} />} value={fmtInt(c.connected)} prevLabel={`${fmtPct(connectRate)} connect rate`} />
          <KpiCard label="Qualified" icon={<BadgeCheck size={13} />} value={fmtInt(c.qualified)} prevLabel={`${fmtPct(pctOf(c.qualified, c.connected))} of connected`} onClick={() => setTab('qualified')} />
          <KpiCard label="Warm leads" icon={<Flame size={13} />} value={fmtInt(c.warm)} prevLabel="awaiting follow-up" />
          <KpiCard label="Avg. call duration" icon={<Clock size={13} />} value={fmtDur(avgDur)} prevLabel="connected calls" />
          <KpiCard label="Calling minutes" icon={<Timer size={13} />} value={fmtInt(c.minutes)} prevLabel={`${fmtGBP(c.costPerMinute, 3)} per minute`} />
          <KpiCard label="Estimated spend" icon={<PoundSterling size={13} />} value={fmtGBP(spend, 2)} prevLabel={`projected ${fmtGBP(projected)} at completion`} />
        </div>

        <div className="grid g-main-side" style={{ marginBottom: 16 }}>
          <Card title="Calls over time" sub="Placed, connected and qualified calls for this campaign" actions={<Segmented value={span} onChange={setSpan} options={[{ value: '14', label: '14d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }]} />}>
            <Legend items={[{ label: 'Calls placed', color: CHART.ink }, { label: 'Connected', color: CHART.blue }, { label: 'Qualified', color: CHART.green }]} />
            <div style={{ height: 250 }} className="mt-12">
              <ResponsiveContainer>
                <ComposedChart data={series} margin={{ left: -16, right: 4, top: 8 }}>
                  <defs><linearGradient id="gCampCalls" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={CHART.ink} stopOpacity={0.08} /><stop offset="1" stopColor={CHART.ink} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} cursor={{ stroke: CHART.light }} />
                  <Area type="monotone" dataKey="calls" name="Calls placed" stroke={CHART.ink} strokeWidth={1.75} fill="url(#gCampCalls)" />
                  <Line type="monotone" dataKey="connected" name="Connected" stroke={CHART.blue} strokeWidth={1.75} dot={false} />
                  <Bar dataKey="qualified" name="Qualified" fill={CHART.green} barSize={span === '90' ? 3 : 6} radius={[2, 2, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Calling progress" sub={`${daysLeft} days remaining · ends ${fmtDate(c.endDate)}`}>
            <div className="col gap-16">
              <ProgressRow label="Leads attempted" value={`${fmtInt(c.attempted)} / ${fmtInt(c.totalLeads)}`} pct={pctOf(c.attempted, c.totalLeads)} />
              <ProgressRow label="Connected calls" value={`${fmtInt(connectedCalls.length)} / ${fmtInt(calls.length)} · ${fmtPct(connectRate, 0)}`} pct={connectRate} color={CHART.blue} />
              <ProgressRow label="Today’s calls vs daily cap" value={`${fmtInt(todayCalls.length)} / ${fmtInt(c.dailyCap)}`} pct={pctOf(todayCalls.length, c.dailyCap)} color={pctOf(todayCalls.length, c.dailyCap) > 85 ? CHART.orange : CHART.purple} />
              <ProgressRow label="Live concurrency" value={`${live.length} / ${c.concurrency}`} pct={pctOf(live.length, c.concurrency)} color={CHART.green} />
            </div>
            <div className="divider" />
            <div className="small subtle">
              {c.status === 'Active' ? (pace > 0 ? (Number.isFinite(daysToFinish) && daysToFinish <= daysLeft ? <>At ~{fmtInt(pace)} new leads/day the list completes in <span className="strong">{daysToFinish} days</span>, within the end date.</> : <>At ~{fmtInt(pace)} new leads/day, <span className="orange medium">{fmtInt(Math.max(0, remaining - pace * daysLeft))} leads</span> may remain at the end date.</>) : 'Waiting for first calls.') : `Campaign is ${c.status.toLowerCase()}.`}
            </div>
          </Card>
        </div>

        <div className="grid g-3" style={{ marginBottom: 16 }}>
          <Card title="Lead funnel" sub="Current status of the campaign’s leads">
            <div className="col" style={{ gap: 2 }}>
              {funnel.map((f, i) => (
                <div key={f.label} className="funnel-row" style={{ gridTemplateColumns: '84px 1fr 72px' }}>
                  <span className="small subtle">{f.label}</span>
                  <div><div className="funnel-bar" style={{ width: `${Math.max(4, pctOf(f.v, funnel[0].v || 1))}%`, background: i >= 4 ? CHART.green : `rgba(10,10,10,${0.9 - i * 0.14})` }} /></div>
                  <span className="mono tnum small" style={{ textAlign: 'right' }}>{fmtInt(f.v)}<span className="muted"> {i > 0 && funnel[i - 1].v ? `${Math.round(pctOf(f.v, funnel[i - 1].v))}%` : ''}</span></span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Outcome breakdown" sub={`${fmtInt(calls.length)} calls`}>
            <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
              {outcomes.map(([o, n]) => <div key={o} style={{ width: `${pctOf(n, calls.length)}%`, background: OUTCOME_COLORS[o] ?? CHART.grey }} title={`${o}: ${n}`} />)}
            </div>
            <div className="col mt-12" style={{ gap: 7 }}>
              {outcomes.map(([o, n]) => (
                <div key={o} className="row between small">
                  <span className="row gap-4"><i style={{ width: 8, height: 8, borderRadius: 2, background: OUTCOME_COLORS[o] ?? CHART.grey, display: 'inline-block', border: '1px solid rgba(0,0,0,.05)' }} />{o}</span>
                  <span className="row"><span className="mono tnum">{fmtInt(n)}</span><span className="mono muted" style={{ width: 44, textAlign: 'right' }}>{fmtPct(pctOf(n, calls.length))}</span></span>
                </div>
              ))}
              {!outcomes.length && <div className="small muted">No calls yet.</div>}
            </div>
          </Card>
          <Card title="Cost analysis" sub="Estimated from calling minutes">
            <KV items={[
              ['Spend to date', <span className="mono strong">{fmtGBP(spend, 2)}</span>],
              ['Per call', <span className="mono">{fmtGBP(calls.length ? callCost / calls.length : 0, 3)}</span>],
              ['Per connected call', <span className="mono">{fmtGBP(c.connected ? spend / c.connected : 0, 2)}</span>],
              ['Per qualified lead', <span className="mono">{fmtGBP(c.qualified ? spend / c.qualified : 0, 2)}</span>],
              ['Rate', <span className="mono">{fmtGBP(c.costPerMinute, 3)} / min</span>],
            ]} />
            <div className="divider" />
            <div className="row between small"><span className="muted">Projected at completion</span><span className="mono strong">{fmtGBP(projected)}</span></div>
            <div className="mt-8"><Progress value={pctOf(spend, projected)} color={CHART.orange} /></div>
            <div className="xs muted mt-4">{fmtInt(remaining)} leads remaining × {fmtGBP(perLead, 2)} avg per lead</div>
          </Card>
        </div>

        <div className="grid g-main-side">
          <Card title={<span className="row gap-4">Live calls <SimBadge /></span>} sub="In-progress simulated calls for this campaign" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/calling')}>Calling centre</Button>}>
            <div className="list">
              {live.map((lc) => {
                const l = app.leadById.get(lc.leadId);
                return (
                  <div key={lc.id} className="list-item clickable" onClick={() => nav(`/calling?call=${lc.id}`)}>
                    <span className="live-dot" />
                    <div className="grow"><div className="cell-primary truncate">{l?.name}</div><div className="cell-sub">{STAGES[lc.stage]} · intent {lc.intent}</div></div>
                    <div style={{ width: 90 }} className="desktop-only"><Progress value={lc.progress} color={CHART.green} /></div>
                    <StatusBadge status={lc.sentiment} dot={false} />
                    <span className="mono small tnum" style={{ width: 40, textAlign: 'right' }}>{fmtDur(lc.elapsed * 4)}</span>
                  </div>
                );
              })}
              {!live.length && <div className="small muted">{c.status === 'Active' ? (app.settings.callingPaused ? 'Calling is paused globally.' : 'No calls in progress right now — new calls start automatically.') : `No live calls — campaign is ${c.status.toLowerCase()}.`}</div>}
            </div>
          </Card>
          <Card title="Recent calls" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => setTab('calls')}>All calls</Button>}>
            <div className="list">
              {calls.slice(0, 6).map((x) => (
                <div key={x.id} className="list-item clickable" onClick={() => nav(`/conversations/${x.id}`)}>
                  <div className="grow"><div className="cell-primary truncate">{app.leadById.get(x.leadId)?.name}</div><div className="cell-sub mono">{x.id} · {fmtRelative(x.startedAt)}</div></div>
                  <StatusBadge status={x.outcome} />
                </div>
              ))}
              {!calls.length && <div className="small muted">No calls yet.</div>}
            </div>
          </Card>
        </div>
      </>)}

      {tab === 'calls' && (
        <Card flush>
          <DataTable rows={calls} columns={callCols} rowKey={(x) => x.id} onRowClick={(x) => nav(`/conversations/${x.id}`)} pageSize={12}
            toolbar={<><span className="small subtle grow">{fmtInt(calls.length)} calls · {fmtInt(connectedCalls.length)} connected · {fmtInt(qualCalls.length)} qualified</span><Button size="sm" icon={<Download />} onClick={() => acts.exportCalls(c)}>Export CSV</Button></>}
            empty={<EmptyState title="No calls yet" desc="Calls appear here once the campaign starts dialling." />} />
        </Card>
      )}

      {tab === 'qualified' && (
        <Card flush title="Qualified leads" sub={`Hot, warm and converted leads from this campaign · min. score ${c.qualification.minScore}`} actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/qualified')}>Handover queue</Button>}>
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead><tr><th>Lead</th><th>Status</th><th>Score</th><th>Last call</th><th>Assigned to</th><th>Next follow-up</th></tr></thead>
              <tbody>
                {qualifiedLeads.slice(0, 50).map((l) => (
                  <tr key={l.id} className="clickable" onClick={() => nav(`/qualified?lead=${l.id}`)}>
                    <td data-label="Lead"><div className="cell-primary">{l.name}</div><div className="mono muted">{l.id} · {l.city}</div></td>
                    <td data-label="Status"><StatusBadge status={l.status} /></td>
                    <td data-label="Score"><ScoreBar value={l.score} /></td>
                    <td data-label="Last call" className="small">{fmtRelative(l.lastCallAt)}</td>
                    <td data-label="Assigned to">{l.assignedRepId ? <span className="row gap-4"><Avatar name={app.memberById.get(l.assignedRepId)?.name} size="sm" />{app.memberById.get(l.assignedRepId)?.name}</span> : <Badge tone="amber">Unassigned</Badge>}</td>
                    <td data-label="Next follow-up" className="small mono">{l.nextFollowUp ? fmtDateShort(l.nextFollowUp) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!qualifiedLeads.length && <EmptyState icon={<Target size={18} />} title="No qualified leads yet" desc="Leads that meet the qualification criteria appear here." />}
          </div>
          {qualifiedLeads.length > 50 && <div className="table-foot"><span>Showing 50 of {fmtInt(qualifiedLeads.length)}</span><Button size="xs" onClick={() => nav('/qualified')}>View all in handover queue</Button></div>}
        </Card>
      )}

      {tab === 'config' && (
        <div className="grid g-2">
          <Card title="AI agent" actions={agent && <Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav(`/agents/${agent.id}`)}>Open agent</Button>}>
            {agent ? (<>
              <div className="row"><Avatar initials={agent.initials} color={agent.color} agent size="lg" /><div className="grow"><div className="cell-primary">{agent.name} <span className="mono muted">{agent.version}</span></div><div className="cell-sub">{agent.voice} · {agent.language}</div></div><StatusBadge status={agent.status} /></div>
              <div className="small subtle mt-12">{agent.personality}</div>
              <div className="grid g-4 keep-2 mt-16" style={{ gap: 8 }}>
                <MiniKV l="Total calls" v={fmtInt(agent.totalCalls)} /><MiniKV l="Qual. rate" v={fmtPct(agent.qualificationRate)} /><MiniKV l="Avg duration" v={fmtDur(agent.avgDuration)} /><MiniKV l="Escalation" v={fmtPct(agent.escalationRate)} />
              </div>
            </>) : <div className="small muted">Agent not found.</div>}
          </Card>
          <Card title="Product & offer" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/products')}>Catalogue</Button>}>
            {product && <KV items={[
              ['Product', <span className="medium">{product.name}</span>], ['Price', `${fmtGBP(product.monthlyPrice)}/mo · ${product.contractMonths} months${product.upfront ? ` · ${fmtGBP(product.upfront)} upfront` : ''}`],
              ['Approval', product.approved ? <Badge tone="green" dot>Approved</Badge> : <Badge tone="red" dot>Not approved</Badge>],
              ['Offer', offer ? <span>{offer.name} <span className="mono muted">{offer.code}</span> <StatusBadge status={offer.status} /></span> : 'Standard pricing'],
              ...(offer ? [['Discount', offer.discount] as [ReactNode, ReactNode]] : []),
              ['Pitch emphasis', extras?.pitch.length ? extras.pitch.join(', ') : product.benefits.slice(0, 2).join(', ')],
            ]} />}
          </Card>
          <Card title="Calling schedule" actions={acts.canManage && !['Completed', 'Stopped'].includes(c.status) ? <Button size="xs" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditOpen(true)}>Edit</Button> : undefined}>
            <KV items={[
              ['Days', daysRange(c.schedule.days)], ['Window', <span className="mono">{c.schedule.start}–{c.schedule.end} · {c.schedule.timezone}</span>],
              ['Dates', `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}`], ['Concurrency', `${c.concurrency} simultaneous calls`], ['Daily cap', `${fmtInt(c.dailyCap)} calls`],
              ['Retries', `${c.retry.maxAttempts} attempts · every ${c.retry.intervalHours}h`], ['Voicemail', extras?.voicemail ?? 'Do not leave a message'],
            ]} />
          </Card>
          <Card title="Qualification & targeting">
            <KV items={[
              ['Min. score', <span className="mono">{c.qualification.minScore}/100</span>],
              ['Requirements', [c.qualification.requireBudget && 'Budget', c.qualification.requireDecisionMaker && 'Decision maker', c.qualification.requireTimeline && 'Timeline'].filter(Boolean).join(' · ') || 'None'],
              ['Thresholds', `Hot ≥ ${extras?.hotThreshold ?? app.settings.hotThreshold} · Warm ≥ ${extras?.warmThreshold ?? app.settings.warmThreshold}`],
              ['Segment', c.segment], ['Objective', extras?.objective ?? '—'], ['Owner', c.createdBy],
              ...(extras?.filters ? [['Lead filters', extras.filters] as [ReactNode, ReactNode]] : []),
            ]} />
            {extras?.questions.length ? <><div className="label mt-16" style={{ marginBottom: 6 }}>Custom questions</div><ol className="small subtle" style={{ margin: 0, paddingLeft: 18 }}>{extras.questions.map((q) => <li key={q}>{q}</li>)}</ol></> : null}
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <Card title="Campaign activity" sub="Lifecycle events and audit log entries for this campaign">
          <div className="timeline">
            {history.map((e, i) => (
              <div key={i} className="tl-item">
                <span className="tl-dot"><span style={{ background: e.tone === 'green' ? 'var(--green)' : e.tone === 'red' ? 'var(--red)' : e.tone === 'amber' ? 'var(--amber)' : e.tone === 'blue' ? 'var(--blue)' : undefined }} /></span>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div><div className="small medium" style={{ color: 'var(--ink)' }}>{e.title}</div>{e.detail && <div className="xs muted mt-4">{e.detail}</div>}</div>
                  <div style={{ textAlign: 'right' }}><div className="mono xs muted">{e.when}</div><div className="xs subtle">{e.actor}</div></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <EditCampaignModal campaign={c} open={editOpen} onClose={() => setEditOpen(false)} />
    </ModulePage>
  );
}

function ProgressRow({ label, value, pct, color }: { label: string; value: string; pct: number; color?: string }) {
  return <div><div className="row between small"><span className="subtle">{label}</span><span className="mono tnum">{value}</span></div><div className="mt-4"><Progress value={pct} color={color} /></div></div>;
}
function MiniKV({ l, v }: { l: string; v: string }) {
  return <div><div className="xs muted">{l}</div><div className="mono small strong">{v}</div></div>;
}
