import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  AlertTriangle, ArrowRight, BadgeCheck, Briefcase, CalendarClock, CalendarPlus, Check, ChevronDown, Clock, Flame, ListTodo, MoreHorizontal, Percent,
  Phone, PoundSterling, Sparkles, Users, Eye,
} from 'lucide-react';
import { useApp } from '../store/store';
import {
  Avatar, Badge, Button, Card, ChartTip, CHART, DataTable, EmptyState, KpiCard, Legend, Menu, MenuItem, PageHeader, ScoreBar, SimBadge, StatusBadge, Tabs, type Column,
} from '../components/ui';
import type { Lead, LeadStatus } from '../data/types';
import { DAY, NOW, startOfDay } from '../data/seed';
import { fmtDateShort, fmtDateTime, fmtGBP, fmtInt, fmtPct, fmtRelative, fmtTime } from '../lib/format';
import { PageFix, ScheduleModal, isToday, useCallsByLead, useReps } from './leads/shared';
import { HandoverDrawer, SaleOutcomeModal, SimDialModal } from './leads/Handover';

type Tab = 'dashboard' | 'assigned' | 'warm' | 'priority' | 'followups' | 'appointments' | 'overdue' | 'converted';
const TABS: Tab[] = ['dashboard', 'assigned', 'warm', 'priority', 'followups', 'appointments', 'overdue', 'converted'];
const QUICK_STATUS: LeadStatus[] = ['Hot', 'Warm', 'Cold', 'Callback requested', 'Not interested', 'Unreachable'];

