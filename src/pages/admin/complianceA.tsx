// Compliance tabs: Overview, Consent records, Suppression, Opt-outs, Calling hours, Recording & retention.
import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CalendarX, ChevronRight, Clock, Download, FileUp, HeartHandshake, Mic, PhoneCall, PhoneOff, Plus, RefreshCw, Repeat, ShieldCheck, Trash2, UserCheck,
} from 'lucide-react';
import { useApp } from '../../store/store';
import type { Suppression } from '../../data/types';
import {
  Badge, Button, Card, DataTable, EmptyState, Field, FilterSelect, Modal, Progress, SearchInput, SimBadge, StatusBadge, Switch, useConfirm, type Column,
} from '../../components/ui';
import { fmtDate, fmtDateTime, fmtInt, fmtPct, fmtRelative, fmtTime, toCSV, downloadFile, WD } from '../../lib/format';
import { DAY, NOW } from '../../data/seed';
import { Chip, SaveBar, formatUKPhone, isUKPhone, useDraft, useLocalStore } from './shared';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LOCK = 'Requires compliance.manage permission';

export function windowOpenNow(h: { start: string; end: string; days: string[] }) {
  const t = fmtTime(NOW); return h.days.includes(WD[NOW.getDay()]) && t >= h.start && t < h.end;
}

export function useCompliance() {
  const app = useApp();
  return useMemo(() => {
    const queue = app.leads.filter((l) => l.campaignId && !l.archived);
    const counts = { consent: 0, suppression: 0, attempts: 0, status: 0, eligible: 0 };
    const suppressed = new Map(app.suppressions.map((s) => [s.phone, s]));
    let vulnerable = 0;
    for (const l of queue) {
      const e = app.eligibility(l);
      if (e.ok) counts.eligible++;
      for (const r of e.reasons) {
        if (r.startsWith('No valid')) counts.consent++;
        else if (r.startsWith('On do-not-call')) counts.suppression++;
        else if (r.startsWith('Attempt limit')) counts.attempts++;
        else counts.status++;
      }
      if (suppressed.get(l.phone)?.reason === 'Vulnerable customer') vulnerable++;
    }
    const open = windowOpenNow(app.settings.callingHours);
    const deferred = open ? 0 : counts.eligible;
    const optOutCalls = app.calls.filter((c) => c.outcome === 'Opted out');
    const optProcessed = optOutCalls.filter((c) => { const l = app.leadById.get(c.leadId); return l && (l.dnc || suppressed.has(l.phone)); }).length;
    const consentGranted = app.consents.filter((c) => c.status === 'Granted').length;
    const dsrOverdue = app.deletionRequests.filter((d) => !['Completed', 'Rejected'].includes(d.status) && new Date(d.dueBy) < NOW).length;
    const sec = app.settings.security;
    const secScore = ([sec.sso, sec.mfa, sec.ipAllowlist, sec.sessionTimeout <= 30].filter(Boolean).length / 4) * 100;
    const disc = app.settings.disclosure.toLowerCase();
    const parts = [
      { label: 'Consent coverage', v: app.consents.length ? (consentGranted / app.consents.length) * 100 : 100, tab: 'consent' },
      { label: 'Opt-outs processed', v: optOutCalls.length ? (optProcessed / optOutCalls.length) * 100 : 100, tab: 'optout' },
      { label: 'DSRs within SLA', v: app.deletionRequests.length ? ((app.deletionRequests.length - dsrOverdue) / app.deletionRequests.length) * 100 : 100, tab: 'dsr' },
      { label: 'Recording & AI disclosure', v: ((!app.settings.recordCalls || disc.includes('record') ? 50 : 0) + (disc.includes('ai') ? 50 : 0)), tab: 'recording' },
      { label: 'Security controls', v: secScore, tab: 'security' },
    ];
    const score = Math.round(parts.reduce((s, p) => s + p.v, 0) / parts.length);
    return { queue, counts, vulnerable, open, deferred, optOutCalls, optProcessed, parts, score, dsrOverdue, vulnerableNumbers: app.suppressions.filter((s) => s.reason === 'Vulnerable customer').length };
  }, [app]);
}

