import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowRight, Bot, Clock, Ear, FlaskConical, Gauge, Headphones, ListOrdered, MessageSquare, Pause, PhoneCall, PhoneOff, Play, Send, ShieldOff, Square, Timer, UserRound, XCircle, CheckCircle2, Pencil,
} from 'lucide-react';
import { useApp, STAGES, type LiveCall } from '../store/store';
import {
  Avatar, Badge, Button, Card, Drawer, EmptyState, Field, KpiCard, Progress, SimBadge, StatusBadge, Transcript, useConfirm, CHART,
} from '../components/ui';
import { fmtDur, fmtGBP, fmtInt, fmtPct, fmtRelative, fmtTime } from '../lib/format';
import type { CallOutcome, Campaign, Suppression } from '../data/types';
import { EditCampaignModal, daysRange, isToday, pctOf, useCampaignActions, ModulePage } from './campaigns/shared';

const QUEUE_STATUSES = ['Queued', 'New', 'Contacted', 'Callback requested'];
const END_OUTCOMES: CallOutcome[] = ['Qualified', 'Interested', 'Callback requested', 'Transferred to human', 'Not interested', 'Opted out'];
const SUPP_REASONS: Suppression['reason'][] = ['Customer opt-out', 'TPS registered', 'Complaint', 'Vulnerable customer', 'Legal hold', 'Deceased'];