export default function Workspace() {
  const app = useApp(); const nav = useNavigate(); const reps = useReps(); const byLead = useCallsByLead();
  const [params, setParams] = useSearchParams();
  const tp = params.get('tab') as Tab | null;
  const tab: Tab = tp && TABS.includes(tp) ? tp : 'dashboard';
  const setTab = (t: Tab) => { const p = new URLSearchParams(params); if (t === 'dashboard') p.delete('tab'); else p.set('tab', t); setParams(p, { replace: true }); };

  const isRep = app.role === 'Sales Representative';
  const [picked, setPicked] = useState(() => reps.find((r) => r.id === 'u-005')?.id ?? reps[0]?.id ?? '');
  const repId = isRep ? app.me.id : picked;
  const rep = app.memberById.get(repId);

  const [openId, setOpenId] = useState<string | null>(null);
  const [dialId, setDialId] = useState<string | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [schedId, setSchedId] = useState<string | null>(null);

  const mine = useMemo(() => app.leads.filter((l) => l.assignedRepId === repId && !l.archived), [app.leads, repId]);
  const active = mine.filter((l) => !['Converted', 'Not interested', 'Do not call'].includes(l.status));
  const newWarm = mine.filter((l) => l.status === 'Warm' && l.lastCallAt && NOW.getTime() - +new Date(l.lastCallAt) < 7 * DAY);
  const priority = mine.filter((l) => l.status !== 'Converted' && (l.status === 'Hot' || l.score >= 85));
  const converted = mine.filter((l) => l.status === 'Converted');
  const myTasks = useMemo(() => app.tasks.filter((t) => t.repId === repId), [app.tasks, repId]);
  const overdue = myTasks.filter((t) => !t.done && new Date(t.due) < NOW).sort((a, b) => +new Date(a.due) - +new Date(b.due));
  const myAppts = useMemo(() => app.appointments.filter((a) => a.repId === repId), [app.appointments, repId]);
  const upcoming = myAppts.filter((a) => new Date(a.start) >= NOW && ['Scheduled', 'Confirmed', 'Rescheduled'].includes(a.status)).sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const todayTasks = myTasks.filter((t) => isToday(t.due)).sort((a, b) => +new Date(a.due) - +new Date(b.due));
  const todayLeads = active.filter((l) => l.nextFollowUp && isToday(l.nextFollowUp));
  const todayAppts = myAppts.filter((a) => isToday(a.start) && !['Cancelled'].includes(a.status));
  const todayCount = todayTasks.filter((t) => !t.done).length + todayLeads.length + todayAppts.filter((a) => a.status !== 'Completed').length;
  const convRate = mine.length ? (converted.length / mine.length) * 100 : 0;
  const revenue = converted.reduce((s, l) => { const p = app.productById.get(l.productInterest); return s + (p ? p.monthlyPrice * p.contractMonths : 0); }, 0);

  const weekly = useMemo(() => {
    const monday = startOfDay(NOW); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 8 }, (_, i) => {
      const from = monday.getTime() - (7 - i) * 7 * DAY; const to = from + 7 * DAY;
      const inW = (iso: string | null) => !!iso && +new Date(iso) >= from && +new Date(iso) < to;
      return {
        label: fmtDateShort(new Date(from)),
        Handovers: mine.filter((l) => inW(l.lastCallAt)).length,
        Converted: mine.filter((l) => l.status === 'Converted' && inW(l.lastCallAt)).length,
        Appointments: myAppts.filter((a) => a.status === 'Completed' && inW(a.start)).length,
      };
    });
  }, [mine, myAppts]);

  const setStatus = (l: Lead, s: LeadStatus) => { app.updateLead(l.id, { status: s }); app.audit('Changed lead status', `${l.name} → ${s}`, 'Data'); app.toast('Status updated', `${l.name} → ${s}`); };
  const completeTask = (id: string) => { const t = app.tasks.find((x) => x.id === id); if (!t) return; app.upsertTask({ ...t, done: !t.done }); app.toast(t.done ? 'Task reopened' : 'Task completed', t.title); };

  const leadCols: Column<Lead>[] = [
    { key: 'name', header: 'Customer', render: (l) => <div style={{ maxWidth: 240 }}><div className="cell-primary truncate">{l.name}</div><div className="cell-sub truncate"><span className="mono">{l.id}</span> · {app.productById.get(l.productInterest)?.name}</div></div>, sort: (l) => l.name },
    { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} />, sort: (l) => l.status },
    { key: 'score', header: 'Score', render: (l) => <ScoreBar value={l.score} />, sort: (l) => l.score },
    { key: 'last', header: 'Last AI call', render: (l) => <span className="small nowrap">{fmtRelative(l.lastCallAt)}</span>, sort: (l) => +new Date(l.lastCallAt ?? 0) },
    { key: 'next', header: 'Next follow-up', render: (l) => l.nextFollowUp ? <span className={`small nowrap ${new Date(l.nextFollowUp) < NOW && l.status !== 'Converted' ? 'red' : ''}`}>{fmtRelative(l.nextFollowUp)}</span> : <span className="muted">—</span>, sort: (l) => +new Date(l.nextFollowUp ?? 0) },
    {
      key: 'act', header: '', render: (l) => (
        <div className="row gap-4" onClick={(e) => e.stopPropagation()}>
          <Button size="xs" icon={<Phone />} onClick={() => setDialId(l.id)} title="Contact customer (simulated)">Contact</Button>
          <Menu trigger={(t) => <Button size="xs" variant="ghost" iconOnly icon={<MoreHorizontal />} onClick={t} aria-label={`More actions for ${l.name}`} />}>
            {(close) => (<>
              <MenuItem icon={<Eye />} onClick={() => { close(); setOpenId(l.id); }}>Open handover</MenuItem>
              <MenuItem icon={<CalendarPlus />} onClick={() => { close(); setSchedId(l.id); }}>Schedule follow-up</MenuItem>
              <MenuItem icon={<PoundSterling />} onClick={() => { close(); setSaleId(l.id); }} disabled={l.status === 'Converted'}>Record sale outcome</MenuItem>
              <div className="menu-sep" /><div className="menu-label label">Update status</div>
              {QUICK_STATUS.map((s) => <MenuItem key={s} onClick={() => { close(); setStatus(l, s); }}>{s}{l.status === s && <Check size={13} style={{ marginLeft: 'auto' }} />}</MenuItem>)}
            </>)}
          </Menu>
        </div>
      ),
    },
  ];
  const leadTable = (rows: Lead[], emptyTitle: string, sortKey = 'score') => (
    <Card flush>
      <DataTable rows={rows} columns={leadCols} rowKey={(l) => l.id} onRowClick={(l) => setOpenId(l.id)} initialSort={{ key: sortKey, dir: 'desc' }} pageSize={10}
        empty={<EmptyState icon={<Users size={18} />} title={emptyTitle} desc="Nothing here right now." />} />
    </Card>
  );

  const tabs = [
    { value: 'dashboard' as const, label: 'My dashboard' },
    { value: 'assigned' as const, label: 'Assigned leads', count: active.length },
    { value: 'warm' as const, label: 'New warm', count: newWarm.length },
    { value: 'priority' as const, label: 'Priority', count: priority.length },
    { value: 'followups' as const, label: 'Today', count: todayCount },
    { value: 'appointments' as const, label: 'Appointments', count: upcoming.length },
    { value: 'overdue' as const, label: 'Overdue tasks', count: overdue.length },
    { value: 'converted' as const, label: 'Converted', count: converted.length },
  ];

  const apptRow = (a: (typeof myAppts)[number]) => {
    const l = app.leadById.get(a.leadId);
    return (
      <div key={a.id} className="list-item">
        <div className="inset-box" style={{ padding: '4px 8px', textAlign: 'center', minWidth: 56 }}><div className="xs muted">{fmtDateShort(a.start)}</div><div className="mono small strong">{fmtTime(a.start)}</div></div>
        <div className="grow"><div className="cell-primary truncate">{l?.name}</div><div className="cell-sub truncate">{a.type} · {a.durationMin} min · {a.source}</div></div>
        <StatusBadge status={a.status} />
        {a.status === 'Scheduled' && <Button size="xs" onClick={() => { app.upsertAppointment({ ...a, status: 'Confirmed' }); app.toast('Appointment confirmed', `${l?.name} · ${fmtDateTime(a.start)}`); }}>Confirm</Button>}
        <Button size="xs" variant="ghost" iconOnly icon={<ArrowRight />} onClick={() => nav(`/appointments?appt=${a.id}`)} aria-label="Open in calendar" />
      </div>
    );
  };
  const taskRow = (t: (typeof myTasks)[number]) => {
    const l = app.leadById.get(t.leadId); const od = !t.done && new Date(t.due) < NOW;
    return (
      <div key={t.id} className="list-item">
        <input type="checkbox" className="checkbox" checked={t.done} onChange={() => completeTask(t.id)} aria-label={`Complete ${t.title}`} />
        <div className="grow">
          <div className="cell-primary" style={t.done ? { textDecoration: 'line-through', color: 'var(--fog)' } : undefined}>{t.title}</div>
          <div className="cell-sub"><Link to={`/leads/${t.leadId}`} onClick={(e) => e.stopPropagation()}>{l?.name}</Link> · <span className={od ? 'red' : ''}>{od ? `Overdue ${fmtRelative(t.due)}` : fmtDateTime(t.due)}</span></div>
        </div>
        <StatusBadge status={t.priority} dot={false} />
        {l && <Button size="xs" variant="ghost" icon={<Phone />} onClick={() => setDialId(l.id)}>Contact</Button>}
      </div>
    );
  };

  return (
    <>
      <PageFix />
      <PageHeader
        title="My workspace"
        desc={isRep ? `Your assigned leads, follow-ups and appointments, ${app.me.name.split(' ')[0]}.` : 'Preview a sales representative’s workspace — assigned leads, handovers and follow-ups.'}
        eyebrow={rep ? <><Badge tone="blue">{rep.team}</Badge><Badge tone={rep.status === 'Available' ? 'green' : rep.status === 'Offline' ? 'neutral' : 'amber'} dot>{rep.status}</Badge><SimBadge /></> : undefined}
        actions={!isRep ? (
          <div className="row">
            <span className="small muted nowrap">Viewing workspace as</span>
            <Menu trigger={(t) => <Button size="sm" onClick={t} iconRight={<ChevronDown size={13} />}><Avatar name={rep?.name} initials={rep?.initials} size="sm" />{rep?.name}</Button>}>
              {(close) => (<>
                <div className="menu-label label">Sales representatives</div>
                {reps.map((r) => <MenuItem key={r.id} onClick={() => { setPicked(r.id); close(); }}><Avatar name={r.name} initials={r.initials} size="sm" />{r.name}<span className="xs muted" style={{ marginLeft: 'auto' }}>{r.team.replace(' Sales', '')}</span>{r.id === repId && <Check size={13} />}</MenuItem>)}
              </>)}
            </Menu>
          </div>
        ) : undefined}
      />

      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {tab === 'dashboard' && (
        <>
          <div className="grid g-4 keep-2" style={{ marginBottom: 16 }}>
            <KpiCard label="Assigned leads" icon={<Briefcase size={13} />} value={fmtInt(active.length)} prevLabel={`${mine.length} total incl. closed`} onClick={() => setTab('assigned')} />
            <KpiCard label="New warm leads" icon={<Sparkles size={13} />} value={fmtInt(newWarm.length)} prevLabel="qualified in last 7 days" onClick={() => setTab('warm')} />
            <KpiCard label="Priority leads" icon={<Flame size={13} />} value={fmtInt(priority.length)} prevLabel="hot or score ≥ 85" onClick={() => setTab('priority')} />
            <KpiCard label="Today’s follow-ups" icon={<Clock size={13} />} value={fmtInt(todayCount)} prevLabel={`${todayAppts.length} appointments · ${todayTasks.filter((t) => !t.done).length} tasks`} onClick={() => setTab('followups')} />
            <KpiCard label="Upcoming appointments" icon={<CalendarClock size={13} />} value={fmtInt(upcoming.length)} prevLabel={upcoming[0] ? `next ${fmtRelative(upcoming[0].start)}` : 'none booked'} onClick={() => setTab('appointments')} />
            <KpiCard label="Overdue tasks" icon={<AlertTriangle size={13} />} value={<span className={overdue.length ? 'red' : ''}>{fmtInt(overdue.length)}</span>} prevLabel={overdue[0] ? `oldest ${fmtRelative(overdue[0].due)}` : 'all on track'} onClick={() => setTab('overdue')} />
            <KpiCard label="Converted sales" icon={<BadgeCheck size={13} />} value={fmtInt(converted.length)} prevLabel={`${fmtGBP(revenue)} contract value`} onClick={() => setTab('converted')} />
            <KpiCard label="Conversion rate" icon={<Percent size={13} />} value={fmtPct(convRate)} prevLabel={`${converted.length} of ${mine.length} handovers`} />
          </div>
          <div className="grid g-main-side" style={{ marginBottom: 16 }}>
            <Card title="My performance" sub="Weekly handovers received, completed appointments and conversions · last 8 weeks">
              <Legend items={[{ label: 'Handovers', color: CHART.light }, { label: 'Appointments', color: CHART.blue }, { label: 'Converted', color: CHART.green }]} />
              <div style={{ height: 240 }} className="mt-12">
                <ResponsiveContainer>
                  <BarChart data={weekly} margin={{ left: -20, right: 4, top: 8 }} barGap={2}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                    <Tooltip content={<ChartTip labelFmt={(l) => `w/c ${l}`} />} cursor={{ fill: '#F5F5F5' }} />
                    <Bar dataKey="Handovers" fill={CHART.light} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Appointments" fill={CHART.blue} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Converted" fill={CHART.green} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Today’s agenda" sub={NOW.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => setTab('followups')}>All</Button>}>
              <AgendaList todayAppts={todayAppts} todayTasks={todayTasks} todayLeads={todayLeads} onLead={setOpenId} onTask={completeTask} />
            </Card>
          </div>
          <div className="grid g-2">
            <Card flush title="Priority queue" sub="Hot leads and scores ≥ 85" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => setTab('priority')}>View all</Button>}>
              <div className="list" style={{ padding: '0 16px 8px' }}>
                {[...priority].sort((a, b) => b.score - a.score).slice(0, 6).map((l) => (
                  <div key={l.id} className="list-item clickable" onClick={() => setOpenId(l.id)}>
                    <Avatar name={l.name} size="sm" />
                    <div className="grow"><div className="cell-primary truncate">{l.name}</div><div className="cell-sub truncate">{app.productById.get(l.productInterest)?.name} · {fmtRelative(l.lastCallAt)}</div></div>
                    <ScoreBar value={l.score} />
                    <Button size="xs" icon={<Phone />} onClick={(e) => { e.stopPropagation(); setDialId(l.id); }}>Contact</Button>
                  </div>
                ))}
                {!priority.length && <div className="small muted" style={{ padding: '8px 0' }}>No priority leads.</div>}
              </div>
            </Card>
            <Card flush title="Overdue tasks" sub={overdue.length ? `${overdue.length} need attention` : 'All caught up'} actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => setTab('overdue')}>View all</Button>}>
              <div className="list" style={{ padding: '0 16px 8px' }}>
                {overdue.slice(0, 6).map(taskRow)}
                {!overdue.length && <div className="small muted" style={{ padding: '8px 0' }}>No overdue tasks.</div>}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === 'assigned' && leadTable(active, 'No assigned leads')}
      {tab === 'warm' && leadTable(newWarm, 'No new warm leads', 'last')}
      {tab === 'priority' && leadTable(priority, 'No priority leads')}
      {tab === 'followups' && (
        <div className="grid g-main-side">
          <Card title="Today’s follow-ups" sub={`${todayCount} open items`}>
            <AgendaList todayAppts={todayAppts} todayTasks={todayTasks} todayLeads={todayLeads} onLead={setOpenId} onTask={completeTask} />
          </Card>
          <Card title="Due tomorrow">
            <div className="list">
              {myTasks.filter((t) => !t.done && startOfDay(new Date(t.due)).getTime() === startOfDay(NOW).getTime() + DAY).map(taskRow)}
              {!myTasks.some((t) => !t.done && startOfDay(new Date(t.due)).getTime() === startOfDay(NOW).getTime() + DAY) && <div className="small muted">Nothing due tomorrow.</div>}
            </div>
          </Card>
        </div>
      )}
      {tab === 'appointments' && (
        <Card flush title="Upcoming appointments" sub={`${upcoming.length} booked`} actions={<Button size="sm" icon={<CalendarClock />} onClick={() => nav('/appointments')}>Open calendar</Button>}>
          <div className="list" style={{ padding: '0 16px 8px' }}>
            {upcoming.map(apptRow)}
            {!upcoming.length && <EmptyState icon={<CalendarClock size={18} />} title="No upcoming appointments" />}
          </div>
        </Card>
      )}
      {tab === 'overdue' && (
        <Card flush title="Overdue tasks" sub="Tick a task to mark it complete">
          {overdue.length > 0 && <div style={{ padding: '0 16px' }}><div className="banner warn"><AlertTriangle />{overdue.length} task{overdue.length > 1 ? 's are' : ' is'} past due. Customers waiting more than 48h are 3× less likely to convert.</div></div>}
          <div className="list" style={{ padding: '4px 16px 8px' }}>
            {overdue.map(taskRow)}
            {!overdue.length && <EmptyState icon={<ListTodo size={18} />} title="No overdue tasks" desc="Everything is on track." />}
          </div>
        </Card>
      )}
      {tab === 'converted' && (
        <Card flush>
          <DataTable rows={converted} rowKey={(l) => l.id} onRowClick={(l) => nav(`/leads/${l.id}`)} initialSort={{ key: 'value', dir: 'desc' }}
            empty={<EmptyState icon={<BadgeCheck size={18} />} title="No converted sales yet" />}
            columns={[
              { key: 'name', header: 'Customer', render: (l) => <div><div className="cell-primary">{l.name}</div><div className="cell-sub mono">{l.id}</div></div>, sort: (l) => l.name },
              { key: 'product', header: 'Product', render: (l) => app.productById.get(l.productInterest)?.name, sort: (l) => app.productById.get(l.productInterest)?.name ?? '' },
              { key: 'type', header: 'Type', render: (l) => <span className="small">{l.customerType}</span> },
              { key: 'value', header: 'Contract value', align: 'right', render: (l) => { const p = app.productById.get(l.productInterest); return <span className="mono">{p ? fmtGBP(p.monthlyPrice * p.contractMonths) : '—'}</span>; }, sort: (l) => { const p = app.productById.get(l.productInterest); return p ? p.monthlyPrice * p.contractMonths : 0; } },
              { key: 'when', header: 'Qualified', render: (l) => <span className="small">{fmtRelative(l.lastCallAt)}</span>, sort: (l) => +new Date(l.lastCallAt ?? 0) },
            ]}
            footerExtra={<span className="mono">Total {fmtGBP(revenue)}</span>} />
        </Card>
      )}

      <HandoverDrawer lead={openId ? app.leadById.get(openId) ?? null : null} calls={openId ? byLead.get(openId) ?? [] : []} onClose={() => setOpenId(null)} actingRepId={repId}
        onContact={(l) => setDialId(l.id)} onRecordSale={(l) => setSaleId(l.id)} />
      <SimDialModal lead={dialId ? app.leadById.get(dialId) ?? null : null} onClose={() => setDialId(null)} onSale={(l) => setSaleId(l.id)} />
      <SaleOutcomeModal lead={saleId ? app.leadById.get(saleId) ?? null : null} onClose={() => setSaleId(null)} />
      <ScheduleModal open={!!schedId} onClose={() => setSchedId(null)} leadId={schedId ?? undefined} defaultRepId={repId} defaultType="Callback" title="Schedule follow-up" />
    </>
  );
}

