import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BellRing, CalendarCheck, CalendarClock, CalendarX, Check, ChevronLeft, ChevronRight, Edit3, Plus, UserX, CalendarRange, ListTodo } from 'lucide-react';
import { useApp } from '../store/store';
import { Avatar, Badge, Button, Card, Drawer, Field, FilterSelect, KV, PageHeader, Segmented, StatusBadge, Switch, useConfirm } from '../components/ui';
import type { Appointment } from '../data/types';
import { DAY, NOW, startOfDay } from '../data/seed';
import { MONTHS, fmtDateTime, fmtGBP, fmtInt, fmtPct, fmtRelative, fmtTime } from '../lib/format';
import { APPT_COLOR, APPT_STATUSES, APPT_TYPES, PageFix, ScheduleModal, fromInputs, toDateInput, toTimeInput, useReps } from './leads/shared';

type View = 'month' | 'week' | 'day';
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 08–19
const ROW = 52;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const mondayOf = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export default function Appointments() {
  const app = useApp(); const reps = useReps(); const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const apptId = params.get('appt');
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 720 ? 'day' : 'week'));
  const [cursor, setCursor] = useState(() => startOfDay(NOW));
  const [repF, setRepF] = useState(() => (app.role === 'Sales Representative' ? app.me.id : '')); const [typeF, setTypeF] = useState(''); const [statusF, setStatusF] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [resched, setResched] = useState<{ date: string; time: string; err?: string } | null>(null);

  const selected = apptId ? app.appointments.find((a) => a.id === apptId) ?? null : null;
  useEffect(() => { if (selected) setCursor(startOfDay(new Date(selected.start))); setResched(null); }, [apptId]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (id: string | null) => { const p = new URLSearchParams(params); if (id) p.set('appt', id); else p.delete('appt'); setParams(p); };

  const visible = useMemo(() => app.appointments.filter((a) => (!repF || a.repId === repF) && (!typeF || a.type === typeF) && (!statusF || a.status === statusF)), [app.appointments, repF, typeF, statusF]);
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    visible.forEach((a) => { const k = new Date(a.start).toDateString(); m.set(k, [...(m.get(k) ?? []), a]); });
    m.forEach((v) => v.sort((a, b) => +new Date(a.start) - +new Date(b.start)));
    return m;
  }, [visible]);
  const dayAppts = (d: Date) => byDay.get(d.toDateString()) ?? [];

  // stats
  const wk = mondayOf(NOW);
  const today = visible.filter((a) => sameDay(new Date(a.start), NOW) && a.status !== 'Cancelled').length;
  const week = visible.filter((a) => { const t = +new Date(a.start); return t >= +wk && t < +wk + 7 * DAY && a.status !== 'Cancelled'; }).length;
  const upcoming = visible.filter((a) => new Date(a.start) > NOW && ['Scheduled', 'Confirmed', 'Rescheduled'].includes(a.status));
  const past30 = visible.filter((a) => { const t = +new Date(a.start); return t < +NOW && t > +NOW - 30 * DAY && ['Completed', 'No-show'].includes(a.status); });
  const noShow = past30.length ? (past30.filter((a) => a.status === 'No-show').length / past30.length) * 100 : 0;

  // navigation
  const step = (dir: number) => setCursor((c) => view === 'month' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, dir * (view === 'week' ? 7 : 1)));
  const title = view === 'month' ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : view === 'week' ? (() => { const m = mondayOf(cursor); const s = addDays(m, 6); return `${m.getDate()} ${MONTHS[m.getMonth()]} – ${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`; })()
      : cursor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const goDay = (d: Date) => { setCursor(startOfDay(d)); setView('day'); };

  // actions
  const setStatus = (a: Appointment, status: Appointment['status'], msg: string) => {
    app.upsertAppointment({ ...a, status });
    app.audit(`Appointment ${status.toLowerCase()}`, `${a.id} · ${app.leadById.get(a.leadId)?.name}`, 'Data');
    app.toast(msg, `${app.leadById.get(a.leadId)?.name} · ${fmtDateTime(a.start)}`);
  };
  const cancel = async (a: Appointment) => {
    if (!(await confirm({ title: 'Cancel appointment?', desc: `The ${a.type.toLowerCase()} with ${app.leadById.get(a.leadId)?.name} on ${fmtDateTime(a.start)} will be cancelled${a.reminder ? ' and the customer notified' : ''}.`, confirmLabel: 'Cancel appointment', danger: true }))) return;
    setStatus(a, 'Cancelled', 'Appointment cancelled');
  };
  const saveResched = (a: Appointment) => {
    if (!resched) return;
    if (!resched.date || !resched.time) { setResched({ ...resched, err: 'Choose a date and time' }); return; }
    const d = fromInputs(resched.date, resched.time);
    if (d < NOW) { setResched({ ...resched, err: 'Choose a time in the future' }); return; }
    if (resched.time < '08:00' || resched.time > '18:45') { setResched({ ...resched, err: 'Appointments run between 08:00 and 19:00' }); return; }
    if (d.getDay() === 0) { setResched({ ...resched, err: 'No appointments on Sundays' }); return; }
    app.upsertAppointment({ ...a, start: d.toISOString(), status: 'Rescheduled' });
    app.updateLead(a.leadId, { nextFollowUp: d.toISOString() });
    app.audit('Rescheduled appointment', `${a.id} → ${fmtDateTime(d)}`, 'Data');
    app.toast('Appointment rescheduled', `${app.leadById.get(a.leadId)?.name} · ${fmtDateTime(d)}${a.reminder ? ' · customer notified' : ''}`);
    setResched(null); setCursor(startOfDay(d));
  };

  // follow-up tasks
  const tasks = app.tasks.filter((t) => !t.done && (!repF || t.repId === repF)).sort((a, b) => +new Date(a.due) - +new Date(b.due));
  const overdueTasks = tasks.filter((t) => new Date(t.due) < NOW);

  /* ---------- renderers ---------- */
  const eventChip = (a: Appointment) => {
    const c = APPT_COLOR[a.status]; const l = app.leadById.get(a.leadId);
    return (
      <span key={a.id} className="cal-event" style={{ background: c.bg, borderLeftColor: c.fg, color: 'var(--graphite)', textDecoration: a.status === 'Cancelled' ? 'line-through' : undefined }} onClick={(e) => { e.stopPropagation(); open(a.id); }} title={`${fmtTime(a.start)} ${a.type} · ${l?.name} · ${a.status}`}>
        <span className="mono" style={{ color: c.fg }}>{fmtTime(a.start)}</span> {l?.name}
      </span>
    );
  };

  const month = () => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = mondayOf(first);
    const dim = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + dim) / 7);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
    return (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 640 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', marginBottom: 6 }}>{WEEKDAYS.map((w) => <div key={w} className="label" style={{ padding: '0 6px' }}>{w}</div>)}</div>
          <div className="cal-grid">
            {cells.map((d) => {
              const evs = dayAppts(d); const out = d.getMonth() !== cursor.getMonth();
              return (
                <div key={d.toISOString()} className={`cal-cell ${out ? 'out' : ''} ${sameDay(d, NOW) ? 'today' : ''}`} onDoubleClick={() => goDay(d)}>
                  <div className="row between"><button type="button" className="cal-date btn ghost" style={{ padding: 0, height: 22, border: 0 }} onClick={() => goDay(d)} aria-label={`Open ${d.toDateString()}`}>{d.getDate()}</button>{evs.length > 0 && <span className="xs muted mono">{evs.length}</span>}</div>
                  {evs.slice(0, 3).map(eventChip)}
                  {evs.length > 3 && <button type="button" className="btn link xs mt-4" style={{ fontSize: 11.5 }} onClick={() => goDay(d)}>+{evs.length - 3} more</button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const timeGrid = (days: Date[]) => {
    const cols = days.length === 1 ? '56px minmax(0,1fr)' : '56px repeat(7, minmax(0,1fr))';
    return (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: days.length === 1 ? 0 : 760 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--ash)' }}>
            <span />
            {days.map((d) => (
              <button key={d.toISOString()} type="button" onClick={() => goDay(d)} style={{ border: 0, background: 'none', padding: '6px 4px 8px', cursor: 'pointer', textAlign: 'left' }}>
                <div className="label">{WEEKDAYS[(d.getDay() + 6) % 7]}</div>
                <div className="row gap-4"><span className="cal-date" style={sameDay(d, NOW) ? { background: 'var(--ink)', color: '#fff' } : undefined}>{d.getDate()}</span><span className="xs muted">{dayAppts(d).filter((a) => a.status !== 'Cancelled').length || ''}</span></div>
              </button>
            ))}
          </div>
          <div className="cal-week" style={{ gridTemplateColumns: cols, paddingTop: 8, borderLeft: 0 }}>
            <div>{HOURS.map((h) => <div key={h} className="cal-hour-label" style={{ height: ROW }}>{String(h).padStart(2, '0')}:00</div>)}</div>
            {days.map((d) => {
              const evs = dayAppts(d);
              // lay out overlapping events side by side, per overlap cluster
              const laneOf = new Map<string, number>(); const widthOf = new Map<string, number>(); const overflow: { top: number; n: number; lane: number; w: number }[] = [];
              const maxLanes = days.length === 1 ? 6 : 3;
              let cluster: Appointment[] = []; let clusterEnd = 0; let lanes: number[] = [];
              const flush = () => {
                const n = lanes.length; const shown = Math.min(n, maxLanes);
                const hidden = cluster.filter((a) => (laneOf.get(a.id) ?? 0) >= (n > maxLanes ? maxLanes - 1 : maxLanes));
                cluster.forEach((a) => widthOf.set(a.id, 100 / shown));
                if (hidden.length) { const first = hidden[0]; const s = new Date(first.start); overflow.push({ top: Math.max(0, (((s.getHours() - 8) * 60 + s.getMinutes()) / 60) * ROW), n: hidden.length, lane: maxLanes - 1, w: 100 / shown }); hidden.forEach((a) => laneOf.set(a.id, -1)); }
                cluster = []; lanes = [];
              };
              evs.forEach((a) => {
                const st = +new Date(a.start); const en = st + Math.max(a.durationMin, 25) * 60000; // min visual height
                if (cluster.length && st >= clusterEnd) flush();
                let i = lanes.findIndex((end) => end <= st); if (i < 0) { i = lanes.length; lanes.push(0); }
                lanes[i] = en; laneOf.set(a.id, i); cluster.push(a); clusterEnd = Math.max(cluster.length === 1 ? 0 : clusterEnd, en);
              });
              if (cluster.length) flush();
              const nowTop = sameDay(d, NOW) ? ((NOW.getHours() - 8) * 60 + NOW.getMinutes()) / 60 * ROW : -1;
              return (
                <div key={d.toISOString()} style={{ position: 'relative', borderLeft: '1px solid var(--ash)' }}>
                  {HOURS.map((h) => <div key={h} className="cal-hour" style={{ borderRight: 0 }} onDoubleClick={() => setCreating(true)} />)}
                  {nowTop >= 0 && nowTop <= HOURS.length * ROW && <div style={{ position: 'absolute', left: 0, right: 0, top: nowTop, height: 0, borderTop: '1.5px solid var(--red)', zIndex: 2 }}><span style={{ position: 'absolute', left: -4, top: -4.5, width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} /></div>}
                  {overflow.map((o, i) => <button key={`o${i}`} type="button" onClick={() => goDay(d)} className="btn xs" style={{ position: 'absolute', top: o.top, left: `calc(${o.lane * o.w}% + 2px)`, width: `calc(${o.w}% - 4px)`, height: 20, padding: '0 4px', zIndex: 1, fontSize: 11 }} title="Show all in day view">+{o.n}</button>)}
                  {evs.filter((a) => (laneOf.get(a.id) ?? 0) >= 0).map((a) => {
                    const s = new Date(a.start); const mins = (s.getHours() - 8) * 60 + s.getMinutes();
                    const top = Math.max(0, (mins / 60) * ROW); const height = Math.max(20, (a.durationMin / 60) * ROW - 2);
                    const c = APPT_COLOR[a.status]; const l = app.leadById.get(a.leadId); const lane = laneOf.get(a.id) ?? 0; const w = widthOf.get(a.id) ?? 100;
                    return (
                      <div key={a.id} role="button" tabIndex={0} onClick={() => open(a.id)} onKeyDown={(e) => e.key === 'Enter' && open(a.id)} title={`${fmtTime(a.start)} · ${a.type} · ${l?.name} · ${a.status}`}
                        style={{ position: 'absolute', top, height, left: `calc(${lane * w}% + 2px)`, width: `calc(${w}% - 4px)`, background: c.bg, borderLeft: `2px solid ${c.fg}`, borderRadius: 4, padding: '2px 6px', fontSize: 11.5, overflow: 'hidden', cursor: 'pointer', zIndex: 1, lineHeight: 1.35, opacity: a.status === 'Cancelled' ? 0.65 : 1, outline: a.id === apptId ? `2px solid ${c.fg}` : undefined }}>
                        <div className="truncate" style={{ color: 'var(--ink)', fontWeight: 500, textDecoration: a.status === 'Cancelled' ? 'line-through' : undefined }}><span className="mono" style={{ color: c.fg, fontSize: 11 }}>{fmtTime(a.start)}</span> {l?.name}</div>
                        {height > 34 && <div className="truncate muted">{a.type}{days.length === 1 ? ` · ${app.memberById.get(a.repId)?.name} · ${a.durationMin} min` : ''}</div>}
                      </div>
                    );
                  })}
                  {evs.some((a) => { const h = new Date(a.start).getHours(); return h < 8 || h >= 20; }) && <div className="xs muted" style={{ position: 'absolute', bottom: 2, left: 4 }}>+ outside hours</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const sel = selected; const selLead = sel ? app.leadById.get(sel.leadId) : undefined; const selRep = sel ? app.memberById.get(sel.repId) : undefined;
  const selProduct = selLead ? app.productById.get(selLead.productInterest) : undefined;
  const closed = sel ? ['Cancelled', 'Completed', 'No-show'].includes(sel.status) : false;
  const started = sel ? new Date(sel.start) <= NOW : false;
  const canEdit = app.can('leads.edit');

  return (
    <>
      <PageFix />
      <PageHeader
        title="Appointments"
        desc="Calls, consultations and visits booked by AI agents and sales reps, with reminders and follow-up tasks."
        actions={<Button size="sm" variant="primary" icon={<Plus />} onClick={() => setCreating(true)} disabled={!canEdit} title={canEdit ? undefined : 'Your role cannot book appointments'}>New appointment</Button>}
      />

      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', marginBottom: 16 }}>
        <div><div className="kpi-label"><CalendarClock size={13} />Today</div><div className="kpi-value mt-4">{fmtInt(today)}</div></div>
        <div><div className="kpi-label"><CalendarRange size={13} />This week</div><div className="kpi-value mt-4">{fmtInt(week)}</div></div>
        <div><div className="kpi-label"><CalendarCheck size={13} />Upcoming · confirmed</div><div className="kpi-value mt-4">{fmtInt(upcoming.length)} <span className="small muted">{fmtInt(upcoming.filter((a) => a.status === 'Confirmed').length)} confirmed</span></div></div>
        <div><div className="kpi-label"><UserX size={13} />No-show rate · 30d</div><div className="kpi-value mt-4">{fmtPct(noShow)}</div></div>
      </div>

      <div className="side-layout">
        <Card>
          <div className="row-wrap between" style={{ marginBottom: 14 }}>
            <div className="row">
              <Button size="sm" iconOnly icon={<ChevronLeft />} onClick={() => step(-1)} aria-label="Previous" />
              <Button size="sm" onClick={() => setCursor(startOfDay(NOW))}>Today</Button>
              <Button size="sm" iconOnly icon={<ChevronRight />} onClick={() => step(1)} aria-label="Next" />
              <span className="strong" style={{ marginLeft: 6, fontSize: 15 }}>{title}</span>
            </div>
            <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }]} />
          </div>
          {view === 'month' ? month() : view === 'week' ? timeGrid(Array.from({ length: 7 }, (_, i) => addDays(mondayOf(cursor), i))) : timeGrid([cursor])}
          {view === 'day' && dayAppts(cursor).length === 0 && <div className="small muted mt-12">No appointments on this day{repF || typeF || statusF ? ' matching the filters' : ''}.</div>}
        </Card>

        <div className="col gap-16">
          <Card title="Filters" actions={(repF || typeF || statusF) ? <Button size="xs" variant="ghost" onClick={() => { setRepF(''); setTypeF(''); setStatusF(''); }}>Clear</Button> : undefined}>
            <div className="col gap-8">
              <FilterSelect label="Rep" value={repF} onChange={setRepF} options={reps.map((r) => ({ value: r.id, label: r.name }))} width={268} />
              <FilterSelect label="Type" value={typeF} onChange={setTypeF} options={APPT_TYPES} width={268} />
              <FilterSelect label="Status" value={statusF} onChange={setStatusF} options={APPT_STATUSES} width={268} />
            </div>
            <div className="divider" style={{ margin: '14px 0' }} />
            <div className="col" style={{ gap: 6 }}>
              {APPT_STATUSES.map((s) => (
                <button key={s} type="button" className="row between small" style={{ border: 0, background: statusF === s ? 'var(--mist)' : 'none', padding: '3px 6px', borderRadius: 6, cursor: 'pointer' }} onClick={() => setStatusF(statusF === s ? '' : s)}>
                  <span className="row gap-4"><i style={{ width: 10, height: 10, borderRadius: 3, background: APPT_COLOR[s].bg, borderLeft: `2px solid ${APPT_COLOR[s].fg}`, display: 'inline-block' }} />{s}</span>
                  <span className="mono muted">{app.appointments.filter((a) => a.status === s && (!repF || a.repId === repF)).length}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Follow-up tasks" sub={`${tasks.length} open${repF ? ` · ${app.memberById.get(repF)?.name}` : ''}`} actions={<ListTodo size={15} className="muted" />}>
            {overdueTasks.length > 0 && <div className="banner warn" style={{ marginBottom: 10 }}><AlertTriangle />{overdueTasks.length} overdue task{overdueTasks.length > 1 ? 's' : ''}</div>}
            <div className="list">
              {tasks.slice(0, 10).map((t) => {
                const od = new Date(t.due) < NOW; const l = app.leadById.get(t.leadId);
                return (
                  <div key={t.id} className="list-item" style={{ alignItems: 'flex-start', padding: '8px 0' }}>
                    <input type="checkbox" className="checkbox" style={{ marginTop: 3 }} checked={t.done} disabled={!canEdit} onChange={() => { app.upsertTask({ ...t, done: true }); app.toast('Task completed', `${t.title} · ${l?.name}`); }} aria-label={`Complete ${t.title}`} />
                    <div className="grow">
                      <div className="small medium" style={{ color: 'var(--ink)' }}>{t.title}</div>
                      <div className="xs muted truncate"><Link to={`/leads/${t.leadId}`}>{l?.name}</Link> · {app.memberById.get(t.repId)?.name.split(' ')[0]}</div>
                      <div className={`xs ${od ? 'red' : 'muted'} row gap-4`}>{od && <AlertTriangle size={11} />}{od ? `Overdue · ${fmtRelative(t.due)}` : fmtDateTime(t.due)}</div>
                    </div>
                    {t.priority === 'High' && <Badge tone="orange">High</Badge>}
                  </div>
                );
              })}
              {!tasks.length && <div className="small muted">No open tasks.</div>}
            </div>
            {tasks.length > 10 && <Link to="/workspace?tab=overdue" className="small mt-8" style={{ display: 'inline-block' }}>View all {tasks.length} in workspace</Link>}
          </Card>
        </div>
      </div>

      <Drawer open={!!sel} onClose={() => open(null)} width={480} title={sel ? <span className="row">{sel.type} <span className="mono muted">{sel.id}</span></span> : ''}
        footer={sel && !closed ? (
          <div className="row-wrap" style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button size="sm" variant="danger" icon={<CalendarX />} onClick={() => cancel(sel)} disabled={!canEdit}>Cancel</Button>
            <Button size="sm" icon={<UserX />} onClick={() => setStatus(sel, 'No-show', 'Marked as no-show')} disabled={!canEdit || !started} title={started ? undefined : 'Available once the appointment has started'}>No-show</Button>
            <Button size="sm" icon={<Check />} onClick={() => setStatus(sel, 'Completed', 'Appointment completed')} disabled={!canEdit}>Mark completed</Button>
            {sel.status !== 'Confirmed' && <Button size="sm" variant="primary" icon={<CalendarCheck />} onClick={() => setStatus(sel, 'Confirmed', 'Appointment confirmed')} disabled={!canEdit}>Confirm</Button>}
          </div>
        ) : sel ? <Button size="sm" onClick={() => setStatus(sel, 'Scheduled', 'Appointment reopened')} disabled={!canEdit || new Date(sel.start) < NOW} title={new Date(sel.start) < NOW ? 'Past appointments can’t be reopened — reschedule instead' : undefined}>Reopen</Button> : undefined}>
        {sel && (
          <div className="col gap-16">
            <div className="row" style={{ gap: 12 }}>
              <div className="inset-box" style={{ textAlign: 'center', minWidth: 64, padding: '8px 10px', borderLeft: `3px solid ${APPT_COLOR[sel.status].fg}` }}>
                <div className="xs muted">{new Date(sel.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div className="mono strong" style={{ fontSize: 16 }}>{fmtTime(sel.start)}</div>
              </div>
              <div className="grow">
                <div className="row-wrap"><StatusBadge status={sel.status} /><Badge tone="outline">{sel.source}</Badge></div>
                <div className="small muted mt-4">{sel.durationMin} min · ends {fmtTime(new Date(+new Date(sel.start) + sel.durationMin * 60000))} · {fmtRelative(sel.start)}</div>
              </div>
              <Button size="sm" variant="ghost" icon={<Edit3 />} onClick={() => setEditing(sel)} disabled={!canEdit}>Edit</Button>
            </div>
            <Card title="Customer">
              {selLead ? (
                <>
                  <div className="row" style={{ marginBottom: 12 }}><Avatar name={selLead.name} /><div className="grow"><Link to={`/leads/${selLead.id}`} className="medium">{selLead.name}</Link><div className="cell-sub mono">{selLead.id} · {selLead.phone}</div></div><StatusBadge status={selLead.status} /></div>
                  <KV items={[
                    ['Product', selProduct ? `${selProduct.name} · ${fmtGBP(selProduct.monthlyPrice)}/mo` : '—'],
                    ['Sales rep', <span key="r" className="row gap-4"><Avatar name={selRep?.name} initials={selRep?.initials} size="sm" />{selRep?.name}</span>],
                    ['Type', sel.type], ['Booked by', sel.source],
                  ]} />
                </>
              ) : <div className="small muted">Lead record no longer exists.</div>}
            </Card>
            <div className="setting-row" style={{ padding: '4px 0', borderBottom: 0 }}>
              <div><div className="title row gap-4"><BellRing size={14} />Reminder</div><div className="desc">SMS + email to the customer 24h and 1h before</div></div>
              <Switch on={sel.reminder} onChange={(v) => { app.upsertAppointment({ ...sel, reminder: v }); app.toast(v ? 'Reminder on' : 'Reminder off', selLead?.name); }} disabled={!canEdit || closed} label="Reminder" />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Notes</div>
              <div className="inset-box small" style={{ color: 'var(--graphite)' }}>{sel.notes || <span className="muted">No notes.</span>}</div>
            </div>
            {!closed && canEdit && (
              resched ? (
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 10 }}>Reschedule</div>
                  <div className="form-grid" style={{ gap: 10 }}>
                    <Field label="New date"><input type="date" className="input sm" value={resched.date} min={toDateInput(NOW)} onChange={(e) => setResched({ ...resched, date: e.target.value, err: undefined })} /></Field>
                    <Field label="New time"><input type="time" step={900} className="input sm" value={resched.time} onChange={(e) => setResched({ ...resched, time: e.target.value, err: undefined })} /></Field>
                  </div>
                  {resched.err && <div className="field-error mt-8">{resched.err}</div>}
                  <div className="row mt-12" style={{ justifyContent: 'flex-end' }}><Button size="sm" variant="ghost" onClick={() => setResched(null)}>Back</Button><Button size="sm" onClick={() => saveResched(sel)}>Save new time</Button></div>
                </div>
              ) : <Button size="sm" icon={<CalendarRange />} onClick={() => { const d = new Date(Math.max(+new Date(sel.start), +NOW + DAY)); setResched({ date: toDateInput(d), time: toTimeInput(new Date(sel.start)) }); }}>Reschedule…</Button>
            )}
          </div>
        )}
      </Drawer>

      <ScheduleModal open={creating} onClose={() => setCreating(false)} defaultRepId={repF || undefined} onSaved={(a) => { setCursor(startOfDay(new Date(a.start))); open(a.id); }} />
      <ScheduleModal open={!!editing} onClose={() => setEditing(null)} appt={editing} />
    </>
  );
}