/* ---------------- Overview ---------------- */
export function OverviewTab({ go }: { go: (t: string) => void }) {
  const app = useApp(); const c = useCompliance();
  const h = app.settings.callingHours;
  const nodes = [
    { key: 'consent', icon: <UserCheck />, label: 'Marketing consent', desc: 'Valid voice consent on file', blocked: c.counts.consent, tab: 'consent' },
    { key: 'supp', icon: <PhoneOff />, label: 'Suppression / TPS', desc: 'Not on DNC or TPS list', blocked: c.counts.suppression, tab: 'suppression' },
    { key: 'hours', icon: <Clock />, label: 'Calling hours', desc: `${h.days.length} days · ${h.start}–${h.end}`, blocked: c.deferred, tab: 'hours', note: c.open ? 'Window open now' : 'Window closed — deferred' },
    { key: 'attempts', icon: <Repeat />, label: 'Attempt limits', desc: 'Below campaign max attempts', blocked: c.counts.attempts, tab: 'suppression' },
    { key: 'vuln', icon: <HeartHandshake />, label: 'Vulnerable flags', desc: `${c.vulnerableNumbers} flagged numbers`, blocked: c.vulnerable, tab: 'suppression' },
    { key: 'rec', icon: <Mic />, label: 'Recording disclosure', desc: app.settings.recordCalls ? 'Played in first 10 seconds' : 'Recording disabled', blocked: 0, tab: 'recording', note: 'Enforced in agent script' },
  ];
  const events = app.auditLog.filter((a) => a.category === 'Compliance').sort((x, y) => +new Date(y.at) - +new Date(x.at)).slice(0, 5);
  const scoreTone = c.score >= 90 ? 'var(--green)' : c.score >= 75 ? 'var(--amber)' : 'var(--red)';
  return (
    <div className="col" style={{ gap: 16 }}>
        <Card title="Pre-call check pipeline" sub="Every simulated call passes these checks in order before dialling. Counts are leads in active queues currently blocked by each check." actions={<SimBadge />}>
          <div className="adm-pipe">
            {nodes.map((n, i) => (
              <div key={n.key} style={{ display: 'contents' }}>
                {i > 0 && <span className="adm-pipe-arrow"><ChevronRight size={16} /></span>}
                <button type="button" className="adm-pipe-node" onClick={() => go(n.tab)}>
                  <div className="row between"><span className="adm-pipe-icon">{n.icon}</span><span className="mono xs muted">{String(i + 1).padStart(2, '0')}</span></div>
                  <div className="medium mt-8" style={{ color: 'var(--ink)', fontSize: 13 }}>{n.label}</div>
                  <div className="xs muted">{n.desc}</div>
                  {n.note && <div className="xs mt-4" style={{ color: 'var(--steel)' }}>{n.note}</div>}
                  <div className="row between" style={{ marginTop: 'auto', paddingTop: 10 }}>
                    <span className={`mono strong ${n.blocked ? 'orange' : 'green'}`} style={{ fontSize: 16 }}>{fmtInt(n.blocked)}</span>
                    <span className="xs muted">blocked</span>
                  </div>
                </button>
              </div>
            ))}
            <span className="adm-pipe-arrow"><ChevronRight size={16} /></span>
            <div className="adm-pipe-node end">
              <span className="adm-pipe-icon" style={{ background: 'var(--mint)', color: 'var(--green)' }}><PhoneCall /></span>
              <div className="medium mt-8" style={{ color: 'var(--ink)', fontSize: 13 }}>Call permitted</div>
              <div className="xs muted">Simulated dial only</div>
              <div className="row between" style={{ marginTop: 'auto', paddingTop: 10 }}><span className="mono strong green" style={{ fontSize: 16 }}>{fmtInt(c.counts.eligible - c.deferred)}</span><span className="xs muted">callable now</span></div>
            </div>
          </div>
          <div className="row-wrap small muted mt-12" style={{ gap: 16 }}>
            <span>{fmtInt(c.queue.length)} leads in campaign queues</span>
            <span>{fmtInt(c.counts.status)} excluded by lead status / converted</span>
            <span>A lead can fail more than one check.</span>
          </div>
        </Card>
      <div className="grid g-side-main">
        <Card title="Compliance score" sub="Weighted across five control areas">
          <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}><span className="display" style={{ fontSize: 44, lineHeight: 1, color: scoreTone }}>{c.score}</span><span className="muted small" style={{ paddingBottom: 6 }}>/ 100</span></div>
          <div className="col mt-16" style={{ gap: 10 }}>
            {c.parts.map((p) => (
              <div key={p.label} className="card-link" style={{ cursor: 'pointer' }} onClick={() => go(p.tab)}>
                <div className="row between small"><span>{p.label}</span><span className="mono">{fmtPct(p.v, 0)}</span></div>
                <div className="mt-4"><Progress value={p.v} color={p.v >= 90 ? 'var(--green)' : p.v >= 70 ? '#f59e0b' : 'var(--red)'} /></div>
              </div>
            ))}
          </div>
        </Card>
        <div className="col" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <MiniStat label="Active suppressions" v={fmtInt(app.suppressions.length)} sub={`${app.suppressions.filter((s) => s.reason === 'TPS registered').length} from TPS`} onClick={() => go('suppression')} />
        <MiniStat label="Opt-outs (all time)" v={fmtInt(c.optOutCalls.length)} sub={`${fmtPct(c.optOutCalls.length ? (c.optProcessed / c.optOutCalls.length) * 100 : 100, 0)} processed within SLA`} onClick={() => go('optout')} />
        <MiniStat label="Open data requests" v={fmtInt(app.deletionRequests.filter((d) => !['Completed', 'Rejected'].includes(d.status)).length)} sub={c.dsrOverdue ? `${c.dsrOverdue} overdue` : 'None overdue'} warn={!!c.dsrOverdue} onClick={() => go('dsr')} />
        <MiniStat label="Consent withdrawn" v={fmtInt(app.consents.filter((x) => x.status === 'Withdrawn').length)} sub={`of ${fmtInt(app.consents.length)} records`} onClick={() => go('consent')} />
      </div>
      <Card title="Recent compliance events" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => go('audit')}>Audit log</Button>}>
        <div className="list">
          {events.map((e) => (
            <div key={e.id} className="list-item">
              <ShieldCheck size={15} className="muted" />
              <div className="grow"><div className="small medium" style={{ color: 'var(--ink)' }}>{e.action} <span className="muted">· {e.target}</span></div><div className="xs muted">{e.actor}</div></div>
              <span className="mono xs muted">{fmtRelative(e.at)}</span>
            </div>
          ))}
          {!events.length && <div className="small muted">No compliance events yet.</div>}
        </div>
      </Card>
        </div>
      </div>
    </div>
  );
}
function MiniStat({ label, v, sub, onClick, warn }: { label: string; v: string; sub: string; onClick: () => void; warn?: boolean }) {
  return <div className="card kpi card-link" onClick={onClick}><div className="kpi-label">{label}</div><div className="kpi-value">{v}</div><div className={`kpi-foot ${warn ? 'orange' : ''}`}>{sub}</div></div>;
}

