import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  AlertTriangle, ArrowLeft, BadgeCheck, CalendarDays, CheckCircle2, Clock, Copy, Lock, Mail, MessageSquare, Percent, PoundSterling, ShieldCheck, Target, UserX, Users,
} from 'lucide-react';
import { useApp } from '../store/store';
import type { Role, TeamMember } from '../data/types';
import {
  Avatar, Badge, Button, Card, ChartTip, CHART, DataTable, EmptyState, Field, KpiCard, KV, Legend, ScoreBar, Segmented, StatusBadge, type Column,
} from '../components/ui';
import { fmtDate, fmtDateShort, fmtDateTime, fmtGBP, fmtInt, fmtPct, fmtRelative, fmtTime } from '../lib/format';
import { DAY, NOW, startOfDay } from '../data/seed';
import { AdminStyles, MEMBER_STATUSES, PERMISSION_META, ROLES, ROLE_DESC, ROLE_TONE, TEAMS, roleHas, useMemberStats } from './admin/shared';
import type { Lead } from '../data/types';

export default function MemberProfile() {
  const { id } = useParams(); const app = useApp(); const nav = useNavigate();
  const m = id ? app.memberById.get(id) : undefined;
  const stats = useMemberStats();
  if (!m) return <EmptyState icon={<UserX size={18} />} title="Team member not found" desc={`No member with ID “${id}”.`} action={<Button onClick={() => nav('/team')} icon={<ArrowLeft />}>Back to team</Button>} />;
  return <Profile m={m} s={stats(m)} />;
}

