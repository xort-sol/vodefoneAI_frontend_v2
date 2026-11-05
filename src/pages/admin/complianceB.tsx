// Compliance tabs: Data access matrix, Data subject requests, Audit logs, User activity, Security controls.
import { useMemo, useState } from 'react';
import { Check, Download, KeyRound, Lock, LogOut, Monitor, Plus, ShieldAlert, Smartphone, X } from 'lucide-react';
import { useApp, type Permission } from '../../store/store';
import type { AuditEntry, DeletionRequest, Role } from '../../data/types';
import {
  Avatar, Badge, Button, Card, DataTable, EmptyState, FilterSelect, SearchInput, StatusBadge, Switch, useConfirm, type Column,
} from '../../components/ui';
import { fmtDate, fmtDateTime, fmtRelative, toCSV, downloadFile } from '../../lib/format';
import { DAY, NOW } from '../../data/seed';
import { ROLES, ROLE_TONE, SaveBar, roleHas, useDraft, useLocalStore } from './shared';

/* ---------------- Data access matrix ---------------- */
const DATA_TYPES: { label: string; desc: string; test: (r: Role) => boolean; perms: Permission[] }[] = [
  { label: 'View personal data', desc: 'Names, phone numbers, emails, addresses', test: (r) => roleHas(r, 'leads.edit') || roleHas(r, 'leads.export'), perms: ['leads.edit', 'leads.export'] },
  { label: 'Listen to recordings', desc: 'Call audio and full transcripts', test: (r) => roleHas(r, 'recordings.listen'), perms: ['recordings.listen'] },
  { label: 'Export personal data', desc: 'CSV/Excel exports containing PII', test: (r) => roleHas(r, 'leads.export'), perms: ['leads.export'] },
  { label: 'Export aggregated reports', desc: 'Analytics without personal identifiers', test: (r) => roleHas(r, 'reports.export'), perms: ['reports.export'] },
  { label: 'Delete personal data', desc: 'Permanent erasure of lead records', test: (r) => roleHas(r, 'leads.delete'), perms: ['leads.delete'] },
  { label: 'Manage suppression & DSRs', desc: 'Do-not-call list and data subject requests', test: (r) => roleHas(r, 'compliance.manage'), perms: ['compliance.manage'] },
  { label: 'View audit logs', desc: 'Security and data-access history', test: (r) => roleHas(r, 'compliance.manage') || roleHas(r, 'settings.manage'), perms: ['compliance.manage', 'settings.manage'] },
];
export function AccessTab() {
  const app = useApp();
  return (
    <>
      <Card flush title="Data access & export permissions" sub="Derived from role permissions. Change a person’s role in Sales team to change their access." actions={<Badge tone="outline"><Lock size={11} />Policy</Badge>}>
        <div className="table-wrap">
          <table className="table adm-matrix" style={{ minWidth: 880 }}>
            <thead><tr><th style={{ width: 280 }}>Data access</th>{ROLES.map((r) => <th key={r}>{r}<div className="xs muted mono">{app.team.filter((m) => m.role === r).length} users</div></th>)}</tr></thead>
            <tbody>
              {DATA_TYPES.map((d) => (
                <tr key={d.label}>
                  <td style={{ whiteSpace: 'normal' }}><div className="cell-primary">{d.label}</div><div className="cell-sub">{d.desc} · <span className="mono">{d.perms.join(' | ')}</span></div></td>
                  {ROLES.map((r) => <td key={r}>{d.test(r) ? <span className="adm-check"><Check size={13} /></span> : <span className="adm-dash">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid g-3 mt-16">
        <Card title="PII masking"><p className="small subtle">Phone numbers are masked in exports for roles without <span className="mono">leads.export</span>. Transcripts redact card numbers and dates of birth automatically.</p></Card>
        <Card title="Export watermarking"><p className="small subtle">Every export is logged with the user, time, IP and row count, and tagged with a unique export ID.</p></Card>
        <Card title="Recording access"><p className="small subtle">Each recording playback creates a “Viewed recording” audit event. Access outside the retention window is blocked.</p></Card>
      </div>
    </>
  );
}

/* ---------------- Data subject requests ---------------- */
export function DsrTab({ canEdit }: { canEdit: boolean }) {
  const app = useApp(); const confirm = useConfirm();
  const [status, setStatus] = useState(''); const [type, setType] = useState('');
  const rows = app.deletionRequests.filter((d) => (!status || d.status === status) && (!type || d.type === type));
  const move = async (d: DeletionRequest, next: DeletionRequest['status']) => {
    if (next === 'Rejected' && !(await confirm({ title: `Reject ${d.id}?`, desc: 'The data subject will be notified that the request has been rejected, with the reason recorded. This cannot be undone.', confirmLabel: 'Reject request', danger: true }))) return;
    if (next === 'Completed' && !(await confirm({ title: `Complete ${d.type.toLowerCase()} request?`, desc: d.type === 'Erasure' ? <>Personal data for <b>{d.name}</b> will be erased from leads, transcripts and recordings, and the lead archived. Suppression entries are retained to honour the opt-out.</> : <>Mark {d.id} for {d.name} as fulfilled and notify the data subject.</>, confirmLabel: 'Complete request', danger: d.type === 'Erasure' }))) return;
    app.updateDeletion(d.id, { status: next });
    if (next === 'Completed' && d.type === 'Erasure') app.updateLead(d.leadId, { archived: true, notes: [], aiSummary: '' });
    app.audit(`${next === 'In review' ? 'Started review of' : next === 'Approved' ? 'Approved' : next === 'Completed' ? 'Completed' : 'Rejected'} ${d.type.toLowerCase()} request`, d.id, 'Compliance');
    app.toast(`${d.id} ${next === 'In review' ? 'moved to review' : next.toLowerCase()}`, d.name);
  };
  const sla = (d: DeletionRequest) => {
    if (['Completed', 'Rejected'].includes(d.status)) return <Badge>Closed</Badge>;
    const days = Math.ceil((+new Date(d.dueBy) - NOW.getTime()) / DAY);
    return days < 0 ? <Badge tone="red" dot>Overdue {-days}d</Badge> : days <= 7 ? <Badge tone="amber" dot>{days}d left</Badge> : <Badge tone="green" dot>{days}d left</Badge>;
  };
  const cols: Column<DeletionRequest>[] = [
    { key: 'id', header: 'Request', sort: (d) => d.id, render: (d) => <span className="mono">{d.id}</span> },
    { key: 'name', header: 'Data subject', sort: (d) => d.name, render: (d) => <div><div className="cell-primary">{d.name}</div><a className="mono xs" href={`#/leads/${d.leadId}`} onClick={(e) => e.stopPropagation()}>{d.leadId}</a></div> },
    { key: 'type', header: 'Type', sort: (d) => d.type, render: (d) => <Badge tone="outline">{d.type}</Badge> },
    { key: 'req', header: 'Received', sort: (d) => +new Date(d.requestedAt), render: (d) => <span className="mono small">{fmtDate(d.requestedAt)}</span> },
    { key: 'due', header: 'Due (30 days)', sort: (d) => +new Date(d.dueBy), render: (d) => <div className="col" style={{ gap: 2, alignItems: 'flex-start' }}><span className="mono small">{fmtDate(d.dueBy)}</span>{sla(d)}</div> },
    { key: 'status', header: 'Status', sort: (d) => d.status, render: (d) => <StatusBadge status={d.status} /> },
    { key: 'act', header: 'Workflow', render: (d) => {
      const t = canEdit ? undefined : 'Requires compliance.manage permission';
      return (
        <div className="row" style={{ gap: 4 }}>
          {d.status === 'Received' && <Button size="xs" disabled={!canEdit} title={t} onClick={() => move(d, 'In review')}>Review</Button>}
          {d.status === 'In review' && <Button size="xs" disabled={!canEdit} title={t} onClick={() => move(d, 'Approved')}>Approve</Button>}
          {d.status === 'Approved' && <Button size="xs" variant="primary" disabled={!canEdit} title={t} onClick={() => move(d, 'Completed')}>Complete</Button>}
          {['Received', 'In review'].includes(d.status) && <Button size="xs" variant="danger" disabled={!canEdit} title={t} onClick={() => move(d, 'Rejected')}>Reject</Button>}
          {['Completed', 'Rejected'].includes(d.status) && <span className="xs muted">No action</span>}
        </div>
      );
    } },
  ];
  const steps: DeletionRequest['status'][] = ['Received', 'In review', 'Approved', 'Completed'];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
        {[...steps, 'Rejected' as const].map((s) => (
          <div key={s} className="card-link" style={{ cursor: 'pointer' }} onClick={() => setStatus(status === s ? '' : s)}>
            <div className="kpi-label">{s}</div><div className="kpi-value mt-4">{app.deletionRequests.filter((d) => d.status === s).length}</div>
          </div>
        ))}
      </div>
      <Card flush title="Data subject requests" sub="UK GDPR: respond within one calendar month of receipt">
        <DataTable rows={rows} columns={cols} rowKey={(d) => d.id} initialSort={{ key: 'due', dir: 'asc' }}
          toolbar={<>
            <FilterSelect label="Status" value={status} onChange={setStatus} options={[...steps, 'Rejected']} />
            <FilterSelect label="Type" value={type} onChange={setType} options={['Erasure', 'Access', 'Rectification']} />
            <span className="small muted" style={{ marginLeft: 'auto' }}>Workflow: Received → Review → Approve → Complete</span>
          </>} empty={<EmptyState title="No requests" />} />
      </Card>
    </div>
  );
}

/* ---------------- Audit logs ---------------- */
const CATS: AuditEntry['category'][] = ['Auth', 'Data', 'Campaign', 'Agent', 'Compliance', 'Settings', 'Export'];
export function AuditTab() {
  const app = useApp();
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [actor, setActor] = useState('');
  const actors = useMemo(() => [...new Set(app.auditLog.map((a) => a.actor))].sort(), [app.auditLog]);
  const rows = app.auditLog.filter((a) => (!cat || a.category === cat) && (!actor || a.actor === actor) && (!q || `${a.action} ${a.target} ${a.actor} ${a.id} ${a.ip}`.toLowerCase().includes(q.toLowerCase())));
  const cols: Column<AuditEntry>[] = [
    { key: 'at', header: 'Time', sort: (a) => +new Date(a.at), render: (a) => <span className="mono small" title={a.at}>{fmtDateTime(a.at)}</span> },
    { key: 'actor', header: 'Actor', sort: (a) => a.actor, render: (a) => <span className={a.actor === 'unknown' ? 'red small' : 'small cell-primary'}>{a.actor}</span> },
    { key: 'action', header: 'Action', sort: (a) => a.action, render: (a) => <span className="small">{a.action}</span> },
    { key: 'target', header: 'Target', render: (a) => <span className="small subtle truncate" style={{ maxWidth: 240, display: 'inline-block' }}>{a.target}</span> },
    { key: 'cat', header: 'Category', sort: (a) => a.category, render: (a) => <Badge tone={a.category === 'Compliance' ? 'purple' : a.category === 'Auth' ? 'blue' : a.category === 'Export' ? 'amber' : 'neutral'}>{a.category}</Badge> },
    { key: 'ip', header: 'IP', render: (a) => <span className="mono xs muted">{a.ip}</span> },
    { key: 'id', header: 'Event ID', render: (a) => <span className="mono xs muted">{a.id}</span> },
  ];
  const exp = () => { downloadFile('audit-log.csv', toCSV(rows.map((r) => ({ ...r })))); app.audit('Exported audit log', `${rows.length} events`, 'Export'); app.toast('Audit log exported', `${rows.length} events · CSV`); };
  return (
    <Card flush>
      <DataTable rows={rows} columns={cols} rowKey={(a) => a.id} initialSort={{ key: 'at', dir: 'desc' }} pageSize={25} dense
        toolbar={<>
          <SearchInput value={q} onChange={setQ} placeholder="Search action, target, IP…" />
          <FilterSelect label="Category" value={cat} onChange={setCat} options={CATS} />
          <FilterSelect label="Actor" value={actor} onChange={setActor} options={actors} />
          <span className="grow" />
          <span className="small muted">Immutable · retained 7 years</span>
          <Button size="sm" icon={<Download />} onClick={exp}>Export CSV</Button>
        </>} />
    </Card>
  );
}

/* ---------------- User activity ---------------- */
const DEVICES = ['Chrome · macOS', 'Edge · Windows 11', 'Safari · iPadOS', 'Chrome · Windows 11', 'Firefox · Ubuntu'];
export function ActivityTab({ canEdit }: { canEdit: boolean }) {
  const app = useApp(); const confirm = useConfirm();
  const [revoked, setRevoked] = useLocalStore<string[]>('revoked-sessions', []);
  const rows = app.team.map((m, i) => {
    const mins = (NOW.getTime() - +new Date(m.lastActive)) / 60000;
    const ev = app.auditLog.filter((a) => a.actor === m.name);
    const state = m.id === app.me.id ? 'Active' : revoked.includes(m.id) ? 'Revoked' : mins < 15 ? 'Active' : mins < 120 ? 'Idle' : 'Signed out';
    return { m, state, signins: ev.filter((a) => a.action === 'Signed in' && +new Date(a.at) > NOW.getTime() - 7 * DAY).length, events: ev.length, ip: ev[0]?.ip ?? '10.24.18.77', device: DEVICES[i % DEVICES.length], mobile: i % 5 === 2 };
  });
  type R = (typeof rows)[number];
  const revoke = async (r: R) => {
    if (!(await confirm({ title: `Sign out ${r.m.name} everywhere?`, desc: 'All active sessions and refresh tokens for this user are revoked. They will need to sign in again with SSO and MFA.', confirmLabel: 'Revoke sessions', danger: true }))) return;
    setRevoked([...revoked, r.m.id]); app.audit('Revoked sessions', r.m.name, 'Auth'); app.toast('Sessions revoked', r.m.name);
  };
  const cols: Column<R>[] = [
    { key: 'name', header: 'User', sort: (r) => r.m.name, render: (r) => <div className="row"><Avatar initials={r.m.initials} name={r.m.name} size="sm" /><div style={{ minWidth: 0, maxWidth: 200 }}><div className="cell-primary small">{r.m.name}{r.m.id === app.me.id && <span className="muted"> · this session</span>}</div><div className="cell-sub truncate">{r.m.email}</div></div></div> },
    { key: 'role', header: 'Role', sort: (r) => r.m.role, render: (r) => <Badge tone={ROLE_TONE[r.m.role]}>{r.m.role}</Badge> },
    { key: 'state', header: 'Session', sort: (r) => r.state, render: (r) => <Badge tone={r.state === 'Active' ? 'green' : r.state === 'Idle' ? 'amber' : r.state === 'Revoked' ? 'red' : 'neutral'} dot>{r.state}</Badge> },
    { key: 'last', header: 'Last active', sort: (r) => +new Date(r.m.lastActive), render: (r) => <span className="mono small">{fmtRelative(r.m.lastActive)}</span> },
    { key: 'device', header: 'Device', render: (r) => <span className="row small gap-4">{r.mobile ? <Smartphone size={13} className="muted" /> : <Monitor size={13} className="muted" />}{r.device}</span> },
    { key: 'ip', header: 'Last IP', render: (r) => <span className="mono xs">{r.ip}</span> },
    { key: 'signins', header: 'Sign-ins', align: 'right', sort: (r) => r.signins, render: (r) => <span className="mono">{r.signins}</span> },
    { key: 'x', header: '', render: (r) => <Button size="xs" variant="ghost" icon={<LogOut size={13} />} disabled={!canEdit || r.state === 'Revoked' || r.state === 'Signed out' || r.m.id === app.me.id} title={canEdit ? 'Revoke sessions' : 'Requires compliance.manage permission'} onClick={() => revoke(r)}>Revoke</Button> },
  ];
  const failed = app.auditLog.filter((a) => a.action === 'Failed sign-in attempt');
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div><div className="kpi-label">Active sessions</div><div className="kpi-value mt-4">{rows.filter((r) => r.state === 'Active').length}</div></div>
        <div><div className="kpi-label">Idle</div><div className="kpi-value mt-4">{rows.filter((r) => r.state === 'Idle').length}</div></div>
        <div><div className="kpi-label">Failed sign-ins</div><div className="kpi-value mt-4 orange">{failed.length}</div><div className="kpi-foot mt-4">last {fmtRelative(failed[0]?.at)}</div></div>
        <div><div className="kpi-label">Session timeout</div><div className="kpi-value mt-4">{app.settings.security.sessionTimeout} min</div></div>
      </div>
      <Card flush title="Sessions by user" sub="Derived from last activity and authentication events">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.m.id} initialSort={{ key: 'last', dir: 'desc' }} pageSize={14} />
      </Card>
    </div>
  );
}

/* ---------------- Security controls (shared with Settings) ---------------- */
export function SecurityForm({ canEdit, reason }: { canEdit: boolean; reason: string }) {
  const app = useApp();
  const [ips, setIps] = useLocalStore('ip-allowlist', ['10.24.0.0/16', '194.62.232.0/24']);
  const d = useDraft({ ...app.settings.security, ips });
  const [ip, setIp] = useState('');
  const ipOk = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(ip.trim()) && ip.trim().split('/')[0].split('.').every((n) => +n <= 255);
  const save = () => {
    if (d.draft.ipAllowlist && !d.draft.ips.length) { app.toast('Add at least one IP range before enabling the allowlist', undefined, 'error'); return; }
    const { ips: list, ...sec } = d.draft;
    app.updateSettings({ security: sec }); setIps(list);
    app.audit('Updated security controls', `SSO ${sec.sso ? 'on' : 'off'} · MFA ${sec.mfa ? 'on' : 'off'} · timeout ${sec.sessionTimeout}m`, 'Settings');
    app.toast('Security controls saved');
  };
  const rows: [string, string, keyof typeof d.draft][] = [
    ['Single sign-on (SAML / OIDC)', 'Require sign-in through Microsoft Entra ID. Password sign-in is disabled.', 'sso'],
    ['Enforce multi-factor authentication', 'All users must complete MFA at every sign-in.', 'mfa'],
    ['IP allowlist', 'Only allow console access from the ranges below.', 'ipAllowlist'],
  ];
  return (
    <>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        {rows.map(([t, desc, k]) => (
          <div key={k} className="setting-row">
            <div><div className="title">{t}</div><div className="desc">{desc}</div></div>
            <Switch on={!!d.draft[k]} onChange={(v) => d.patch({ [k]: v } as Partial<typeof d.draft>)} disabled={!canEdit} label={t} />
          </div>
        ))}
        {!d.draft.mfa && <div className="banner warn small" style={{ marginBottom: 8 }}><ShieldAlert />Disabling MFA lowers your compliance score and is not recommended for accounts with access to personal data.</div>}
        <div className="setting-row">
          <div><div className="title">Session timeout</div><div className="desc">Sign users out after this period of inactivity.</div></div>
          <select className="select sm" style={{ width: 140 }} value={d.draft.sessionTimeout} onChange={(e) => d.patch({ sessionTimeout: +e.target.value })}>{[15, 30, 60, 120, 480].map((n) => <option key={n} value={n}>{n < 60 ? `${n} minutes` : `${n / 60} hour${n > 60 ? 's' : ''}`}</option>)}</select>
        </div>
        <div style={{ padding: '14px 0' }}>
          <div className="title medium" style={{ color: 'var(--ink)', fontSize: 13.5 }}>Allowed IP ranges</div>
          <div className="row-wrap mt-8">
            {d.draft.ips.map((x) => <span key={x} className="tag mono">{x}{canEdit && <button type="button" className="btn ghost xs icon" style={{ width: 16, height: 16 }} onClick={() => d.patch({ ips: d.draft.ips.filter((y) => y !== x) })} aria-label={`Remove ${x}`}><X size={10} /></button>}</span>)}
            {!d.draft.ips.length && <span className="small muted">No ranges</span>}
          </div>
          {canEdit && <div className="row mt-8"><input className={`input sm soft mono ${ip && !ipOk ? 'invalid' : ''}`} style={{ maxWidth: 220 }} placeholder="e.g. 81.2.69.0/24" value={ip} onChange={(e) => setIp(e.target.value)} /><Button size="sm" icon={<Plus />} disabled={!ipOk || d.draft.ips.includes(ip.trim())} onClick={() => { d.patch({ ips: [...d.draft.ips, ip.trim()] }); setIp(''); }}>Add</Button></div>}
        </div>
      </fieldset>
      <SaveBar dirty={d.dirty} onSave={save} onReset={d.reset} disabled={!canEdit} reason={reason} />
    </>
  );
}
export function SecurityTab({ canEdit }: { canEdit: boolean }) {
  const app = useApp();
  const auth = app.auditLog.filter((a) => a.category === 'Auth').slice(0, 8);
  return (
    <div className="grid g-main-side">
      <Card title="Security controls" sub="Authentication and session policy for the console"><SecurityForm canEdit={canEdit} reason="Requires compliance.manage permission" /></Card>
      <div className="col" style={{ gap: 16 }}>
        <Card title="Posture">
          <div className="col" style={{ gap: 8 }}>
            {[['SSO enforced', app.settings.security.sso], ['MFA enforced', app.settings.security.mfa], ['IP allowlist', app.settings.security.ipAllowlist], ['Timeout ≤ 30 min', app.settings.security.sessionTimeout <= 30], ['Encryption at rest', true], ['Audit log immutable', true]].map(([l, ok]) => (
              <div key={l as string} className="row between small"><span>{l as string}</span>{ok ? <Badge tone="green" dot>On</Badge> : <Badge tone="amber" dot>Off</Badge>}</div>
            ))}
          </div>
        </Card>
        <Card title="Recent authentication events">
          <div className="list">
            {auth.map((a) => (
              <div key={a.id} className="list-item" style={{ padding: '7px 0' }}>
                {a.action.startsWith('Failed') ? <ShieldAlert size={14} className="red" /> : <KeyRound size={14} className="muted" />}
                <div className="grow"><div className="small" style={{ color: 'var(--ink)' }}>{a.action}</div><div className="xs muted">{a.actor} · <span className="mono">{a.ip}</span></div></div>
                <span className="mono xs muted">{fmtRelative(a.at)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
