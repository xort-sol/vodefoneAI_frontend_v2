import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Download, Info, Lock, Mail, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useApp } from '../store/store';
import type { Role, TeamMember } from '../data/types';
import {
  Avatar, Badge, Button, Card, DataTable, Field, FilterSelect, Modal, PageHeader, Progress, SearchInput, Tabs, type Column,
} from '../components/ui';
import { fmtGBP, fmtInt, fmtPct, fmtRelative, toCSV, downloadFile } from '../lib/format';
import { initialsOf, NOW } from '../data/seed';
import {
  AdminStyles, MEMBER_STATUSES, PERMISSION_META, ROLES, ROLE_DESC, ROLE_TONE, TEAMS, roleHas, useMemberStats,
} from './admin/shared';

type Tab = 'members' | 'teams' | 'roles';
const STATUS_COLOR: Record<TeamMember['status'], string> = { Available: 'var(--green)', Busy: 'var(--tangerine)', Away: '#f59e0b', Offline: 'var(--silver)' };

export default function Team() {
  const app = useApp(); const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (['members', 'teams', 'roles'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'members') as Tab;
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n, { replace: true }); };
  const [q, setQ] = useState(''); const [role, setRole] = useState(''); const [team, setTeam] = useState(sp.get('team') ?? ''); const [status, setStatus] = useState('');
  const [invite, setInvite] = useState(sp.get('invite') === '1');
  const canManage = app.can('team.manage');
  const stats = useMemberStats();

  useEffect(() => { if (sp.get('invite') === '1') { setInvite(true); const n = new URLSearchParams(sp); n.delete('invite'); setSp(n, { replace: true }); } }, [sp, setSp]);

  const rows = useMemo(() => app.team.map((m) => ({ m, s: stats(m) })), [app.team, stats]);
  const filtered = rows.filter(({ m }) =>
    (!role || m.role === role) && (!team || m.team === team) && (!status || m.status === status) &&
    (!q || `${m.name} ${m.email}`.toLowerCase().includes(q.toLowerCase())));

  const reps = rows.filter((r) => r.m.role === 'Sales Representative');
  const totalCap = reps.reduce((s, r) => s + r.m.capacity, 0);
  const totalLoad = reps.reduce((s, r) => s + r.s.load, 0);
  const totalConv = rows.reduce((s, r) => s + r.s.conversions, 0);
  const totalRev = rows.reduce((s, r) => s + r.s.revenue, 0);
  const available = app.team.filter((m) => m.status === 'Available').length;

  const setMemberStatus = (m: TeamMember, st: TeamMember['status']) => {
    app.updateMember(m.id, { status: st });
    app.audit('Changed availability', `${m.name} → ${st}`, 'Settings');
    app.toast('Availability updated', `${m.name} is now ${st.toLowerCase()}`);
  };
  const canEditStatus = (m: TeamMember) => canManage || m.id === app.me.id;

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Member', sort: (r) => r.m.name, render: ({ m }) => (
      <div className="row" style={{ gap: 10 }}>
        <span style={{ position: 'relative' }}><Avatar initials={m.initials} name={m.name} /><i style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: 9, background: STATUS_COLOR[m.status], border: '2px solid #fff' }} /></span>
        <div style={{ minWidth: 0, maxWidth: 190 }}><div className="cell-primary truncate">{m.name}{m.id === app.me.id && <span className="muted small"> (you)</span>}</div><div className="cell-sub truncate">{m.email}</div></div>
      </div>
    ) },
    { key: 'role', header: 'Role · team', sort: (r) => r.m.role, render: ({ m }) => <div className="col" style={{ gap: 3, alignItems: 'flex-start' }}><Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge><span className="cell-sub">{m.team}</span></div> },
    { key: 'products', header: 'Products', render: ({ m }) => m.products.length ? (
      <span className="row gap-4" title={m.products.map((p) => app.productById.get(p)?.name).join(', ')}>
        <span className="tag truncate" style={{ maxWidth: 104, display: 'inline-block', lineHeight: '20px' }}>{app.productById.get(m.products[0])?.name}</span>
        {m.products.length > 1 && <span className="mono xs muted">+{m.products.length - 1}</span>}
      </span>
    ) : <span className="muted small">—</span> },
    { key: 'status', header: 'Availability', sort: (r) => r.m.status, render: ({ m }) => (
      <select className="select sm soft" style={{ width: 108, height: 28, fontSize: 12.5 }} value={m.status} disabled={!canEditStatus(m)}
        title={canEditStatus(m) ? 'Change availability' : 'Requires team.manage permission'}
        onClick={(e) => e.stopPropagation()} onChange={(e) => setMemberStatus(m, e.target.value as TeamMember['status'])} aria-label={`Availability for ${m.name}`}>
        {MEMBER_STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
    ) },
    { key: 'capacity', header: 'Capacity', sort: (r) => r.s.utilisation, render: ({ m, s }) => m.capacity ? (
      <div style={{ width: 96 }} title={s.utilisation > 100 ? 'Over capacity — new handovers will be routed to teammates' : undefined}>
        <div className="row between xs"><span className="mono tnum">{s.load}/{m.capacity}</span><span className={`mono ${s.utilisation > 100 ? 'orange' : 'muted'}`}>{Math.round(s.utilisation)}%</span></div>
        <div className="mt-4"><Progress value={s.utilisation} color={s.utilisation > 90 ? 'var(--tangerine)' : undefined} /></div>
      </div>
    ) : <span className="muted small">n/a</span> },
    { key: 'conv', header: 'Conv.', align: 'right', sort: (r) => r.s.conversions, render: ({ s }) => <span className="mono tnum">{fmtInt(s.conversions)}</span> },
    { key: 'rev', header: 'Revenue', align: 'right', sort: (r) => r.s.revenue, render: ({ s }) => <span className="mono tnum">{s.revenue ? fmtGBP(s.revenue) : '—'}</span> },
    { key: 'resp', header: 'Resp.', align: 'right', sort: (r) => r.m.responseHrs, render: ({ m }) => <span className="mono tnum">{m.responseHrs.toFixed(1)}h</span> },
    { key: 'last', header: 'Active', sort: (r) => +new Date(r.m.lastActive), render: ({ m }) => <span className="mono small muted">{fmtRelative(m.lastActive)}</span> },
  ];

  const exportCSV = () => {
    downloadFile('sales-team.csv', toCSV(filtered.map(({ m, s }) => ({ id: m.id, name: m.name, email: m.email, role: m.role, team: m.team, status: m.status, assigned: s.assigned.length, capacity: m.capacity, conversions: s.conversions, revenue: s.revenue, avg_response_hrs: m.responseHrs, last_active: m.lastActive }))));
    app.audit('Exported team list', `${filtered.length} members`, 'Export');
    app.toast('Team exported', `${filtered.length} members · CSV`);
  };

  return (
    <>
      <AdminStyles />
      <PageHeader
        title="Sales team"
        desc="People who receive AI-qualified leads, their availability, workload and results — plus the roles that control what each person can do."
        actions={<>
          <Button size="sm" icon={<Download />} onClick={exportCSV}>Export</Button>
          <Button size="sm" variant="primary" icon={<UserPlus />} disabled={!canManage} title={canManage ? undefined : 'Requires team.manage permission'} onClick={() => setInvite(true)}>Invite member</Button>
        </>}
      />

      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', marginBottom: 20 }}>
        <div><div className="kpi-label">Members</div><div className="kpi-value mt-4">{app.team.length}</div><div className="kpi-foot mt-4">{reps.length} sales representatives</div></div>
        <div><div className="kpi-label">Available now</div><div className="kpi-value mt-4">{available}</div><div className="kpi-foot mt-4">{app.team.filter((m) => m.status === 'Busy').length} busy · {app.team.filter((m) => m.status === 'Offline').length} offline</div></div>
        <div><div className="kpi-label">Rep capacity used</div><div className="kpi-value mt-4">{fmtPct(totalCap ? (totalLoad / totalCap) * 100 : 0, 0)}</div><div className="kpi-foot mt-4"><span className="mono">{fmtInt(totalLoad)}/{fmtInt(totalCap)}</span>{totalLoad > totalCap && <Badge tone="orange">Over capacity</Badge>}</div></div>
        <div><div className="kpi-label">Conversions</div><div className="kpi-value mt-4">{fmtInt(totalConv)}</div><div className="kpi-foot mt-4">from assigned leads</div></div>
        <div><div className="kpi-label">Contract revenue</div><div className="kpi-value mt-4">{fmtGBP(totalRev)}</div><div className="kpi-foot mt-4">monthly × term, converted</div></div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'members', label: 'Members', count: app.team.length, icon: <Users size={14} /> },
        { value: 'teams', label: 'Teams', count: TEAMS.length },
        { value: 'roles', label: 'Roles & permissions', icon: <ShieldCheck size={14} /> },
      ]} />

      {tab === 'members' && (
        <Card flush>
          <DataTable
            rows={filtered} columns={columns} rowKey={(r) => r.m.id} onRowClick={(r) => nav(`/team/${r.m.id}`)}
            initialSort={{ key: 'conv', dir: 'desc' }} pageSize={12}
            toolbar={<>
              <SearchInput value={q} onChange={setQ} placeholder="Search name or email…" />
              <FilterSelect label="Role" value={role} onChange={setRole} options={ROLES} />
              <FilterSelect label="Team" value={team} onChange={setTeam} options={TEAMS} />
              <FilterSelect label="Status" value={status} onChange={setStatus} options={MEMBER_STATUSES} />
              {(q || role || team || status) && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setRole(''); setTeam(''); setStatus(''); }}>Clear</Button>}
              <span className="small muted" style={{ marginLeft: 'auto' }}>{canManage ? 'Availability can be changed inline' : <span className="row gap-4"><Lock size={12} />You can only change your own availability</span>}</span>
            </>}
          />
        </Card>
      )}

      {tab === 'teams' && <TeamsTab rows={rows} onOpen={(t) => { setTeam(t); setTab('members'); }} />}
      {tab === 'roles' && <RolesTab />}

      <InviteModal open={invite} onClose={() => setInvite(false)} />
    </>
  );
}