function Profile({ m, s }: { m: TeamMember; s: ReturnType<ReturnType<typeof useMemberStats>> }) {
  const app = useApp(); const nav = useNavigate();
  const canManage = app.can('team.manage');
  const isMe = app.me.id === m.id;
  const [showAll, setShowAll] = useState(false);
  const [taskView, setTaskView] = useState<'open' | 'overdue' | 'done'>('open');

  const weekly = useMemo(() => {
    const start = startOfDay(NOW); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * 11);
    return Array.from({ length: 12 }, (_, i) => {
      const from = start.getTime() + i * 7 * DAY; const to = from + 7 * DAY;
      const inW = (iso: string | null) => !!iso && +new Date(iso) >= from && +new Date(iso) < to;
      return {
        label: fmtDateShort(new Date(from)),
        conversions: s.converted.filter((l) => inW(l.lastCallAt)).length,
        handovers: s.assigned.filter((l) => inW(l.lastCallAt) && ['Hot', 'Warm', 'Converted', 'Callback requested'].includes(l.status)).length,
      };
    });
  }, [s.converted, s.assigned]);

  const onTime = s.tasks.filter((t) => t.done).length;
  const tasksView = s.tasks.filter((t) => taskView === 'done' ? t.done : taskView === 'overdue' ? !t.done && new Date(t.due) < NOW : !t.done)
    .sort((a, b) => +new Date(a.due) - +new Date(b.due));
  const upcoming = s.appts.filter((a) => new Date(a.start) >= NOW).sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const past = s.appts.filter((a) => new Date(a.start) < NOW).sort((a, b) => +new Date(b.start) - +new Date(a.start));
  const apptDone = past.filter((a) => a.status === 'Completed').length;

  const activity = useMemo(() => {
    const audit = app.auditLog.filter((a) => a.actor === m.name).map((a) => ({ id: a.id, at: a.at, kind: a.category, title: a.action, detail: a.target, link: undefined as string | undefined }));
    const notes = app.leads.flatMap((l) => l.notes.filter((n) => n.author === m.name).map((n) => ({ id: n.id + l.id, at: n.at, kind: 'Note', title: `Added note on ${l.name}`, detail: n.text, link: `/leads/${l.id}` })));
    return [...audit, ...notes].sort((a, b) => +new Date(b.at) - +new Date(a.at))
  }, [app.auditLog, app.leads, m.name]);

  const leadCols: Column<Lead>[] = [
    { key: 'name', header: 'Lead', sort: (l) => l.name, render: (l) => <div><div className="cell-primary">{l.name}</div><div className="mono xs muted">{l.id}</div></div> },
    { key: 'status', header: 'Status', sort: (l) => l.status, render: (l) => <StatusBadge status={l.status} /> },
    { key: 'score', header: 'Score', sort: (l) => l.score, render: (l) => <ScoreBar value={l.score} /> },
    { key: 'product', header: 'Product', render: (l) => <span className="small truncate" style={{ maxWidth: 160, display: 'inline-block' }}>{app.productById.get(l.productInterest)?.name}</span> },
    { key: 'fu', header: 'Next follow-up', sort: (l) => (l.nextFollowUp ? +new Date(l.nextFollowUp) : Infinity), render: (l) => l.nextFollowUp ? <span className={`mono small ${new Date(l.nextFollowUp) < NOW && l.status !== 'Converted' ? 'red' : ''}`}>{fmtDateTime(l.nextFollowUp)}</span> : <span className="muted">—</span> },
    { key: 'last', header: 'Last call', sort: (l) => (l.lastCallAt ? +new Date(l.lastCallAt) : 0), render: (l) => <span className="mono small muted">{fmtRelative(l.lastCallAt)}</span> },
  ];

  return (
    <>
      <AdminStyles />
      <div className="row" style={{ marginBottom: 16 }}><Button size="sm" variant="ghost" icon={<ArrowLeft />} onClick={() => nav('/team')}>Sales team</Button></div>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div className="row grow" style={{ gap: 16, flexWrap: 'wrap' }}>
          <Avatar initials={m.initials} name={m.name} size="xl" />
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title" style={{ fontSize: 30 }}>{m.name}</h1>
            <div className="row-wrap mt-8">
              <Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge>
              <span className="small subtle">{m.team}</span>
              <StatusBadge status={m.status} />
              <span className="mono xs muted">{m.id}</span>
              {isMe && <Badge tone="blue">You</Badge>}
            </div>
          </div>
        </div>
        <div className="row-wrap">
          <Button size="sm" icon={<Copy />} onClick={() => { navigator.clipboard?.writeText(m.email).catch(() => undefined); app.toast('Email copied', m.email); }}>Copy email</Button>
          <a className="btn sm" href={`mailto:${m.email}`}><Mail />Email</a>
          {m.role === 'Sales Representative' && <Button size="sm" variant="primary" icon={<Users />} onClick={() => nav(`/qualified?rep=${m.id}`)}>View handovers</Button>}
        </div>
      </div>

      <div className="grid g-main-side">
        <div className="col" style={{ gap: 16 }}>
          <div className="grid g-3 adm-two">
            <KpiCard label="Assigned leads" icon={<Target size={13} />} value={fmtInt(s.assigned.length)} prevLabel={m.capacity ? `${s.load} open of ${m.capacity} capacity` : 'No capacity set'} />
            <KpiCard label="Follow-ups done" icon={<CheckCircle2 size={13} />} value={fmtInt(s.done)} prevLabel={`${s.tasks.length - s.done} still open`} />
            <KpiCard label="Overdue" icon={<AlertTriangle size={13} />} value={<span className={s.overdue ? 'orange' : ''}>{fmtInt(s.overdue)}</span>} prevLabel="tasks past due date" />
            <KpiCard label="Conversions" icon={<BadgeCheck size={13} />} value={fmtInt(s.conversions)} prevLabel="lifetime, assigned leads" />
            <KpiCard label="Conversion rate" icon={<Percent size={13} />} value={fmtPct(s.convRate)} prevLabel="converted ÷ assigned" />
            <KpiCard label="Revenue" icon={<PoundSterling size={13} />} value={fmtGBP(s.revenue)} prevLabel="contract value, converted" />
          </div>

          <Card title="Weekly conversions" sub="Last 12 weeks · by week of final call">
            <Legend items={[{ label: 'Conversions', color: CHART.green }, { label: 'AI handovers received', color: CHART.ink }]} />
            <div style={{ height: 220 }} className="mt-12">
              {s.assigned.length ? (
                <ResponsiveContainer>
                  <ComposedChart data={weekly} margin={{ left: -20, right: 4, top: 8 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                    <Tooltip content={<ChartTip labelFmt={(l) => `w/c ${l}`} />} cursor={{ fill: '#F5F5F5' }} />
                    <Bar dataKey="conversions" name="Conversions" fill={CHART.green} radius={[3, 3, 0, 0]} barSize={14} />
                    <Line type="monotone" dataKey="handovers" name="AI handovers received" stroke={CHART.ink} strokeWidth={1.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <EmptyState title="No lead assignments" desc="This member does not work AI-qualified leads." />}
            </div>
          </Card>

          <Card flush title="Lead assignments" sub={`${s.assigned.length} leads · click to open`}>
            <DataTable rows={s.assigned} columns={leadCols} rowKey={(l) => l.id} onRowClick={(l) => nav(`/leads/${l.id}`)} pageSize={8} initialSort={{ key: 'score', dir: 'desc' }}
              empty={<EmptyState title="No leads assigned" desc="Leads are assigned automatically based on the lead assignment rules." />} />
          </Card>

          <div className="grid g-2">
            <Card title="Follow-up performance" actions={<Segmented value={taskView} onChange={setTaskView} options={[{ value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'done', label: 'Done' }]} />}>
              <div className="grid g-3 adm-two" style={{ gap: 8 }}>
                <div className="inset-box"><div className="xs muted">Completion</div><div className="strong mono">{s.tasks.length ? fmtPct((onTime / s.tasks.length) * 100, 0) : '—'}</div></div>
                <div className="inset-box"><div className="xs muted">Avg response</div><div className="strong mono">{m.responseHrs ? `${m.responseHrs.toFixed(1)}h` : '—'}</div></div>
                <div className="inset-box"><div className="xs muted">Overdue</div><div className={`strong mono ${s.overdue ? 'orange' : ''}`}>{s.overdue}</div></div>
              </div>
              <div className="list mt-8">
                {tasksView.slice(0, 6).map((t) => {
                  const l = app.leadById.get(t.leadId); const late = !t.done && new Date(t.due) < NOW;
                  return (
                    <div key={t.id} className="list-item clickable" onClick={() => nav(`/leads/${t.leadId}`)}>
                      {t.done ? <CheckCircle2 size={15} className="green" /> : late ? <AlertTriangle size={15} className="orange" /> : <Clock size={15} className="muted" />}
                      <div className="grow"><div className="cell-primary small truncate">{t.title}</div><div className="cell-sub truncate">{l?.name} · <span className={`mono ${late ? 'red' : ''}`}>{fmtDateTime(t.due)}</span></div></div>
                      <StatusBadge status={t.priority} dot={false} />
                    </div>
                  );
                })}
                {!tasksView.length && <div className="small muted" style={{ padding: '12px 0' }}>No {taskView} follow-ups.</div>}
              </div>
            </Card>
            <Card title="Appointments" sub={`${upcoming.length} upcoming · ${apptDone}/${past.length} past completed`} actions={<Button size="xs" variant="ghost" onClick={() => nav('/appointments')}>Calendar</Button>}>
              <div className="list">
                {[...upcoming.slice(0, 4), ...past.slice(0, Math.max(0, 6 - Math.min(4, upcoming.length)))].map((a) => (
                  <div key={a.id} className="list-item clickable" onClick={() => nav(`/appointments?appt=${a.id}`)}>
                    <div className="inset-box" style={{ padding: '4px 8px', textAlign: 'center', minWidth: 52 }}><div className="xs muted">{fmtDateShort(a.start)}</div><div className="mono small strong">{fmtTime(a.start)}</div></div>
                    <div className="grow"><div className="cell-primary small truncate">{app.leadById.get(a.leadId)?.name}</div><div className="cell-sub truncate">{a.type} · {a.durationMin} min</div></div>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
                {!s.appts.length && <div className="small muted" style={{ padding: '12px 0' }}>No appointments.</div>}
              </div>
            </Card>
          </div>

          <Card title="Activity history" sub={`${activity.length} audit events and lead notes by this member`}>
            {activity.length ? (
              <div className="timeline">
                {activity.slice(0, showAll ? 60 : 10).map((a) => (
                  <div key={a.id} className="tl-item">
                    <span className="tl-dot">{a.kind === 'Note' ? <MessageSquare size={9} className="blue" /> : <span />}</span>
                    <div className="row between" style={{ alignItems: 'flex-start' }}>
                      <div className="grow">
                        <div className="small medium" style={{ color: 'var(--ink)' }}>{a.link ? <a href={`#${a.link}`} onClick={(e) => { e.preventDefault(); nav(a.link!); }}>{a.title}</a> : a.title}</div>
                        <div className="small muted">{a.detail}</div>
                      </div>
                      <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}><span className="mono xs muted nowrap">{fmtRelative(a.at)}</span><Badge tone="outline">{a.kind}</Badge></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No recorded activity" />}
            {activity.length > 10 && <div className="mt-12"><Button size="xs" variant="ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : `Show ${Math.min(60, activity.length) - 10} more`}</Button></div>}
          </Card>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Card title="Contact">
            <KV items={[
              ['Email', <a href={`mailto:${m.email}`}>{m.email}</a>],
              ['Member ID', <span className="mono">{m.id}</span>],
              ['Joined', fmtDate(m.joined)],
              ['Last active', <span className="mono">{fmtRelative(m.lastActive)}</span>],
              ['Sign-in', 'Single sign-on (Entra ID)'],
            ]} />
          </Card>
          <AvailabilityCard m={m} canEdit={canManage || isMe} />
          <RoleTeamCard m={m} canEdit={canManage} />
          <Card title="Effective permissions" sub={`Granted by the ${m.role} role`} actions={<Button size="xs" variant="ghost" onClick={() => nav('/team?tab=roles')}>Matrix</Button>}>
            <div className="col gap-4">
              {PERMISSION_META.map((p) => (
                <div key={p.key} className="row between small">
                  <span className={roleHas(m.role, p.key) ? '' : 'muted'} style={roleHas(m.role, p.key) ? undefined : { textDecoration: 'line-through', textDecorationColor: 'var(--smoke)' }}>{p.label}</span>
                  {roleHas(m.role, p.key) ? <ShieldCheck size={14} className="green" /> : <Lock size={13} style={{ color: 'var(--silver)' }} />}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function AvailabilityCard({ m, canEdit }: { m: TeamMember; canEdit: boolean }) {
  const app = useApp();
  const set = (st: TeamMember['status']) => {
    if (st === m.status) return;
    app.updateMember(m.id, { status: st });
    app.audit('Changed availability', `${m.name} → ${st}`, 'Settings');
    app.toast('Availability updated', `${m.name} is now ${st.toLowerCase()}`);
  };
  const desc: Record<TeamMember['status'], string> = { Available: 'Receives new handovers immediately.', Busy: 'Receives handovers; marked as on a call.', Away: 'Paused — handovers routed to teammates.', Offline: 'Not receiving handovers.' };
  return (
    <Card title="Availability" sub={desc[m.status]}>
      <div className="col" style={{ gap: 6 }}>
        {MEMBER_STATUSES.map((st) => (
          <button key={st} type="button" className={`option-card ${m.status === st ? 'on' : ''}`} style={{ padding: '8px 12px' }} disabled={!canEdit} onClick={() => set(st)} title={canEdit ? undefined : 'Requires team.manage permission'}>
            <span className="row between"><StatusBadge status={st} /><span className="xs muted">{desc[st]}</span></span>
          </button>
        ))}
      </div>
      {!canEdit && <div className="xs muted mt-8 row gap-4"><Lock size={11} />Only the member or an admin can change this.</div>}
    </Card>
  );
}

function RoleTeamCard({ m, canEdit }: { m: TeamMember; canEdit: boolean }) {
  const app = useApp();
  const [f, setF] = useState({ role: m.role, team: m.team, capacity: m.capacity, products: m.products });
  const dirty = f.role !== m.role || f.team !== m.team || f.capacity !== m.capacity || f.products.join() !== m.products.join();
  const isRep = f.role === 'Sales Representative';
  const selfDemote = m.id === app.me.id && f.role !== m.role;
  const save = () => {
    if (isRep && (f.capacity < 1 || f.capacity > 200)) { app.toast('Capacity must be between 1 and 200', undefined, 'error'); return; }
    app.updateMember(m.id, { role: f.role, team: f.team, capacity: isRep ? f.capacity : 0, products: isRep ? f.products : [] });
    if (f.role !== m.role) app.audit('Changed role', `${m.name}: ${m.role} → ${f.role}`, 'Auth');
    if (f.team !== m.team) app.audit('Moved team', `${m.name}: ${m.team} → ${f.team}`, 'Settings');
    app.toast('Member updated', `${m.name} · ${f.role} · ${f.team}`);
  };
  return (
    <Card title="Role & team" actions={!canEdit ? <Badge tone="outline"><Lock size={11} />Read-only</Badge> : undefined}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }} className="col gap-12">
        <Field label="Role" hint={ROLE_DESC[f.role]}>
          <select className="select sm" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} disabled={r === 'Super Admin' && app.role !== 'Super Admin'}>{r}</option>)}
          </select>
        </Field>
        <Field label="Team">
          <select className="select sm" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value as TeamMember['team'] })}>{TEAMS.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        {isRep && <>
          <Field label="Lead capacity" hint="Maximum open leads at once"><input className="input sm" type="number" min={1} max={200} value={f.capacity || ''} onChange={(e) => setF({ ...f, capacity: +e.target.value })} /></Field>
          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>Product specialisms</div>
            <div className="row-wrap" style={{ gap: 6 }}>
              {app.products.map((p) => <button key={p.id} type="button" className={`adm-chip ${f.products.includes(p.id) ? 'on' : ''}`} style={{ height: 24, fontSize: 12 }} onClick={() => setF({ ...f, products: f.products.includes(p.id) ? f.products.filter((x) => x !== p.id) : [...f.products, p.id] })}>{p.name}</button>)}
            </div>
          </div>
        </>}
        {selfDemote && <div className="banner warn small"><AlertTriangle />Changing your own role takes effect on your next sign-in.</div>}
      </fieldset>
      {canEdit && (
        <div className="row mt-12" style={{ justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setF({ role: m.role, team: m.team, capacity: m.capacity, products: m.products })}>Discard</Button>
          <Button size="sm" variant="primary" disabled={!dirty} onClick={save}>Save</Button>
        </div>
      )}
      <div className="row xs muted mt-8 gap-4"><CalendarDays size={11} />Changes are recorded in the audit log.</div>
    </Card>
  );
}