function AgendaList({ todayAppts, todayTasks, todayLeads, onLead, onTask }: {
  todayAppts: ReturnType<typeof useApp>['appointments']; todayTasks: ReturnType<typeof useApp>['tasks']; todayLeads: Lead[]; onLead: (id: string) => void; onTask: (id: string) => void;
}) {
  const app = useApp();
  type Item = { at: string; key: string; node: ReactNode };
  const items: Item[] = [
    ...todayAppts.map((a): Item => ({ at: a.start, key: a.id, node: (
      <div className="list-item clickable" onClick={() => onLead(a.leadId)}>
        <CalendarClock size={15} className="blue" />
        <div className="grow"><div className="cell-primary truncate">{a.type} · {app.leadById.get(a.leadId)?.name}</div><div className="cell-sub">{fmtTime(a.start)} · {a.durationMin} min</div></div>
        <StatusBadge status={a.status} dot={false} />
      </div>
    ) })),
    ...todayTasks.map((t): Item => ({ at: t.due, key: t.id, node: (
      <div className="list-item">
        <input type="checkbox" className="checkbox" checked={t.done} onChange={() => onTask(t.id)} aria-label={`Complete ${t.title}`} />
        <div className="grow"><div className="cell-primary truncate" style={t.done ? { textDecoration: 'line-through', color: 'var(--fog)' } : undefined}>{t.title}</div><div className={`cell-sub ${!t.done && new Date(t.due) < NOW ? 'red' : ''}`}>{fmtTime(t.due)} · {app.leadById.get(t.leadId)?.name}</div></div>
        <StatusBadge status={t.priority} dot={false} />
      </div>
    ) })),
    ...todayLeads.map((l): Item => ({ at: l.nextFollowUp!, key: l.id, node: (
      <div className="list-item clickable" onClick={() => onLead(l.id)}>
        <Phone size={15} className="muted" />
        <div className="grow"><div className="cell-primary truncate">Follow up · {l.name}</div><div className={`cell-sub ${new Date(l.nextFollowUp!) < NOW ? 'red' : ''}`}>{fmtTime(l.nextFollowUp!)} · {app.productById.get(l.productInterest)?.name}</div></div>
        <StatusBadge status={l.status} dot={false} />
      </div>
    ) })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  if (!items.length) return <div className="small muted">Nothing scheduled for today.</div>;
  return <div className="list">{items.map((i) => <Fragment key={i.key}>{i.node}</Fragment>)}</div>;
}