/* ---------------- Consent records ---------------- */
export function ConsentTab() {
  const app = useApp();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [channel, setChannel] = useState('');
  const rows = app.consents.filter((c) => (!status || c.status === status) && (!channel || c.channel === channel) && (!q || `${app.leadById.get(c.leadId)?.name ?? ''} ${c.id} ${c.leadId}`.toLowerCase().includes(q.toLowerCase())));
  type R = (typeof rows)[number];
  const cols: Column<R>[] = [
    { key: 'id', header: 'Record', sort: (r) => r.id, render: (r) => <span className="mono">{r.id}</span> },
    { key: 'lead', header: 'Data subject', sort: (r) => app.leadById.get(r.leadId)?.name ?? '', render: (r) => <div><div className="cell-primary">{app.leadById.get(r.leadId)?.name ?? '—'}</div><div className="mono xs muted">{r.leadId}</div></div> },
    { key: 'channel', header: 'Channel', sort: (r) => r.channel, render: (r) => <Badge tone="outline">{r.channel}</Badge> },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'source', header: 'Captured via', sort: (r) => r.source, render: (r) => <span className="small">{r.source}</span> },
    { key: 'at', header: 'Captured', sort: (r) => +new Date(r.capturedAt), render: (r) => <span className="mono small">{fmtDate(r.capturedAt)}</span> },
  ];
  const exp = () => { downloadFile('consent-records.csv', toCSV(rows.map((r) => ({ ...r, name: app.leadById.get(r.leadId)?.name })))); app.audit('Exported consent records', `${rows.length} rows`, 'Export'); app.toast('Consent records exported', `${rows.length} rows · CSV`); };
  const by = (s: string) => app.consents.filter((c) => c.status === s).length;
  return (
    <>
      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', marginBottom: 16 }}>
        <div><div className="kpi-label">Records</div><div className="kpi-value mt-4">{fmtInt(app.consents.length)}</div></div>
        <div><div className="kpi-label">Granted</div><div className="kpi-value mt-4 green">{fmtInt(by('Granted'))}</div></div>
        <div><div className="kpi-label">Withdrawn</div><div className="kpi-value mt-4">{fmtInt(by('Withdrawn'))}</div></div>
        <div><div className="kpi-label">Expired</div><div className="kpi-value mt-4">{fmtInt(by('Expired'))}</div></div>
      </div>
      <Card flush>
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: 'at', dir: 'desc' }}
          toolbar={<>
            <SearchInput value={q} onChange={setQ} placeholder="Search subject or record ID…" />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={['Granted', 'Withdrawn', 'Expired']} />
            <FilterSelect label="Channel" value={channel} onChange={setChannel} options={['Voice', 'SMS', 'Email']} />
            <span className="grow" />
            <Button size="sm" icon={<Download />} onClick={exp}>Export CSV</Button>
          </>} />
      </Card>
    </>
  );
}