function TeamsTab({ rows, onOpen }: { rows: { m: TeamMember; s: ReturnType<ReturnType<typeof useMemberStats>> }[]; onOpen: (t: string) => void }) {
  const nav = useNavigate();
  return (
    <div className="grid g-3">
      {TEAMS.map((t) => {
        const members = rows.filter((r) => r.m.team === t);
        const assigned = members.reduce((s, r) => s + r.s.assigned.length, 0);
        const conv = members.reduce((s, r) => s + r.s.conversions, 0);
        const rev = members.reduce((s, r) => s + r.s.revenue, 0);
        const open = members.reduce((s, r) => s + r.s.load, 0);
        const cap = members.reduce((s, r) => s + r.m.capacity, 0);
        const lead = members.find((r) => ['Sales Manager', 'Supervisor', 'Administrator', 'Super Admin'].includes(r.m.role));
        return (
          <Card key={t} title={t} sub={`${members.length} members${lead ? ` · led by ${lead.m.name}` : ''}`} actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => onOpen(t)}>Members</Button>}>
            <div className="row" style={{ gap: 0, marginBottom: 14 }}>
              {members.slice(0, 8).map((r, i) => <span key={r.m.id} style={{ marginLeft: i ? -6 : 0, cursor: 'pointer' }} onClick={() => nav(`/team/${r.m.id}`)}><Avatar initials={r.m.initials} name={`${r.m.name} · ${r.m.status}`} /></span>)}
              <span className="small muted" style={{ marginLeft: 10 }}>{members.filter((r) => r.m.status === 'Available').length} available</span>
            </div>
            <div className="grid g-3 adm-two" style={{ gap: 8 }}>
              <div className="inset-box"><div className="xs muted">Assigned leads</div><div className="strong mono">{fmtInt(assigned)}</div></div>
              <div className="inset-box"><div className="xs muted">Conversions</div><div className="strong mono">{fmtInt(conv)}</div></div>
              <div className="inset-box"><div className="xs muted">Conv. rate</div><div className="strong mono">{assigned ? fmtPct((conv / assigned) * 100) : '—'}</div></div>
            </div>
            {cap > 0 ? (
              <div className="mt-12">
                <div className="row between small"><span className="muted">Capacity</span><span className="mono">{open} / {cap}</span></div>
                <div className="mt-4"><Progress value={(open / cap) * 100} /></div>
              </div>
            ) : <div className="small muted mt-12">No lead capacity — management and support roles.</div>}
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="list">
              {members.slice(0, 4).map((r) => (
                <div key={r.m.id} className="list-item clickable" style={{ padding: '6px 0' }} onClick={() => nav(`/team/${r.m.id}`)}>
                  <div className="grow"><div className="cell-primary small truncate">{r.m.name}</div><div className="cell-sub">{r.m.role}</div></div>
                  <span className="mono small">{r.s.conversions ? `${r.s.conversions} conv.` : '—'}</span>
                </div>
              ))}
            </div>
            <div className="row between small mt-8"><span className="muted">Revenue</span><span className="mono strong">{rev ? fmtGBP(rev) : '—'}</span></div>
          </Card>
        );
      })}
    </div>
  );
}

