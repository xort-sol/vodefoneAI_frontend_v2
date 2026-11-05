import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, Check, Download, RotateCcw, Terminal, X } from 'lucide-react';
import { useApp } from '../store/store';
import {
  Avatar, Badge, Button, DataTable, FilterSelect, PageHeader, SearchInput, Segmented, SimBadge, StatusBadge, Tabs, type Column, type Tone,
} from '../components/ui';
import { DateRangePicker, useRangeState } from '../components/DateRange';
import { inRange, summarize } from '../lib/metrics';
import { downloadFile, fmtCompact, fmtDur, fmtGBP, fmtInt, fmtPct, toCSV } from '../lib/format';
import type { Call, CallOutcome } from '../data/types';
import { hash, setNavList } from './conversations/state';

const OUTCOMES: CallOutcome[] = ['Qualified', 'Interested', 'Callback requested', 'Transferred to human', 'Not interested', 'Opted out', 'No answer', 'Voicemail', 'Busy', 'Failed'];

type Level = 'INFO' | 'WARN' | 'ERROR';
interface LogEvent { id: string; at: number; level: Level; service: string; event: string; message: string; callId: string }
const LEVEL_TONE: Record<Level, Tone> = { INFO: 'neutral', WARN: 'amber', ERROR: 'red' };

const pad = (n: number, l = 2) => String(n).padStart(l, '0');
const fmtStamp = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`; };
const maskPhone = (p?: string) => (p ? p.replace(/(\+44 7\d{3}) \d{3} (\d{3})/, '$1 ••• $2') : '—');

/** Deterministic technical event log synthesised from a call record (simulated telephony/AI pipeline). */
function eventsFor(c: Call, phone: string | undefined, leadId: string): LogEvent[] {
  const h = hash(c.id); const t0 = new Date(c.startedAt).getTime();
  const out: LogEvent[] = [];
  let seq = 0;
  const add = (dt: number, level: Level, service: string, event: string, message: string) => out.push({ id: `${c.id}-${seq++}`, at: t0 + dt, level, service, event, message, callId: c.id });
  const trunk = ['twilio-sbx-lon1', 'twilio-sbx-dub1', 'twilio-sbx-fra1'][h % 3];
  add(-(320 + (h % 400)), 'INFO', 'dialer', 'compliance.check', `consent=granted suppression=clear window=ok lead=${leadId}`);
  add(0, 'INFO', 'dialer', 'dial.attempt', `INVITE to=${maskPhone(phone)} trunk=${trunk} campaign=${c.campaignId} agent=${c.agentId}`);
  add(180 + (h % 90), 'INFO', 'sip', 'sip.provisional', '180 Ringing');
  const ringEnd = c.connected ? 4000 + (h % 9000) : c.duration * 1000;
  switch (c.outcome) {
    case 'No answer': add(ringEnd, 'WARN', 'sip', 'sip.final', '480 Temporarily Unavailable · no answer timeout 28s'); break;
    case 'Busy': add(ringEnd, 'WARN', 'sip', 'sip.final', '486 Busy Here'); break;
    case 'Voicemail': add(ringEnd, 'INFO', 'sip', 'sip.final', '200 OK'); add(ringEnd + 1400, 'INFO', 'amd', 'amd.detected', 'result=machine confidence=0.94 · policy: hang up, no message'); break;
    case 'Failed': {
      const r = c.failureReason ?? '';
      const msg = r.includes('503') ? '503 Service Unavailable · carrier rejected' : r.includes('format') ? '484 Address Incomplete · E.164 validation failed' : r.includes('timeout') ? '408 Request Timeout · no response from carrier' : 'RTP timeout · media stream dropped after 3.0s';
      add(ringEnd || 900, 'ERROR', r.includes('Media') ? 'media' : 'sip', r.includes('Media') ? 'media.rtp_timeout' : 'sip.final', msg);
      add((ringEnd || 900) + 220, 'INFO', 'scheduler', 'retry.scheduled', `attempt will be retried per campaign rules`);
      break;
    }
    default: add(ringEnd, 'INFO', 'sip', 'sip.final', '200 OK · media established codec=OPUS/48000');
  }
  const end = ringEnd + (c.connected ? c.duration * 1000 : 0);
  add(end + 50, 'INFO', 'sip', 'sip.bye', `BYE · billable=${c.duration}s cost=£${c.cost.toFixed(3)}`);
  if (c.connected) {
    if (c.recording !== 'Not recorded') add(end + 900, 'INFO', 'recording', 'recording.stored', `s3://vf-recordings/eu-west-2/${c.id}.opus · ${(c.duration * 6.1).toFixed(0)} KB`);
    if (h % 23 === 0) add(end + 2100, 'WARN', 'transcribe', 'transcription.retry', 'job timed out after 30s · retry 1/3');
    add(end + 2600 + (h % 3000), c.recording === 'Processing' ? 'WARN' : 'INFO', 'transcribe', c.recording === 'Processing' ? 'transcription.pending' : 'transcription.completed', c.recording === 'Processing' ? 'job queued · backlog 14 jobs' : `job=tx_${(h % 0xffffff).toString(16)} words=${Math.round(c.duration * 2.3)} wer_est=0.06`);
    add(end + 6000, 'INFO', 'ai', 'summary.generated', `outcome=${c.outcome.replace(/ /g, '_').toLowerCase()} score=${c.score} sentiment=${c.sentiment.toLowerCase()}`);
  }
  if (h % 31 === 0) add(end + 7200, 'WARN', 'webhook', 'webhook.retry', 'POST call.completed → salesforce · 502 Bad Gateway · retry 2/5 in 30s');
  add(end + 7600 + (h % 900), 'INFO', 'webhook', 'webhook.delivered', `POST call.completed → salesforce · 200 OK · ${80 + (h % 260)}ms`);
  if (h % 97 === 0) add(end + 8400, 'ERROR', 'crm', 'crm.writeback_failed', `Lead ${leadId} · FIELD_CUSTOM_VALIDATION_EXCEPTION · queued for manual review`);
  else add(end + 8400, 'INFO', 'crm', 'crm.writeback', `Lead ${leadId} · Task + Activity upserted · last_outcome=${c.outcome}`);
  return out;
}