/* ---------------- Suppression ---------------- */
const REASONS: Suppression['reason'][] = ['Customer opt-out', 'TPS registered', 'Complaint', 'Vulnerable customer', 'Legal hold', 'Deceased'];
export function SuppressionTab({ canEdit }: { canEdit: boolean }) {
  const app = useApp(); const confirm = useConfirm();
  const [q, setQ] = useState(''); const [reason, setReason] = useState(''); const [adding, setAdding] = useState(false);
  const [tps, setTps] = useLocalStore('tps-sync', { at: new Date(NOW.getTime() - 3.2 * 3600000).toISOString(), records: 24318452 });
  const [syncing, setSyncing] = useState(false);
  const rows = app.suppressions.filter((s) => (!reason || s.reason === reason) && (!q || `${s.phone} ${s.name} ${s.id}`.toLowerCase().includes(q.toLowerCase())));
  const remove = async (s: Suppression) => {
    if (!(await confirm({ title: 'Remove suppression entry?', desc: <>The number <span className="mono">{s.phone}</span> ({s.name}) will become callable again if consent is valid. This is recorded in the audit log.</>, confirmLabel: 'Remove entry', danger: true }))) return;
    app.removeSuppression(s.id); app.audit('Removed suppression', s.phone, 'Compliance'); app.toast('Suppression removed', s.phone);
  };
  const sync = () => {
    setSyncing(true);
    setTimeout(() => { setSyncing(false); setTps({ at: new Date().toISOString(), records: tps.records + Math.floor(Math.random() * 900) }); app.audit('Synced TPS register', 'Telephone Preference Service', 'Compliance'); app.toast('TPS sync complete (sandbox)', 'Register refreshed · no new matches in active queues'); }, 1200);
  };
  const cols: Column<Suppression>[] = [
    { key: 'phone', header: 'Number', sort: (s) => s.phone, render: (s) => <span className="mono">{s.phone}</span> },
    { key: 'name', header: 'Name', sort: (s) => s.name, render: (s) => <span className="cell-primary">{s.name}</span> },
    { key: 'reason', header: 'Reason', sort: (s) => s.reason, render: (s) => <Badge tone={s.reason === 'Vulnerable customer' ? 'purple' : s.reason === 'Complaint' || s.reason === 'Legal hold' ? 'red' : s.reason === 'TPS registered' ? 'blue' : 'neutral'}>{s.reason}</Badge> },
    { key: 'by', header: 'Added by', sort: (s) => s.addedBy, render: (s) => <span className="small">{s.addedBy}</span> },
    { key: 'at', header: 'Added', sort: (s) => +new Date(s.addedAt), render: (s) => <span className="mono small">{fmtDate(s.addedAt)}</span> },
    { key: 'x', header: '', render: (s) => <Button size="xs" variant="ghost" icon={<Trash2 size={13} />} disabled={!canEdit} title={canEdit ? 'Remove' : LOCK} onClick={(e) => { e.stopPropagation(); remove(s); }} aria-label={`Remove ${s.phone}`} /> },
  ];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g-3">
        <Card title="TPS register sync" sub="Telephone Preference Service" actions={<StatusBadge status="Active" />}>
          <div className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
            <dt>Last sync</dt><dd className="mono">{fmtRelative(tps.at)}</dd>
            <dt>Records</dt><dd className="mono">{fmtInt(tps.records)}</dd>
            <dt>Schedule</dt><dd>Every 24 hours · 02:00</dd>
          </div>
          <Button size="sm" className="mt-12" icon={<RefreshCw className={syncing ? 'spin' : ''} />} disabled={!canEdit || syncing} title={canEdit ? undefined : LOCK} onClick={sync}>{syncing ? 'Syncing…' : 'Sync now'}</Button>
        </Card>
        <Card title="Bulk upload" sub="CSV of numbers to suppress">
          <p className="small subtle">Upload a CSV with <span className="mono">phone,name,reason</span> columns. Files are validated and de-duplicated by the backend import service before entries are applied.</p>
          <Button size="sm" className="mt-12" icon={<FileUp />} disabled={!canEdit} title={canEdit ? undefined : LOCK} onClick={() => app.toast('Bulk upload queued', 'Backend integration point — file processing is not available in the demo', 'info')}>Upload CSV</Button>
        </Card>
        <Card title="Coverage" sub="Suppression reasons">
          <div className="col" style={{ gap: 6 }}>
            {REASONS.map((r) => { const n = app.suppressions.filter((s) => s.reason === r).length; return (
              <div key={r} className="row between small card-link" style={{ cursor: 'pointer' }} onClick={() => setReason(r)}><span>{r}</span><span className="mono">{n}</span></div>
            ); })}
          </div>
        </Card>
      </div>
      <Card flush>
        <DataTable rows={rows} columns={cols} rowKey={(s) => s.id} initialSort={{ key: 'at', dir: 'desc' }}
          toolbar={<>
            <SearchInput value={q} onChange={setQ} placeholder="Search number or name…" />
            <FilterSelect label="Reason" value={reason} onChange={setReason} options={REASONS} />
            <span className="grow" />
            <Button size="sm" variant="primary" icon={<Plus />} disabled={!canEdit} title={canEdit ? undefined : LOCK} onClick={() => setAdding(true)}>Add entry</Button>
          </>} />
      </Card>
      <AddSuppression open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
function AddSuppression({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const [f, setF] = useState({ phone: '', name: '', reason: 'Customer opt-out' as Suppression['reason'] });
  const [touched, setTouched] = useState(false);
  const formatted = isUKPhone(f.phone) ? formatUKPhone(f.phone) : '';
  const err = !isUKPhone(f.phone) ? 'Enter a valid UK number, e.g. 07700 900123 or +44 20 7946 0000' : app.suppressions.some((s) => s.phone === formatted) ? 'This number is already suppressed' : '';
  const close = () => { setF({ phone: '', name: '', reason: 'Customer opt-out' }); setTouched(false); onClose(); };
  const save = () => {
    setTouched(true); if (err) return;
    app.addSuppression({ phone: formatted, name: f.name.trim() || 'Unknown', reason: f.reason, addedAt: new Date().toISOString(), addedBy: app.me.name });
    const lead = app.leads.find((l) => l.phone === formatted);
    if (lead) app.updateLead(lead.id, { dnc: true });
    app.audit('Added suppression', formatted, 'Compliance');
    app.toast('Number suppressed', `${formatted}${lead ? ` · lead ${lead.id} blocked from calling` : ''}`);
    close();
  };
  return (
    <Modal open={open} onClose={close} title="Add to do-not-call list" desc="Suppressed numbers are blocked by the pre-call check across every campaign."
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={save} disabled={touched && !!err}>Add entry</Button></>}>
      <div className="col gap-16">
        <Field label="Phone number" required error={touched && err} hint={formatted ? `Will be stored as ${formatted}` : 'UK mobile or landline'}>
          <input className={`input mono ${touched && err ? 'invalid' : ''}`} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+44 7700 900123" autoFocus />
        </Field>
        <Field label="Name" hint="Optional"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Reason" required>
          <select className="select" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value as Suppression['reason'] })}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
      </div>
    </Modal>
  );
}