function RolesTab() {
  const app = useApp();
  const groups = [...new Set(PERMISSION_META.map((p) => p.group))];
  return (
    <>
      <div className="grid g-3" style={{ marginBottom: 16 }}>
        {ROLES.map((r) => {
          const n = app.team.filter((m) => m.role === r).length;
          return (
            <Card key={r}>
              <div className="row between"><Badge tone={ROLE_TONE[r]}>{r}</Badge><span className="mono xs muted">{n} {n === 1 ? 'member' : 'members'}</span></div>
              <p className="small subtle mt-8">{ROLE_DESC[r]}</p>
              <div className="row between mt-12 small"><span className="muted">Permissions</span><span className="mono">{PERMISSION_META.filter((p) => roleHas(r, p.key)).length} / {PERMISSION_META.length}</span></div>
              <div className="mt-4"><Progress value={(PERMISSION_META.filter((p) => roleHas(r, p.key)).length / PERMISSION_META.length) * 100} /></div>
              {app.role === r && <div className="xs blue mt-8">Your current role</div>}
            </Card>
          );
        })}
      </div>
      <Card flush title="Permission matrix" sub="Roles are fixed policy templates. Assign a different role to change what a person can do." actions={<Badge tone="outline"><Lock size={11} />Read-only</Badge>}>
        <div className="table-wrap">
          <table className="table adm-matrix" style={{ minWidth: 900 }}>
            <thead><tr><th style={{ width: 300 }}>Permission</th>{ROLES.map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g} group={g} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="banner info mt-16"><Info />Permission checks are enforced in the interface for this demonstration; a production deployment enforces the same policy server-side on every API request.</div>
    </>
  );
}
function GroupRows({ group }: { group: string }) {
  return (
    <>
      <tr><td colSpan={ROLES.length + 1} style={{ background: 'var(--mist)', paddingTop: 6, paddingBottom: 6 }}><span className="label">{group}</span></td></tr>
      {PERMISSION_META.filter((p) => p.group === group).map((p) => (
        <tr key={p.key}>
          <td style={{ whiteSpace: 'normal' }}><div className="cell-primary">{p.label} <span className="mono xs muted">{p.key}</span></div><div className="cell-sub">{p.desc}</div></td>
          {ROLES.map((r) => <td key={r}>{roleHas(r, p.key) ? <span className="adm-check" aria-label="Allowed"><Check size={13} /></span> : <span className="adm-dash" aria-label="Not allowed">—</span>}</td>)}
        </tr>
      ))}
    </>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const blank = { name: '', email: '', role: 'Sales Representative' as Role, team: 'Consumer Sales' as TeamMember['team'], capacity: 30, products: [] as string[] };
  const [f, setF] = useState(blank);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setF(blank); setTouched(false); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const errs = {
    name: f.name.trim().length < 2 ? 'Enter the person’s full name' : '',
    email: !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email address' : app.team.some((m) => m.email.toLowerCase() === f.email.trim().toLowerCase()) ? 'A member with this email already exists' : '',
    capacity: f.role === 'Sales Representative' && (f.capacity < 1 || f.capacity > 200) ? 'Capacity must be between 1 and 200' : '',
  };
  const valid = !errs.name && !errs.email && !errs.capacity;
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const name = f.name.trim();
    app.addMember({
      name, initials: initialsOf(name), email: f.email.trim().toLowerCase(), role: f.role, team: f.team,
      products: f.role === 'Sales Representative' ? f.products : [], status: 'Offline',
      capacity: f.role === 'Sales Representative' ? f.capacity : 0, conversions: 0, revenue: 0, responseHrs: 0,
      joined: NOW.toISOString(), lastActive: NOW.toISOString(),
    });
    app.audit('Invited user', `${f.email.trim()} as ${f.role}`, 'Auth');
    app.toast('Invitation sent', `${name} will receive a sign-in link at ${f.email.trim()} (simulated)`);
    onClose();
  };
  const toggleProduct = (id: string) => setF({ ...f, products: f.products.includes(id) ? f.products.filter((p) => p !== id) : [...f.products, id] });
  return (
    <Modal open={open} onClose={onClose} title="Invite team member" desc="They’ll receive a single sign-on invitation. Permissions follow the selected role." size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Mail />} onClick={submit} disabled={touched && !valid}>Send invitation</Button></>}>
      <div className="form-grid">
        <Field label="Full name" required error={touched && errs.name}><input className={`input ${touched && errs.name ? 'invalid' : ''}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Jordan Ellis" autoFocus /></Field>
        <Field label="Work email" required error={touched && errs.email} hint="Must match the identity provider account"><input className={`input ${touched && errs.email ? 'invalid' : ''}`} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@vodafone-demo.co.uk" /></Field>
        <Field label="Role" required hint={ROLE_DESC[f.role]}>
          <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} disabled={r === 'Super Admin' && app.role !== 'Super Admin'}>{r}</option>)}
          </select>
        </Field>
        <Field label="Team" required>
          <select className="select" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value as TeamMember['team'] })}>{TEAMS.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        {f.role === 'Sales Representative' && <>
          <Field label="Lead capacity" error={touched && errs.capacity} hint="Maximum open leads assigned at once"><input className="input" type="number" min={1} max={200} value={f.capacity} onChange={(e) => setF({ ...f, capacity: +e.target.value })} /></Field>
          <div />
          <div className="span-all">
            <div className="field-label" style={{ marginBottom: 8 }}>Product specialisms <span className="muted small">— used by product-based assignment</span></div>
            <div className="row-wrap">
              {app.products.map((p) => <button key={p.id} type="button" className={`adm-chip ${f.products.includes(p.id) ? 'on' : ''}`} onClick={() => toggleProduct(p.id)}>{f.products.includes(p.id) && <Check />}{p.name}</button>)}
            </div>
          </div>
        </>}
      </div>
      <div className="inset-box mt-16 small subtle">
        <div className="strong small" style={{ marginBottom: 6 }}>This role can</div>
        <div className="row-wrap">{PERMISSION_META.filter((p) => roleHas(f.role, p.key)).map((p) => <span key={p.key} className="tag">{p.label}</span>)}</div>
      </div>
    </Modal>
  );
}