export default function CallHistory() {
  const app = useApp(); const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<'calls' | 'logs'>(sp.get('tab') === 'logs' ? 'logs' : 'calls');
  const rs = useRangeState('30d');
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [campaign, setCampaign] = useState(sp.get('campaign') ?? '');
  const [agent, setAgent] = useState(sp.get('agent') ?? '');
  const [outcome, setOutcome] = useState(sp.get('outcome') ?? '');
  const [conn, setConn] = useState<'all' | 'connected' | 'unsuccessful'>((sp.get('connected') as 'connected') ?? 'all');
  const [level, setLevel] = useState<'All' | Level>('All');
  const [service, setService] = useState('');
  const [logQ, setLogQ] = useState('');

  // react to links such as /history?outcome=Failed while already on the page
  useEffect(() => { const o = sp.get('outcome'); if (o !== null && o !== outcome) setOutcome(o); }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const n = new URLSearchParams();
    if (tab === 'logs') n.set('tab', 'logs'); if (outcome) n.set('outcome', outcome); if (campaign) n.set('campaign', campaign); if (agent) n.set('agent', agent);
    if (conn !== 'all') n.set('connected', conn); if (q) n.set('q', q);
    if (n.toString() !== sp.toString()) setSp(n, { replace: true });
  }, [tab, outcome, campaign, agent, conn, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoped = useMemo(() => app.calls.filter((c) => inRange(c.startedAt, rs.range) && (!campaign || c.campaignId === campaign) && (!agent || c.agentId === agent)), [app.calls, rs.range, campaign, agent]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s/g, '');
    return scoped.filter((c) => {
      if (outcome && c.outcome !== outcome) return false;
      if (conn === 'connected' && !c.connected) return false;
      if (conn === 'unsuccessful' && c.connected) return false;
      if (s) {
        const l = app.leadById.get(c.leadId);
        if (!`${c.id}${l?.phone ?? ''}${l?.name ?? ''}`.toLowerCase().replace(/\s/g, '').includes(s)) return false;
      }
      return true;
    });
  }, [scoped, outcome, conn, q, app.leadById]);
  useEffect(() => { setNavList(rows.map((r) => r.id)); }, [rows]);
  const sum = useMemo(() => summarize(rows), [rows]);

  const events = useMemo(() => {
    if (tab !== 'logs') return [] as LogEvent[];
    const all: LogEvent[] = [];
    for (const c of rows) { const l = app.leadById.get(c.leadId); all.push(...eventsFor(c, l?.phone, c.leadId)); }
    return all.sort((a, b) => b.at - a.at);
  }, [rows, tab, app.leadById]);
  const levelCounts = useMemo(() => ({ INFO: events.filter((e) => e.level === 'INFO').length, WARN: events.filter((e) => e.level === 'WARN').length, ERROR: events.filter((e) => e.level === 'ERROR').length }), [events]);
  const services = useMemo(() => [...new Set(events.map((e) => e.service))].sort(), [events]);
  const logRows = useMemo(() => {
    const s = logQ.trim().toLowerCase();
    return events.filter((e) => (level === 'All' || e.level === level) && (!service || e.service === service) && (!s || `${e.event} ${e.message} ${e.callId}`.toLowerCase().includes(s)));
  }, [events, level, service, logQ]);

  const active = [campaign, agent, outcome, q].filter(Boolean).length + (conn !== 'all' ? 1 : 0);
  const reset = () => { setQ(''); setCampaign(''); setAgent(''); setOutcome(''); setConn('all'); };
  const canExport = app.can('reports.export');

  const exportCSV = () => {
    if (tab === 'logs') {
      downloadFile(`system-logs-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(logRows.map((e) => ({ timestamp: new Date(e.at).toISOString(), level: e.level, service: e.service, event: e.event, message: e.message, call_id: e.callId }))));
      app.audit('Exported system logs (CSV)', `${logRows.length} events`, 'Export');
      app.toast('System logs exported', `${fmtInt(logRows.length)} events downloaded as CSV`);
      return;
    }
    downloadFile(`call-history-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows.map((c) => {
      const l = app.leadById.get(c.leadId);
      return {
        call_id: c.id, started_at: c.startedAt, customer: l?.name, phone: l?.phone, campaign: app.campaignById.get(c.campaignId)?.name, agent: app.agentById.get(c.agentId)?.name,
        outcome: c.outcome, connected: c.connected ? 'yes' : 'no', duration_s: c.duration, cost_gbp: c.cost.toFixed(3), recording: c.recording, failure_reason: c.failureReason ?? '', simulated: 'yes',
      };
    })));
    app.audit('Exported call history (CSV)', `${rows.length} calls`, 'Export');
    app.toast('Call history exported', `${fmtInt(rows.length)} calls downloaded as CSV`);
  };

  const columns: Column<Call>[] = [
    { key: 'id', header: 'Call ID', sort: (c) => c.id, render: (c) => <Link to={`/conversations/${c.id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{c.id}</Link> },
    { key: 'time', header: 'Time', sort: (c) => c.startedAt, render: (c) => <span className="mono small nowrap">{fmtStamp(new Date(c.startedAt).getTime()).slice(0, 16)}</span> },
    {
      key: 'customer', header: 'Customer', sort: (c) => app.leadById.get(c.leadId)?.name ?? '', render: (c) => {
        const l = app.leadById.get(c.leadId);
        return <div><div className="cell-primary nowrap">{l?.name ?? '—'}</div><div className="cell-sub mono nowrap">{l?.phone}</div></div>;
      },
    },
    { key: 'campaign', header: 'Campaign', sort: (c) => app.campaignById.get(c.campaignId)?.name ?? '', render: (c) => <span className="small" style={{ display: 'block', minWidth: 120 }}>{app.campaignById.get(c.campaignId)?.name}</span> },
    { key: 'agent', header: 'Agent', sort: (c) => app.agentById.get(c.agentId)?.name ?? '', render: (c) => { const a = app.agentById.get(c.agentId); return <span className="row gap-4 small nowrap"><Avatar initials={a?.initials} color={a?.color} size="sm" agent />{a?.name}</span>; } },
    { key: 'outcome', header: 'Outcome', sort: (c) => c.outcome, render: (c) => <span className="nowrap"><StatusBadge status={c.outcome} /></span> },
    { key: 'conn', header: 'Connected', sort: (c) => (c.connected ? 1 : 0), render: (c) => c.connected ? <Check size={15} className="green" aria-label="Connected" /> : <X size={15} className="muted" aria-label="Not connected" /> },
    { key: 'dur', header: 'Duration', align: 'right', sort: (c) => c.duration, render: (c) => <span className="mono small">{fmtDur(c.duration)}</span> },
    { key: 'cost', header: 'Cost', align: 'right', sort: (c) => c.cost, render: (c) => <span className="mono small">{fmtGBP(c.cost, 3)}</span> },
    { key: 'rec', header: 'Recording', sort: (c) => c.recording, render: (c) => <span className="nowrap"><StatusBadge status={c.recording} dot={false} /></span> },
    { key: 'fail', header: 'Failure reason', sort: (c) => c.failureReason ?? '', render: (c) => c.failureReason ? <span className="small red" style={{ display: 'block', minWidth: 130 }}>{c.failureReason}</span> : <span className="muted">—</span> },
  ];

  const logColumns: Column<LogEvent>[] = [
    { key: 'at', header: 'Timestamp', sort: (e) => e.at, render: (e) => <span className="mono xs nowrap">{fmtStamp(e.at)}</span> },
    { key: 'level', header: 'Level', sort: (e) => e.level, render: (e) => <Badge tone={LEVEL_TONE[e.level]} className="mono">{e.level}</Badge> },
    { key: 'service', header: 'Service', sort: (e) => e.service, render: (e) => <span className="mono xs subtle">{e.service}</span> },
    { key: 'event', header: 'Event', sort: (e) => e.event, render: (e) => <span className="mono xs strong nowrap">{e.event}</span> },
    { key: 'msg', header: 'Message', render: (e) => <span className="mono xs" style={{ color: e.level === 'ERROR' ? 'var(--red)' : 'var(--slate)', display: 'block', minWidth: 260, wordBreak: 'break-word' }}>{e.message}</span> },
    { key: 'call', header: 'Call', sort: (e) => e.callId, render: (e) => <Link to={`/conversations/${e.callId}`} className="mono xs" onClick={(ev) => ev.stopPropagation()}>{e.callId}</Link> },
  ];

  const filters = (
    <>
      <FilterSelect label="Campaign" value={campaign} onChange={setCampaign} options={app.campaigns.map((c) => ({ value: c.id, label: c.name }))} />
      <FilterSelect label="Agent" value={agent} onChange={setAgent} options={app.agents.map((a) => ({ value: a.id, label: a.name }))} />
      <FilterSelect label="Outcome" value={outcome} onChange={setOutcome} options={OUTCOMES} />
      <Segmented value={conn} onChange={setConn} options={[{ value: 'all', label: 'All' }, { value: 'connected', label: 'Connected' }, { value: 'unsuccessful', label: 'Unsuccessful' }]} />
    </>
  );

  return (
    <>
      <PageHeader
        title="Call history & logs"
        desc="Every outbound attempt the AI agents made — connected or not — with the technical event trail behind it."
        eyebrow={<SimBadge />}
        actions={<>
          <DateRangePicker state={rs} exclude={['12m']} />
          <Button size="sm" icon={<Download />} disabled={!canExport} title={!canExport ? 'Your role does not include report exports' : undefined} onClick={exportCSV}>Export CSV</Button>
        </>}
      />

      <div className="banner info" style={{ marginBottom: 16 }}>
        <Archive />
        <span>Detailed call logs are retained for <strong>{app.settings.retentionDays} days</strong> under the workspace retention policy. Older history is kept as daily aggregates — see <Link to="/analytics?tab=calls">Call analytics</Link>.</span>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', marginBottom: 16 }}>
        <Stat label="Attempts" value={fmtInt(sum.total)} foot={rs.range.label.toLowerCase()} />
        <Stat label="Connected" value={fmtInt(sum.connected)} foot={`${fmtPct(sum.connectRate)} connect rate`} />
        <Stat label="Unsuccessful" value={fmtInt(sum.failed)} foot={<button className="btn link small" onClick={() => { setOutcome('Failed'); setTab('calls'); }}>{fmtInt(rows.filter((c) => c.outcome === 'Failed').length)} technical failures</button>} />
        <Stat label="Talk time" value={`${fmtCompact(sum.minutes)} min`} foot={`avg ${fmtDur(sum.avgDuration)} connected`} />
        <Stat label="Cost" value={fmtGBP(sum.cost, 2)} foot={`${fmtGBP(sum.total ? sum.cost / sum.total : 0, 3)} per attempt`} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'calls', label: 'Call log', count: rows.length }, { value: 'logs', label: 'System logs', icon: <Terminal size={14} /> }]} />

      <div className="card flush mt-16">
        {tab === 'calls' ? (
          <DataTable
            rows={rows} columns={columns} rowKey={(c) => c.id} dense
            onRowClick={(c) => nav(`/conversations/${c.id}`)}
            initialSort={{ key: 'time', dir: 'desc' }}
            toolbar={<>
              <SearchInput value={q} onChange={setQ} placeholder="Call ID, phone or name…" width={220} />
              {filters}
              {active > 0 && <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={reset}>Reset ({active})</Button>}
            </>}
          />
        ) : (
          <DataTable
            rows={logRows} columns={logColumns} rowKey={(e) => e.id} dense pageSize={25}
            initialSort={{ key: 'at', dir: 'desc' }}
            toolbar={<>
              <Segmented value={level} onChange={setLevel} options={[
                { value: 'All', label: `All ${fmtCompact(events.length)}` },
                { value: 'INFO', label: `Info ${fmtCompact(levelCounts.INFO)}` },
                { value: 'WARN', label: <span className="row gap-4">Warn <span className="mono" style={{ color: 'var(--amber)' }}>{levelCounts.WARN}</span></span> },
                { value: 'ERROR', label: <span className="row gap-4">Error <span className="mono red">{levelCounts.ERROR}</span></span> },
              ]} />
              <FilterSelect label="Service" value={service} onChange={setService} options={services} />
              <FilterSelect label="Campaign" value={campaign} onChange={setCampaign} options={app.campaigns.map((c) => ({ value: c.id, label: c.name }))} />
              <FilterSelect label="Agent" value={agent} onChange={setAgent} options={app.agents.map((a) => ({ value: a.id, label: a.name }))} />
              <SearchInput value={logQ} onChange={setLogQ} placeholder="Search events, SIP codes, IDs…" width={240} />
              <span className="xs muted">Simulated pipeline events for {fmtInt(rows.length)} calls{active > 0 ? ' (call filters applied)' : ''}</span>
            </>}
            empty={<div className="small muted" style={{ padding: 32, textAlign: 'center' }}>No events match these filters.</div>}
          />
        )}
      </div>
    </>
  );
}

function Stat({ label, value, foot }: { label: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mt-4">{value}</div>
      <div className="kpi-foot mt-4"><span className="truncate">{foot}</span></div>
    </div>
  );
}