/* ---------------- Opt-outs ---------------- */
export function OptOutTab({ canEdit }: { canEdit: boolean }) {
  const app = useApp(); const c = useCompliance();
  const supp = new Map(app.suppressions.map((s) => [s.phone, s]));
  const rows = c.optOutCalls.map((call) => {
    const l = app.leadById.get(call.leadId); const s = l ? supp.get(l.phone) : undefined;
    const processed = !!l && (l.dnc || !!s);
    const due = new Date(new Date(call.startedAt).getTime() + DAY);
    return { call, l, s, processed, due };
  });
  type R = (typeof rows)[number];
  const process = (r: R) => {
    if (!r.l) return;
    app.addSuppression({ phone: r.l.phone, name: r.l.name, reason: 'Customer opt-out', addedAt: new Date().toISOString(), addedBy: app.me.name });
    app.updateLead(r.l.id, { dnc: true, consent: false, status: 'Do not call' });
    app.audit('Processed opt-out', r.l.phone, 'Compliance'); app.toast('Opt-out processed', `${r.l.name} added to suppression list`);
  };
  const cols: Column<R>[] = [
    { key: 'at', header: 'Opted out', sort: (r) => +new Date(r.call.startedAt), render: (r) => <span className="mono small">{fmtDateTime(r.call.startedAt)}</span> },
    { key: 'lead', header: 'Customer', sort: (r) => r.l?.name ?? '', render: (r) => <div><div className="cell-primary">{r.l?.name}</div><div className="mono xs muted">{r.l?.phone}</div></div> },
    { key: 'call', header: 'Source call', render: (r) => <a className="mono" href={`#/conversations/${r.call.id}`} onClick={(e) => e.stopPropagation()}>{r.call.id}</a> },
    { key: 'by', header: 'Processed by', render: (r) => <span className="small">{r.s?.addedBy ?? (r.processed ? 'AI agent (automatic)' : '—')}</span> },
    { key: 'sla', header: 'SLA (24h)', sort: (r) => (r.processed ? 1 : 0), render: (r) => r.processed ? <Badge tone="green" dot>Processed · &lt;1 min</Badge> : r.due < NOW ? <Badge tone="red" dot>Breached</Badge> : <Badge tone="amber" dot>Due {fmtRelative(r.due)}</Badge> },
    { key: 'x', header: '', render: (r) => !r.processed ? <Button size="xs" disabled={!canEdit} title={canEdit ? undefined : LOCK} onClick={() => process(r)}>Process now</Button> : null },
  ];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div><div className="kpi-label">Opt-outs recorded</div><div className="kpi-value mt-4">{fmtInt(rows.length)}</div><div className="kpi-foot mt-4">captured on AI calls</div></div>
        <div><div className="kpi-label">Last 7 days</div><div className="kpi-value mt-4">{fmtInt(rows.filter((r) => +new Date(r.call.startedAt) > NOW.getTime() - 7 * DAY).length)}</div></div>
        <div><div className="kpi-label">Processed within SLA</div><div className="kpi-value mt-4 green">{fmtPct(rows.length ? (rows.filter((r) => r.processed).length / rows.length) * 100 : 100, 0)}</div><div className="kpi-foot mt-4">target 100% within 24h</div></div>
        <div><div className="kpi-label">Median processing</div><div className="kpi-value mt-4">&lt;1 min</div><div className="kpi-foot mt-4">automatic on call end</div></div>
      </div>
      <div className="banner info"><ShieldCheck />When a customer asks not to be contacted, the AI agent confirms, ends the call politely and the number is added to the suppression list automatically before the next dial attempt.</div>
      <Card flush title="Recent opt-outs">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.call.id} initialSort={{ key: 'at', dir: 'desc' }} empty={<EmptyState title="No opt-outs recorded" />} />
      </Card>
    </div>
  );
}