export default function Calling() {
  const app = useApp(); const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const openId = sp.get('call');
  const setOpen = (id: string | null) => { const n = new URLSearchParams(sp); if (id) n.set('call', id); else n.delete('call'); setSp(n, { replace: true }); };
  const acts = useCampaignActions();
  const canControl = app.can('calling.control');
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [filterCamp, setFilterCamp] = useState('');

  const s = app.settings;
  const todayCalls = useMemo(() => app.calls.filter((c) => isToday(c.startedAt)), [app.calls]);
  const today = useMemo(() => {
    const conn = todayCalls.filter((c) => c.connected);
    return {
      total: todayCalls.length, failed: todayCalls.filter((c) => c.outcome === 'Failed').length,
      avg: conn.length ? conn.reduce((a, c) => a + c.duration, 0) / conn.length : 0,
      minutes: Math.round(todayCalls.reduce((a, c) => a + c.duration, 0) / 60), cost: todayCalls.reduce((a, c) => a + c.cost, 0),
      byCamp: todayCalls.reduce((m, c) => m.set(c.campaignId, (m.get(c.campaignId) ?? 0) + 1), new Map<string, number>()),
    };
  }, [todayCalls]);

  const activeCampIds = useMemo(() => new Set(app.campaigns.filter((c) => c.status === 'Active').map((c) => c.id)), [app.campaigns]);
  const liveLeadIds = new Set(app.live.map((l) => l.leadId));
  const queue = useMemo(() => app.leads.filter((l) => l.campaignId && activeCampIds.has(l.campaignId) && QUEUE_STATUSES.includes(l.status) && app.eligibility(l).ok)
    .sort((a, b) => (a.status === 'Callback requested' ? -1 : 0) - (b.status === 'Callback requested' ? -1 : 0) || a.attempts - b.attempts || b.tenureMonths - a.tenureMonths),
  [app.leads, activeCampIds, app.eligibility]);
  const liveAgents = app.agents.filter((a) => a.status === 'Live');
  const busyAgents = new Set(app.live.map((l) => l.agentId));
  const capPct = pctOf(app.live.length, s.maxConcurrent);
  const dailyPct = pctOf(today.total, s.dailyCap);

  const controlCamps = app.campaigns.filter((c) => ['Active', 'Paused', 'Scheduled'].includes(c.status));
  const liveList = filterCamp ? app.live.filter((l) => l.campaignId === filterCamp) : app.live;
  const sessionCalls = app.calls.filter((c) => c.id.startsWith('CL-9'));
  const recent = (sessionCalls.length ? sessionCalls : app.calls).slice(0, 8);

  const failures = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    const f = app.calls.filter((c) => c.outcome === 'Failed' && new Date(c.startedAt).getTime() >= cutoff);
    const by = new Map<string, number>(); f.forEach((c) => by.set(c.failureReason ?? 'Unknown', (by.get(c.failureReason ?? 'Unknown') ?? 0) + 1));
    return { list: f, by: [...by.entries()].sort((a, b) => b[1] - a[1]) };
  }, [app.calls]);

  const togglePause = () => {
    const paused = !s.callingPaused;
    app.updateSettings({ callingPaused: paused });
    app.audit(paused ? 'Paused all calling' : 'Resumed all calling', 'Calling centre', 'Settings');
    app.toast(paused ? 'All calling paused' : 'Calling resumed', paused ? 'No new simulated calls will start. Calls in progress will finish.' : 'Active campaigns will resume dialling (simulated).', paused ? 'info' : 'success');
  };
  const ctlTitle = canControl ? undefined : 'Your role cannot control calling';

  return (
    <ModulePage>
      <div className="page-head">
        <div className="grow">
          <div className="row" style={{ marginBottom: 8 }}>
            {s.callingPaused ? <Badge tone="amber" dot>Calling paused</Badge> : <Badge tone="green" dot live>{app.live.length} calls in progress</Badge>}
            <SimBadge />
          </div>
          <h1 className="page-title">AI Calling Centre</h1>
          <p className="page-desc">Monitor live AI conversations, control campaign pacing and step in when a human is needed.</p>
        </div>
        <div className="row-wrap">
          <Button size="sm" icon={<ListOrdered />} onClick={() => document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' })}>Queue ({fmtInt(queue.length)})</Button>
          <Button size="sm" variant={s.callingPaused ? 'primary' : 'danger'} icon={s.callingPaused ? <Play /> : <Pause />} disabled={!canControl} title={ctlTitle} onClick={togglePause}>{s.callingPaused ? 'Resume all calling' : 'Pause all calling'}</Button>
        </div>
      </div>

      <div className="banner sim" style={{ marginBottom: 16 }}>
        <FlaskConical />
        <div><span className="medium">Simulation mode.</span> Every call on this page is generated by a demonstration engine — no real phone numbers are dialled and no audio is transmitted. Supervisor actions (listen, whisper, takeover) are simulated against the same data model a telephony integration would use.</div>
      </div>

      <div className="grid g-4 keep-2" style={{ marginBottom: 16 }}>
        <KpiCard label="Active calls" icon={<PhoneCall size={13} />} value={<span className="row gap-4">{fmtInt(app.live.length)}{app.live.length > 0 && <span className="live-dot" />}</span>} hint={<span>{app.live.filter((l) => l.takenOver).length} human takeover · {app.live.filter((l) => l.monitoring).length} monitored</span>} />
        <KpiCard label="Calls in queue" icon={<ListOrdered size={13} />} value={fmtInt(queue.length)} hint={<span>eligible leads in {activeCampIds.size} active campaigns</span>} onClick={() => document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' })} />
        <KpiCard label="Completed today" icon={<CheckCircle2 size={13} />} value={fmtInt(today.total)} hint={<span>{fmtInt(sessionCalls.length)} simulated this session</span>} onClick={() => nav('/history')} />
        <KpiCard label="Failed today" icon={<XCircle size={13} />} value={fmtInt(today.failed)} hint={<span>{fmtPct(pctOf(today.failed, today.total))} technical failure rate</span>} onClick={() => nav('/history?outcome=Failed')} />
        <KpiCard label="Available AI agents" icon={<Bot size={13} />} value={`${liveAgents.length}`} hint={<span>{busyAgents.size} handling calls · {app.agents.length - liveAgents.length} offline/testing</span>} onClick={() => nav('/agents')} />
        <KpiCard label="Avg. call duration" icon={<Timer size={13} />} value={fmtDur(today.avg)} hint={<span>connected calls today</span>} />
        <KpiCard label="Minutes today" icon={<Clock size={13} />} value={fmtInt(today.minutes)} hint={<span>{fmtGBP(today.cost, 2)} estimated spend</span>} />
        <div className="card kpi">
          <div className="kpi-label"><Gauge size={13} />Current capacity</div>
          <div className="kpi-value">{app.live.length}<span className="muted" style={{ fontSize: 16, fontWeight: 500 }}> / {s.maxConcurrent}</span></div>
          <Progress value={capPct} color={capPct > 85 ? CHART.orange : CHART.ink} />
          <div className="kpi-foot">{fmtPct(capPct, 0)} of concurrent line limit</div>
        </div>
      </div>

      {/* Global controls + campaign control */}
      <Card title="Global controls" sub="Apply to every campaign in this workspace" style={{ marginBottom: 16 }}>
        <div className="grid g-4" style={{ gap: 20 }}>
          <div>
            <div className="field-label">Calling status</div>
            <div className="small muted mt-4">{s.callingPaused ? 'Paused — no new calls start' : 'Running within calling hours'}</div>
            <div className="mt-8"><Button size="sm" variant={s.callingPaused ? 'primary' : 'secondary'} icon={s.callingPaused ? <Play /> : <Pause />} disabled={!canControl} title={ctlTitle} onClick={togglePause}>{s.callingPaused ? 'Resume' : 'Pause all'}</Button></div>
          </div>
          <div>
            <div className="row between"><span className="field-label">Max concurrent calls</span><span className="mono strong">{s.maxConcurrent}</span></div>
            <input type="range" className="range mt-8" min={1} max={100} value={s.maxConcurrent} disabled={!canControl} title={ctlTitle}
              onChange={(e) => app.updateSettings({ maxConcurrent: +e.target.value })}
              onPointerUp={() => app.audit('Changed max concurrent calls', String(s.maxConcurrent), 'Settings')} aria-label="Max concurrent calls" />
            <div className="row between xs muted"><span>1</span><span>Line limit 100</span></div>
          </div>
          <div>
            <div className="row between"><span className="field-label">Daily call capacity</span><span className="mono small">{fmtInt(today.total)} / {fmtInt(s.dailyCap)}</span></div>
            <div className="row mt-8">
              <input type="number" className="input sm" style={{ width: 100 }} min={100} step={100} value={s.dailyCap} disabled={!canControl} title={ctlTitle}
                onChange={(e) => app.updateSettings({ dailyCap: Math.max(1, +e.target.value || 1) })} aria-label="Daily call capacity" />
              <div className="grow"><Progress value={dailyPct} color={dailyPct > 85 ? CHART.orange : CHART.purple} /></div>
            </div>
          </div>
          <div>
            <div className="row between"><span className="field-label">Permitted calling hours</span><Button size="xs" variant="ghost" onClick={() => nav('/settings')}>Settings</Button></div>
            <div className="small muted mt-4">{s.callingHours.days.join(', ')}</div>
            <div className="mono small">{s.callingHours.start}–{s.callingHours.end} · {s.timezone}</div>
          </div>
        </div>
      </Card>

      <div style={{ marginBottom: 16 }}>
        <Card flush title="Campaign controls" sub="Pacing, limits and schedule per campaign" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/campaigns')}>Campaigns</Button>}>
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead><tr><th>Campaign</th><th>Status</th><th>Live / limit</th><th>Today vs cap</th><th>Retry</th><th>Window</th><th style={{ width: 150 }} /></tr></thead>
              <tbody>
                {controlCamps.map((c) => {
                  const lv = app.live.filter((l) => l.campaignId === c.id).length; const td = today.byCamp.get(c.id) ?? 0;
                  const dis = !acts.canManage && !canControl;
                  return (
                    <tr key={c.id}>
                      <td data-label="Campaign"><button className="btn link cell-primary" style={{ color: 'var(--ink)' }} onClick={() => nav(`/campaigns/${c.id}`)}>{c.name}</button><div className="mono muted">{c.id} · {app.agentById.get(c.agentId)?.name}</div></td>
                      <td data-label="Status"><StatusBadge status={c.status} /></td>
                      <td data-label="Live / limit"><span className="mono">{lv} / {c.concurrency}</span></td>
                      <td data-label="Today vs cap"><div className="row" style={{ minWidth: 130 }}><div style={{ width: 60 }}><Progress value={pctOf(td, c.dailyCap)} color={pctOf(td, c.dailyCap) > 85 ? CHART.orange : CHART.purple} /></div><span className="mono small">{td}/{c.dailyCap}</span></div></td>
                      <td data-label="Retry" className="small">{c.retry.maxAttempts}× · {c.retry.intervalHours}h</td>
                      <td data-label="Window" className="small"><span>{daysRange(c.schedule.days)}</span><div className="mono xs muted">{c.schedule.start}–{c.schedule.end}</div></td>
                      <td data-label="">
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                          {c.status === 'Active' && <Button size="xs" icon={<Pause />} disabled={dis} title={dis ? acts.denied : 'Pause'} onClick={() => acts.pause(c)}>Pause</Button>}
                          {c.status === 'Paused' && <Button size="xs" icon={<Play />} disabled={dis} title={dis ? acts.denied : 'Resume'} onClick={() => acts.resume(c)}>Resume</Button>}
                          {c.status === 'Scheduled' && <Button size="xs" icon={<Play />} disabled={dis} title={dis ? acts.denied : 'Start now'} onClick={() => acts.resume(c)}>Start</Button>}
                          <Button size="xs" iconOnly icon={<Pencil />} disabled={dis} title={dis ? acts.denied : 'Edit pacing & schedule'} aria-label="Edit pacing and schedule" onClick={() => setEditing(c)} />
                          <Button size="xs" iconOnly variant="danger" icon={<Square />} disabled={dis} title={dis ? acts.denied : 'Stop campaign'} aria-label="Stop campaign" onClick={() => acts.stop(c)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!controlCamps.length && <EmptyState title="No running campaigns" desc="Launch a campaign to start simulated calling." />}
          </div>
        </Card>
      </div>

      {/* Live monitoring grid */}
      <Card style={{ marginBottom: 16 }} title={<span className="row gap-4">Live call monitoring <SimBadge /></span>} sub="Click a call to open the live transcript and supervisor controls"
        actions={<select className="select sm soft" value={filterCamp} onChange={(e) => setFilterCamp(e.target.value)} aria-label="Filter by campaign" style={{ maxWidth: 220 }}>
          <option value="">All campaigns ({app.live.length})</option>
          {app.campaigns.filter((c) => c.status === 'Active' || app.live.some((l) => l.campaignId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} ({app.live.filter((l) => l.campaignId === c.id).length})</option>)}
        </select>}>
        {liveList.length ? (
          <div className="grid g-3" style={{ gap: 12 }}>
            {liveList.map((lc) => <LiveCard key={lc.id} lc={lc} selected={lc.id === openId} onOpen={() => setOpen(lc.id)} />)}
          </div>
        ) : (
          <EmptyState icon={s.callingPaused ? <Pause size={18} /> : <Activity size={18} />} title={s.callingPaused ? 'Calling is paused' : 'No calls in progress'}
            desc={s.callingPaused ? 'Resume calling to let active campaigns place new simulated calls.' : 'New simulated calls start automatically for active campaigns.'}
            action={s.callingPaused && canControl ? <Button size="sm" icon={<Play />} onClick={togglePause}>Resume calling</Button> : undefined} />
        )}
      </Card>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Card flush title="Queue preview" sub={`Next leads to be dialled · ${fmtInt(queue.length)} eligible`}>
          <div id="queue" style={{ padding: '0 16px 8px' }} className="list">
            {queue.slice(0, 8).map((l, i) => (
              <div key={l.id} className="list-item clickable" onClick={() => nav(`/leads/${l.id}`)}>
                <span className="mono xs muted" style={{ width: 16 }}>{i + 1}</span>
                <div className="grow"><div className="cell-primary truncate">{l.name}{liveLeadIds.has(l.id) && <span className="live-dot" style={{ display: 'inline-block', width: 6, height: 6, marginLeft: 6 }} />}</div><div className="cell-sub truncate">{app.campaignById.get(l.campaignId!)?.name} · attempt {l.attempts + 1}</div></div>
                <StatusBadge status={l.status} />
              </div>
            ))}
            {!queue.length && <div className="small muted" style={{ padding: '8px 0' }}>Queue is empty.</div>}
          </div>
        </Card>
        <Card flush title="Recently completed" sub={sessionCalls.length ? 'Simulated during this session' : 'Latest calls'} actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/history')}>History</Button>}>
          <div style={{ padding: '0 16px 8px' }} className="list">
            {recent.map((c) => (
              <div key={c.id} className="list-item clickable" onClick={() => nav(`/conversations/${c.id}`)}>
                <div className="grow"><div className="cell-primary truncate">{app.leadById.get(c.leadId)?.name}</div><div className="cell-sub mono truncate">{c.id} · {fmtDur(c.duration)} · {fmtTime(c.startedAt)}</div></div>
                <StatusBadge status={c.outcome} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Failures monitor" sub={`Technical failures · last 7 days · ${failures.list.length} calls`} actions={<Button size="xs" variant="ghost" onClick={() => nav('/history?outcome=Failed')}>View</Button>}>
          <div className="col" style={{ gap: 8 }}>
            {failures.by.map(([r, n]) => (
              <div key={r}>
                <div className="row between small"><span className="truncate">{r}</span><span className="mono tnum">{n}</span></div>
                <div className="progress mt-4" style={{ height: 4 }}><div style={{ width: `${pctOf(n, failures.by[0][1])}%`, background: CHART.orange }} /></div>
              </div>
            ))}
            {!failures.by.length && <div className="small muted">No failures in the last 7 days.</div>}
          </div>
          <div className="divider" />
          <div className="list">
            {failures.list.slice(0, 4).map((c) => (
              <div key={c.id} className="list-item clickable" style={{ padding: '6px 0' }} onClick={() => nav(`/conversations/${c.id}`)}>
                <PhoneOff size={14} className="orange" />
                <div className="grow"><div className="small truncate" style={{ color: 'var(--ink)' }}>{c.failureReason}</div><div className="mono xs muted">{c.id} · {fmtRelative(c.startedAt)}</div></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Exclusions />

      <EditCampaignModal campaign={editing} open={!!editing} onClose={() => setEditing(null)} showName={false} />
      <MonitorDrawer id={openId} onClose={() => setOpen(null)} />
    </ModulePage>
  );
}

/* ---------------- Live call card ---------------- */
function LiveCard({ lc, selected, onOpen }: { lc: LiveCall; selected: boolean; onOpen: () => void }) {
  const app = useApp();
  const lead = app.leadById.get(lc.leadId); const agent = app.agentById.get(lc.agentId); const camp = app.campaignById.get(lc.campaignId);
  const product = camp ? app.productById.get(camp.productId) : undefined;
  return (
    <div className={`option-card ${selected ? 'on' : ''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()} style={{ padding: 14 }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="row gap-4"><span className="live-dot" style={{ marginRight: 4 }} /><span className="cell-primary truncate">{lead?.name}</span></div>
          <div className="mono muted xs mt-4">{lead?.phone}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono strong tnum">{fmtDur(lc.elapsed * 4)}</div>
          <StatusBadge status={lc.sentiment} dot={false} />
        </div>
      </div>
      <div className="row small mt-8"><Avatar initials={agent?.initials} color={agent?.color} size="sm" agent /><span className="subtle truncate grow">{agent?.name} · {camp?.name}</span></div>
      <div className="mt-12">
        <div className="row between xs"><span className="medium" style={{ color: 'var(--ink)' }}>{STAGES[lc.stage]}</span><span className="muted mono">{lc.stage + 1}/{STAGES.length}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 2, marginTop: 6 }}>
          {STAGES.map((st, i) => <span key={st} title={st} style={{ height: 4, borderRadius: 2, background: i < lc.stage ? CHART.ink : i === lc.stage ? CHART.blue : 'var(--ash)' }} />)}
        </div>
      </div>
      <div className="grid g-2 mt-12" style={{ gap: 10 }}>
        <div><div className="row between xs"><span className="muted">Buying intent</span><span className="mono">{lc.intent}</span></div><div className="mt-4"><Progress value={lc.intent} color={lc.intent >= 60 ? CHART.green : lc.intent >= 35 ? CHART.blue : CHART.grey} /></div></div>
        <div><div className="row between xs"><span className="muted">Qualification</span><span className="mono">{lc.progress}%</span></div><div className="mt-4"><Progress value={lc.progress} color={CHART.purple} /></div></div>
      </div>
      <div className="row between mt-12 xs">
        <span className="muted truncate">Pitching <span className="medium" style={{ color: 'var(--graphite)' }}>{product?.name}</span></span>
        <span className="row gap-4">
          {lc.takenOver && <Badge tone="purple">Human</Badge>}
          {lc.monitoring && !lc.takenOver && <Badge tone="blue"><Headphones size={10} />Listening</Badge>}
          {lc.whisper && <Badge tone="amber">Whisper</Badge>}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Monitor drawer ---------------- */
function MonitorDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const app = useApp(); const nav = useNavigate(); const confirm = useConfirm();
  const lc = id ? app.live.find((l) => l.id === id) : undefined;
  const lastLc = useRef<LiveCall | undefined>(undefined);
  if (lc) lastLc.current = lc;
  const ref = useRef<HTMLDivElement>(null);
  const [whisper, setWhisper] = useState('');
  const [outcome, setOutcome] = useState<CallOutcome>('Callback requested');
  const canTake = app.can('calling.takeover');
  const takeTitle = canTake ? undefined : 'Requires supervisor permissions (calling.takeover)';

  useEffect(() => { setWhisper(''); setOutcome('Callback requested'); lastLc.current = lc; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [lc?.lines.length, id]);

  if (!id) return null;
  const shown = lc ?? (lastLc.current?.id === id ? lastLc.current : undefined);
  const lead = shown ? app.leadById.get(shown.leadId) : undefined;
  const agent = shown ? app.agentById.get(shown.agentId) : undefined;
  const camp = shown ? app.campaignById.get(shown.campaignId) : undefined;
  const product = camp ? app.productById.get(camp.productId) : undefined;
  const ended = !lc;
  const finalCall = ended && shown ? app.calls.find((c) => c.leadId === shown.leadId && c.simulated && c.id.startsWith('CL-9')) : undefined;
  const connected = shown ? !['No answer', 'Voicemail'].includes(shown.plannedOutcome) : false;
  const maxStage = shown ? (connected ? (shown.plannedOutcome === 'Not interested' ? 6 : shown.plannedOutcome === 'Callback requested' ? 3 : 9) : 0) : 0;
  const speaking = lc && !lc.takenOver && lc.elapsed < lc.plannedDuration;
  const nextSpeaker = lc ? (lc.lines[lc.lines.length - 1]?.speaker === 'AI' ? lead?.name.split(' ')[0] ?? 'Customer' : `${agent?.name ?? 'AI'} (AI)`) : '';

  const addSystem = (text: string, patch: Partial<LiveCall> = {}) => { if (!lc) return; app.updateLive(lc.id, { ...patch, lines: [...lc.lines, { t: lc.elapsed * 4, speaker: 'System', text }] }); };
  const listen = () => {
    if (!lc) return;
    addSystem(lc.monitoring ? `${app.me.name} stopped listening.` : `${app.me.name} is listening in (silent monitor).`, { monitoring: !lc.monitoring });
    app.toast(lc.monitoring ? 'Stopped listening' : 'Listening in (simulated)', lc.monitoring ? undefined : 'Silent monitoring — the customer and AI cannot hear you.', 'info');
  };
  const sendWhisper = () => {
    if (!lc || !whisper.trim()) return;
    addSystem(`Supervisor whisper to AI: “${whisper.trim()}”`, { whisper: true });
    app.audit('Whispered to AI agent', `${lc.id} · ${lead?.name}`, 'Agent');
    app.toast('Whisper sent to AI', 'The agent will factor this guidance into its next turn (simulated).');
    setWhisper('');
  };
  const takeover = async () => {
    if (!lc) return;
    const ok = await confirm({ title: 'Take over this call?', desc: `The AI agent will step back and you will handle the conversation with ${lead?.name}. This is a simulated takeover — no audio is routed.`, confirmLabel: 'Take over' });
    if (!ok) return;
    const cur = app.live.find((x) => x.id === lc.id);
    if (!cur) { app.toast('Call already ended', undefined, 'info'); return; }
    app.updateLive(lc.id, { takenOver: true, monitoring: true, lines: [...cur.lines, { t: cur.elapsed * 4, speaker: 'System', text: `${app.me.name} took over the call from ${agent?.name ?? 'the AI agent'}. AI agent muted.` }] });
    app.audit('Human takeover of AI call', `${lc.id} · ${lead?.name}`, 'Agent');
    app.toast('You are now handling this call', 'Simulated takeover — choose an outcome when you finish.');
    setOutcome('Transferred to human');
  };
  const end = async () => {
    if (!lc) return;
    if (!lc.takenOver) {
      const ok = await confirm({ title: 'End this call now?', desc: `The simulated call with ${lead?.name} will be terminated and logged as “${outcome}”.`, confirmLabel: 'End call', danger: true });
      if (!ok) return;
    }
    if (!app.live.some((x) => x.id === lc.id)) { app.toast('Call already ended', undefined, 'info'); return; }
    app.endLive(lc.id, outcome);
    app.audit(lc.takenOver ? 'Ended taken-over call' : 'Supervisor ended AI call', `${lc.id} · ${outcome}`, 'Agent');
    app.toast('Call ended', `Logged as “${outcome}” (simulated).`);
  };

  return (
    <Drawer open onClose={onClose} width={580} title={<span className="row gap-4">{ended ? <Badge tone="neutral">Ended</Badge> : <span className="live-dot" />}<span className="truncate">{lead?.name ?? 'Call'}</span><span className="mono muted" style={{ fontWeight: 400 }}>{id}</span></span>}
      footer={lc ? (
        <div className="col" style={{ width: '100%', gap: 8 }}>
          {lc.takenOver && <div className="banner info" style={{ width: '100%' }}><UserRound /><div><span className="medium">You are now handling this call (simulated).</span> Choose an outcome and end the call when you are done.</div></div>}
          <div className="row" style={{ width: '100%', flexWrap: 'wrap' }}>
            <select className="select sm" value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome)} disabled={!canTake} aria-label="Call outcome" style={{ width: 'auto', flex: 1, minWidth: 160 }}>
              {END_OUTCOMES.map((o) => <option key={o}>{o}</option>)}
            </select>
            <Button size="sm" variant="danger-solid" icon={<PhoneOff />} disabled={!canTake} title={takeTitle} onClick={end}>End call</Button>
          </div>
        </div>
      ) : <Button size="sm" onClick={onClose}>Close</Button>}>
      {!shown ? (
        <EmptyState icon={<PhoneOff size={18} />} title="Call not found" desc="This call has ended or the link is no longer valid." action={<Button size="sm" onClick={onClose}>Back to calling centre</Button>} />
      ) : (
        <div className="col gap-16">
          {ended && (
            <div className="banner ok"><CheckCircle2 /><div>
              This call has ended{finalCall ? <> — outcome <span className="medium">{finalCall.outcome}</span>, {fmtDur(finalCall.duration)}.</> : '.'}
              {finalCall && <> <button className="btn link small" onClick={() => nav(`/conversations/${finalCall.id}`)}>Open conversation record</button></>}
            </div></div>
          )}
          <div className="grid g-2" style={{ gap: 10 }}>
            <InfoTile label="Customer" value={<button className="btn link" onClick={() => nav(`/leads/${shown.leadId}`)}>{lead?.name}</button>} sub={<span className="mono">{lead?.phone}</span>} />
            <InfoTile label="AI agent" value={<span className="row gap-4"><Avatar initials={agent?.initials} color={agent?.color} size="sm" agent />{agent?.name}</span>} sub={agent?.voice} />
            <InfoTile label="Campaign" value={<button className="btn link" onClick={() => nav(`/campaigns/${shown.campaignId}`)}>{camp?.name}</button>} sub={product?.name} />
            <InfoTile label="Duration" value={<span className="mono">{fmtDur(shown.elapsed * 4)}</span>} sub={<span>Started {fmtTime(new Date(shown.startedAt))}</span>} />
          </div>

          <div>
            <div className="row between small"><span className="medium" style={{ color: 'var(--ink)' }}>{STAGES[shown.stage]}</span><span className="row gap-4"><StatusBadge status={shown.sentiment} dot={false} /><span className="mono xs muted">intent {shown.intent}</span></span></div>
            <div className="row-wrap mt-8" style={{ gap: 4 }}>
              {STAGES.map((st, i) => (
                <span key={st} className={`badge ${i < shown.stage ? 'neutral' : i === shown.stage ? 'blue' : 'outline'}`} style={{ opacity: i > maxStage ? 0.45 : 1 }}>{i < shown.stage ? '✓ ' : ''}{st}</span>
              ))}
            </div>
            <div className="grid g-2 mt-12" style={{ gap: 10 }}>
              <div><div className="row between xs"><span className="muted">Buying intent</span><span className="mono">{shown.intent}</span></div><div className="mt-4"><Progress value={shown.intent} color={CHART.green} /></div></div>
              <div><div className="row between xs"><span className="muted">Qualification progress</span><span className="mono">{shown.progress}%</span></div><div className="mt-4"><Progress value={shown.progress} color={CHART.purple} /></div></div>
            </div>
          </div>

          <div>
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="row gap-4 small medium" style={{ color: 'var(--ink)' }}><MessageSquare size={14} />Live transcript</span>
              <SimBadge label="Simulated transcript" />
            </div>
            <div ref={ref} className="scroll-y" style={{ maxHeight: 340, minHeight: 160, border: '1px solid var(--ash)', borderRadius: 10, padding: 14 }}>
              {shown.lines.length ? <Transcript lines={shown.lines} agentName={agent?.name ?? 'AI'} customerName={lead?.name ?? 'Customer'} agentColor={agent?.color} /> : <div className="small muted">Connecting…</div>}
              {speaking && <div className="row xs muted mt-12"><span className="typing"><span /><span /><span /></span>{nextSpeaker} is speaking…</div>}
              {lc?.takenOver && <div className="row xs mt-12" style={{ color: '#6d28d9' }}><UserRound size={12} />You are speaking with the customer (simulated)</div>}
            </div>
          </div>

          {lc && (
            <div>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="small medium" style={{ color: 'var(--ink)' }}>Supervisor controls</span>
                {!canTake && <span className="xs muted row gap-4"><ShieldOff size={12} />Supervisor role required</span>}
              </div>
              <div className="row-wrap">
                <Button size="sm" icon={<Ear />} disabled={!canTake || lc.takenOver} title={takeTitle} onClick={listen}>{lc.monitoring && !lc.takenOver ? 'Stop listening' : 'Listen in'}</Button>
                <Button size="sm" icon={<UserRound />} variant={lc.takenOver ? 'secondary' : 'primary'} disabled={!canTake || lc.takenOver} title={takeTitle} onClick={takeover}>{lc.takenOver ? 'Taken over' : 'Human takeover'}</Button>
              </div>
              {lc.monitoring && !lc.takenOver && <div className="row xs mt-8" style={{ color: 'var(--sapphire)' }}><Headphones size={12} />Listening silently — simulated audio stream</div>}
              {!lc.takenOver && (
                <Field label="Whisper to AI" hint="Private guidance the AI hears but the customer does not." className="mt-12">
                  <div className="row">
                    <input className="input sm" value={whisper} disabled={!canTake} placeholder="e.g. Mention the Together Discount" onChange={(e) => setWhisper(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendWhisper()} />
                    <Button size="sm" icon={<Send />} disabled={!canTake || !whisper.trim()} title={takeTitle} onClick={sendWhisper}>Send</Button>
                  </div>
                </Field>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function InfoTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="inset-box" style={{ padding: 10, minWidth: 0 }}><div className="xs muted">{label}</div><div className="small medium truncate mt-4" style={{ color: 'var(--ink)' }}>{value}</div>{sub && <div className="xs muted truncate">{sub}</div>}</div>;
}

/* ---------------- Exclusions ---------------- */
function Exclusions() {
  const app = useApp(); const nav = useNavigate();
  const can = app.can('compliance.manage') || app.can('calling.control');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState<Suppression['reason']>('Customer opt-out');
  const [touched, setTouched] = useState(false);
  const norm = phone.replace(/\s+/g, ' ').trim();
  const digits = norm.replace(/\D/g, '');
  const error = !norm ? 'Enter a phone number' : !/^\+?[\d\s]+$/.test(norm) || digits.length < 10 || digits.length > 13 ? 'Enter a valid UK number, e.g. +44 7700 900123' : app.suppressions.some((s) => s.phone.replace(/\D/g, '') === digits) ? 'This number is already suppressed' : '';
  const matchLead = digits.length >= 10 ? app.leads.find((l) => l.phone.replace(/\D/g, '') === digits) : undefined;
  const add = () => {
    setTouched(true);
    if (error || !can) return;
    app.addSuppression({ phone: norm, name: name.trim() || matchLead?.name || 'Unknown', reason, addedAt: new Date().toISOString(), addedBy: app.me.name });
    if (matchLead) app.updateLead(matchLead.id, { dnc: true });
    const liveCall = matchLead ? app.live.find((l) => l.leadId === matchLead.id) : undefined;
    if (liveCall) app.endLive(liveCall.id, 'Opted out');
    app.audit('Added suppression', norm.replace(/\d(?=[\d\s]{4})/g, '*'), 'Compliance');
    app.toast('Number suppressed', `${norm} will be excluded from all campaigns${liveCall ? ' — live call ended' : ''}.`);
    setPhone(''); setName(''); setTouched(false);
  };
  return (
    <Card title="Exclusions" sub="Quickly add a number to the do-not-call suppression list" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/compliance')}>Compliance</Button>}>
      <div className="grid g-main-side">
        <div>
          <div className="grid g-3" style={{ gap: 12 }}>
            <Field label="Phone number" required error={touched && error ? error : undefined} hint={matchLead ? `Matches lead ${matchLead.name} (${matchLead.id})` : undefined}>
              <input className={`input sm ${touched && error ? 'invalid' : ''}`} value={phone} disabled={!can} placeholder="+44 7700 900123" onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            </Field>
            <Field label="Name (optional)"><input className="input sm" value={name} disabled={!can} onChange={(e) => setName(e.target.value)} placeholder={matchLead?.name ?? 'Customer name'} /></Field>
            <Field label="Reason"><select className="select sm" value={reason} disabled={!can} onChange={(e) => setReason(e.target.value as Suppression['reason'])}>{SUPP_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
          </div>
          <div className="row mt-12">
            <Button size="sm" icon={<ShieldOff />} disabled={!can} title={can ? undefined : 'Requires compliance or calling control permissions'} onClick={add}>Add to suppression list</Button>
            <span className="xs muted">Applies immediately to queued and live calls. {fmtInt(app.suppressions.length)} numbers suppressed.</span>
          </div>
        </div>
        <div className="list">
          {app.suppressions.slice(0, 4).map((s) => (
            <div key={s.id} className="list-item" style={{ padding: '7px 0' }}>
              <AlertTriangle size={14} className="muted" />
              <div className="grow"><div className="small truncate" style={{ color: 'var(--ink)' }}>{s.name} <span className="mono muted">{s.phone}</span></div><div className="xs muted">{s.reason} · {s.addedBy} · {fmtRelative(s.addedAt)}</div></div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