/* ---------------- Calling hours ---------------- */
const BANK_HOLIDAYS = [
  { date: '2026-12-25', label: 'Christmas Day' }, { date: '2026-12-28', label: 'Boxing Day (substitute)' }, { date: '2027-01-01', label: 'New Year’s Day' },
  { date: '2027-03-26', label: 'Good Friday' }, { date: '2027-03-29', label: 'Easter Monday' }, { date: '2027-05-03', label: 'Early May bank holiday' },
];
export function HoursTab({ canEdit }: { canEdit: boolean }) {
  const app = useApp();
  const d = useDraft(app.settings.callingHours);
  const [holidays, setHolidays] = useLocalStore('blackouts', BANK_HOLIDAYS);
  const [nh, setNh] = useState({ date: '', label: '' });
  const err = d.draft.start >= d.draft.end ? 'End time must be after start time' : !d.draft.days.length ? 'Select at least one day' : d.draft.start < '08:00' || d.draft.end > '21:00' ? 'Ofcom guidance: keep outbound calls between 08:00 and 21:00' : '';
  const toggle = (day: string) => d.patch({ days: d.draft.days.includes(day) ? d.draft.days.filter((x) => x !== day) : DAYS.filter((x) => x === day || d.draft.days.includes(x)) });
  const save = () => {
    if (err) { app.toast('Cannot save calling hours', err, 'error'); return; }
    app.updateSettings({ callingHours: d.draft });
    app.audit('Updated calling hours', `${d.draft.days.join(', ')} ${d.draft.start}–${d.draft.end}`, 'Settings');
    app.toast('Calling hours saved', `${d.draft.start}–${d.draft.end} · ${d.draft.days.length} days`);
  };
  const addHoliday = () => {
    if (!nh.date) return;
    if (holidays.some((h) => h.date === nh.date)) { app.toast('Date already blacked out', undefined, 'error'); return; }
    setHolidays([...holidays, { date: nh.date, label: nh.label.trim() || 'Blackout' }].sort((a, b) => a.date.localeCompare(b.date)));
    app.audit('Added blackout date', nh.date, 'Settings'); app.toast('Blackout date added', fmtDate(nh.date)); setNh({ date: '', label: '' });
  };
  const sh = +d.draft.start.slice(0, 2); const eh = +d.draft.end.slice(0, 2) + (+d.draft.end.slice(3) > 0 ? 1 : 0);
  return (
    <div className="grid g-main-side">
      <Card title="Permitted calling window" sub="Applies to every campaign; campaign schedules can only narrow it." actions={windowOpenNow(app.settings.callingHours) ? <Badge tone="green" dot live>Open now</Badge> : <Badge dot>Closed now</Badge>}>
        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <Field label="Start time" error={!!err && err.startsWith('Ofcom') && d.draft.start < '08:00' && err}><input type="time" className="input" value={d.draft.start} onChange={(e) => d.patch({ start: e.target.value })} /></Field>
            <Field label="End time" error={err.startsWith('End') && err}><input type="time" className="input" value={d.draft.end} onChange={(e) => d.patch({ end: e.target.value })} /></Field>
          </div>
          <div className="field-label mt-16" style={{ marginBottom: 8 }}>Calling days</div>
          <div className="row-wrap">{DAYS.map((day) => <Chip key={day} on={d.draft.days.includes(day)} onClick={() => toggle(day)} disabled={!canEdit}>{day}</Chip>)}</div>
          {err && !err.startsWith('End') && <div className="field-error mt-8">{err}</div>}
          <div className="mt-16 inset-box" style={{ overflowX: 'auto' }}>
            <div className="adm-hours" style={{ minWidth: 520 }}>
              <span />{Array.from({ length: 24 }, (_, i) => <span key={i} className="mono" style={{ fontSize: 9.5, color: 'var(--fog)', textAlign: 'center', background: 'none', height: 'auto' }}>{i % 3 === 0 ? String(i).padStart(2, '0') : ''}</span>)}
              {DAYS.map((day) => (
                <div key={day} style={{ display: 'contents' }}>
                  <span className="xs muted" style={{ background: 'none', height: 'auto' }}>{day}</span>
                  {Array.from({ length: 24 }, (_, i) => <div key={i} className={`hcell ${d.draft.days.includes(day) && i >= sh && i < eh ? 'on' : ''}`} title={`${day} ${String(i).padStart(2, '0')}:00`} />)}
                </div>
              ))}
            </div>
          </div>
        </fieldset>
        <SaveBar dirty={d.dirty} onSave={save} onReset={d.reset} disabled={!canEdit} reason={LOCK} />
      </Card>
      <Card title="Holiday blackout dates" sub="No calls are placed on these dates">
        <div className="list">
          {holidays.map((h) => (
            <div key={h.date} className="list-item">
              <CalendarX size={15} className={new Date(h.date) < NOW ? 'muted' : 'orange'} />
              <div className="grow"><div className="small medium" style={{ color: 'var(--ink)' }}>{h.label}</div><div className="mono xs muted">{fmtDate(h.date)} · {WD[new Date(h.date).getDay()]}</div></div>
              <Button size="xs" variant="ghost" icon={<Trash2 size={13} />} disabled={!canEdit} title={canEdit ? 'Remove' : LOCK} aria-label="Remove date" onClick={() => { setHolidays(holidays.filter((x) => x.date !== h.date)); app.toast('Blackout date removed', fmtDate(h.date)); }} />
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="col mt-12" style={{ gap: 8 }}>
            <div className="row"><input type="date" className="input sm soft" value={nh.date} onChange={(e) => setNh({ ...nh, date: e.target.value })} aria-label="Date" /><input className="input sm soft" placeholder="Label" value={nh.label} onChange={(e) => setNh({ ...nh, label: e.target.value })} /></div>
            <Button size="sm" icon={<Plus />} disabled={!nh.date} onClick={addHoliday}>Add blackout date</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Recording & retention ---------------- */
export const REGIONS = ['UK South (eu-west-2, London)', 'EU West (eu-west-1, Ireland)', 'EU Central (eu-central-1, Frankfurt)'];
export function RecordingTab({ canEdit }: { canEdit: boolean }) {
  const app = useApp(); const s = app.settings;
  const [region, setRegion] = useLocalStore('storage-region', REGIONS[0]);
  const d = useDraft({ recordCalls: s.recordCalls, disclosure: s.disclosure, retentionDays: s.retentionDays, transcriptRetentionDays: s.transcriptRetentionDays, region });
  const err = d.draft.recordCalls && !/record/i.test(d.draft.disclosure) ? 'Disclosure must tell the customer the call is recorded' : !/\bAI\b/.test(d.draft.disclosure) ? 'Disclosure must state the caller is an AI assistant' : '';
  const save = () => {
    if (err) { app.toast('Cannot save', err, 'error'); return; }
    const { region: r, ...rest } = d.draft;
    app.updateSettings(rest); setRegion(r);
    app.audit('Updated recording & retention', `recordings ${rest.retentionDays}d · transcripts ${rest.transcriptRetentionDays}d`, 'Compliance');
    app.toast('Recording settings saved');
  };
  return (
    <div className="grid g-main-side">
      <Card title="Call recording & disclosure">
        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="setting-row" style={{ paddingTop: 0 }}>
            <div><div className="title">Record calls</div><div className="desc">Store audio for quality, training and dispute resolution.</div></div>
            <Switch on={d.draft.recordCalls} onChange={(v) => d.patch({ recordCalls: v })} disabled={!canEdit} label="Record calls" />
          </div>
          <Field label="Opening disclosure" error={err} hint={`${d.draft.disclosure.length} characters · spoken by the AI agent within the first 10 seconds of every call`} className="mt-12">
            <textarea className={`textarea ${err ? 'invalid' : ''}`} value={d.draft.disclosure} onChange={(e) => d.patch({ disclosure: e.target.value })} rows={3} />
          </Field>
          <div className="form-grid mt-16">
            <Field label="Recording retention">
              <select className="select" value={d.draft.retentionDays} onChange={(e) => d.patch({ retentionDays: +e.target.value })}>{[30, 60, 90, 180, 365].map((n) => <option key={n} value={n}>{n} days</option>)}</select>
            </Field>
            <Field label="Transcript retention">
              <select className="select" value={d.draft.transcriptRetentionDays} onChange={(e) => d.patch({ transcriptRetentionDays: +e.target.value })}>{[90, 180, 365, 730, 1095].map((n) => <option key={n} value={n}>{n} days{n >= 365 ? ` (${n / 365} yr${n > 365 ? 's' : ''})` : ''}</option>)}</select>
            </Field>
            <Field label="Storage region" hint="Recordings and transcripts never leave this region" className="span-all">
              <select className="select" value={d.draft.region} onChange={(e) => d.patch({ region: e.target.value })}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
            </Field>
          </div>
        </fieldset>
        <SaveBar dirty={d.dirty} onSave={save} onReset={d.reset} disabled={!canEdit} reason={LOCK} />
      </Card>
      <div className="col" style={{ gap: 16 }}>
        <Card title="Storage" sub="Simulated object storage">
          <div className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
            <dt>Provider</dt><dd>{app.settings.integrations['Amazon S3 Recordings']?.connected ? 'Amazon S3' : 'Not connected'}</dd>
            <dt>Bucket</dt><dd className="mono">{app.settings.integrations['Amazon S3 Recordings']?.account ?? '—'}</dd>
            <dt>Region</dt><dd>{region}</dd>
            <dt>Encryption</dt><dd>AES-256 at rest · TLS 1.3</dd>
            <dt>Recordings</dt><dd className="mono">{fmtInt(app.calls.filter((c) => c.recording === 'Available').length)} available</dd>
          </div>
        </Card>
        <Card title="Automatic deletion">
          <p className="small subtle">Recordings older than <b>{s.retentionDays} days</b> and transcripts older than <b>{s.transcriptRetentionDays} days</b> are purged nightly at 03:00. Legal holds on the suppression list pause deletion for the affected subject.</p>
          <div className="row small mt-12"><AlertTriangle size={14} className="orange" /><span>{fmtInt(app.calls.filter((c) => c.recording === 'Expired').length)} recordings already expired</span></div>
        </Card>
      </div>
    </div>
  );
}
