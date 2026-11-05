// Shared helpers, constants and modals for the Leads / Qualified / Workspace / Appointments modules.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, ShieldAlert } from 'lucide-react';
import { useApp } from '../../store/store';
import { Avatar, Button, Field, Modal, StatusBadge, Switch } from '../../components/ui';
import type { Appointment, Call, CustomerType, Lead, LeadStatus, Task, TeamMember } from '../../data/types';
import { DAY, NOW } from '../../data/seed';
import { fmtDateShort, fmtTime, fmtWeekday } from '../../lib/format';

/* ---------------- constants ---------------- */
export const LEAD_STATUSES: LeadStatus[] = ['New', 'Queued', 'Contacted', 'Hot', 'Warm', 'Cold', 'Not interested', 'Unreachable', 'Callback requested', 'Converted', 'Do not call'];
export const CUSTOMER_TYPES: CustomerType[] = ['Consumer', 'SME', 'Business', 'Enterprise'];
export const SOURCES: Lead['source'][] = ['CRM export', 'Web form', 'Retail store', 'Contract renewal', 'Partner referral', 'CSV import'];
export const TAGS = ['High value', 'Renewal due', 'Family plan', 'Multi-line', 'Price sensitive', 'Early adopter', 'Loyal 5y+', 'Retention risk', 'Bundle eligible'];
export const APPT_TYPES: Appointment['type'][] = ['Sales call', 'Callback', 'Store visit', 'Video consultation', 'Follow-up task'];
export const APPT_STATUSES: Appointment['status'][] = ['Scheduled', 'Confirmed', 'Completed', 'Rescheduled', 'Cancelled', 'No-show'];
export const APPT_COLOR: Record<Appointment['status'], { fg: string; bg: string }> = {
  Scheduled: { fg: '#2563EB', bg: '#EEF4FF' },
  Confirmed: { fg: '#16A34A', bg: '#ECFDF3' },
  Completed: { fg: '#737373', bg: '#F5F5F5' },
  Rescheduled: { fg: '#7C3AED', bg: '#F5F3FF' },
  Cancelled: { fg: '#DC2626', bg: '#FEF2F2' },
  'No-show': { fg: '#EA580C', bg: '#FFF7ED' },
};
export const ENGAGED: LeadStatus[] = ['Hot', 'Warm', 'Callback requested'];

/* ---------------- small utils ---------------- */
const pad2 = (n: number) => String(n).padStart(2, '0');
export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const toTimeInput = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fromInputs = (date: string, time: string) => new Date(`${date}T${time || '00:00'}:00`);
export const newId = (p: string) => `${p}-${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 10)}`;
export const fmtSlot = (iso: string | Date) => `${fmtWeekday(iso)} ${fmtDateShort(iso)}, ${fmtTime(iso)}`;
export const isToday = (iso: string | Date) => new Date(iso).toDateString() === NOW.toDateString();
export const uniq = <T,>(a: T[]) => Array.from(new Set(a));

export function normaliseUKPhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, '');
  let rest: string | null = null;
  if (/^\+44\d+$/.test(s)) rest = s.slice(3);
  else if (/^0044\d+$/.test(s)) rest = s.slice(4);
  else if (/^44\d{10}$/.test(s)) rest = s.slice(2);
  else if (/^0\d+$/.test(s)) rest = s.slice(1);
  if (rest === null) return null;
  if (rest.startsWith('0')) rest = rest.slice(1);
  if (!/^[1237]\d{9}$/.test(rest)) return null;
  return `+44 ${rest.slice(0, 4)} ${rest.slice(4, 7)} ${rest.slice(7)}`;
}
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function useReps(): TeamMember[] {
  const app = useApp();
  return useMemo(() => app.team.filter((t) => t.role === 'Sales Representative'), [app.team]);
}

export function useCallsByLead(): Map<string, Call[]> {
  const app = useApp();
  return useMemo(() => {
    const m = new Map<string, Call[]>();
    for (const c of app.calls) { const a = m.get(c.leadId); if (a) a.push(c); else m.set(c.leadId, [c]); }
    for (const a of m.values()) a.sort((x, y) => +new Date(y.startedAt) - +new Date(x.startedAt));
    return m;
  }, [app.calls]);
}

/** Rep avatar + name cell. */
export function RepCell({ repId }: { repId: string | null }) {
  const app = useApp();
  const r = repId ? app.memberById.get(repId) : undefined;
  if (!r) return <span className="muted small">Unassigned</span>;
  return <span className="row" style={{ gap: 6 }}><Avatar name={r.name} initials={r.initials} size="sm" /><span className="small truncate">{r.name}</span></span>;
}

/* ---------------- Lead picker (search select) ---------------- */
export function LeadPicker({ value, onChange, invalid }: { value: string; onChange: (id: string) => void; invalid?: boolean }) {
  const app = useApp();
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false);
  const sel = value ? app.leadById.get(value) : undefined;
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pool = app.leads.filter((l) => !l.archived);
    if (!s) return pool.filter((l) => ENGAGED.includes(l.status)).slice(0, 8);
    const digits = s.replace(/\s/g, '');
    return pool.filter((l) => l.name.toLowerCase().includes(s) || l.id.toLowerCase().includes(s) || (digits.length > 2 && l.phone.replace(/\s/g, '').includes(digits))).slice(0, 8);
  }, [q, app.leads]);
  if (sel) {
    return (
      <div className="row between inset-box" style={{ padding: '6px 10px' }}>
        <div className="row" style={{ minWidth: 0 }}><Avatar name={sel.name} size="sm" /><span className="medium truncate">{sel.name}</span><span className="mono muted">{sel.id}</span></div>
        <Button size="xs" variant="ghost" onClick={() => onChange('')}>Change</Button>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <div className="input-wrap">
        <Search />
        <input className={`input ${invalid ? 'invalid' : ''}`} value={q} placeholder="Search by name, phone or lead ID…" onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} aria-label="Search leads" />
      </div>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 260, overflowY: 'auto' }}>
          {!q && <div className="menu-label label">Engaged leads</div>}
          {results.map((l) => (
            <button key={l.id} type="button" className="menu-item" onMouseDown={(e) => { e.preventDefault(); onChange(l.id); setQ(''); setOpen(false); }}>
              <span className="grow truncate">{l.name} <span className="mono muted">{l.id}</span></span><StatusBadge status={l.status} dot={false} />
            </button>
          ))}
          {!results.length && <div className="small muted" style={{ padding: 10 }}>No leads match “{q}”.</div>}
        </div>
      )}
    </div>
  );
}

/* ---------------- Add / edit lead ---------------- */
interface LeadForm {
  name: string; phone: string; email: string; city: string; customerType: CustomerType; productInterest: string; campaignId: string;
  source: Lead['source']; tags: string[]; consent: boolean; assignedRepId: string; currentPlan: string;
}
export function LeadFormModal({ open, onClose, lead, onSaved }: { open: boolean; onClose: () => void; lead?: Lead | null; onSaved?: (l: Lead) => void }) {
  const app = useApp(); const reps = useReps();
  const init = (): LeadForm => ({
    name: lead?.name ?? '', phone: lead?.phone ?? '', email: lead?.email ?? '', city: lead?.city ?? '', customerType: lead?.customerType ?? 'Consumer',
    productInterest: lead?.productInterest ?? '', campaignId: lead?.campaignId ?? '', source: lead?.source ?? 'Web form', tags: lead?.tags ?? [],
    consent: lead?.consent ?? false, assignedRepId: lead?.assignedRepId ?? '', currentPlan: lead?.currentPlan ?? '',
  });
  const [f, setF] = useState<LeadForm>(init);
  const [touched, setTouched] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setF(init()); setTouched(false); } }, [open, lead?.id]);
  const set = <K extends keyof LeadForm>(k: K, v: LeadForm[K]) => setF((x) => ({ ...x, [k]: v }));

  const phoneNorm = normaliseUKPhone(f.phone);
  const dup = phoneNorm ? app.leads.find((l) => l.phone === phoneNorm && l.id !== lead?.id) : undefined;
  const suppressed = phoneNorm ? app.suppressions.some((s) => s.phone === phoneNorm) : false;
  const errors: Partial<Record<keyof LeadForm, string>> = {};
  if (f.name.trim().length < 2) errors.name = 'Enter the customer’s full name';
  if (!f.phone.trim()) errors.phone = 'Phone number is required';
  else if (!phoneNorm) errors.phone = 'Enter a valid UK number, e.g. 07700 900123 or +44 7700 900123';
  else if (dup) errors.phone = `Duplicate — already on ${dup.name} (${dup.id})`;
  if (!f.email.trim()) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(f.email.trim())) errors.email = 'Enter a valid email address';
  if (!f.productInterest) errors.productInterest = 'Choose the product the customer is interested in';
  if (!lead && !f.consent) errors.consent = 'Consent must be confirmed before a lead can be added';
  const valid = Object.keys(errors).length === 0;
  const err = (k: keyof LeadForm) => (touched ? errors[k] : undefined);

  const save = () => {
    setTouched(true);
    if (!valid || !phoneNorm) return;
    const patch = {
      name: f.name.trim(), phone: phoneNorm, email: f.email.trim().toLowerCase(), city: f.city.trim() || 'London', customerType: f.customerType,
      productInterest: f.productInterest, campaignId: f.campaignId || null, source: f.source, tags: f.tags, consent: f.consent,
      assignedRepId: f.assignedRepId || null, currentPlan: f.currentPlan.trim() || 'Unknown', dnc: suppressed || (lead?.dnc ?? false),
    };
    if (lead) {
      app.updateLead(lead.id, patch);
      app.audit('Edited lead', `${patch.name} (${lead.id})`, 'Data');
      app.toast('Lead updated', `${patch.name} · ${lead.id}`);
      onSaved?.({ ...lead, ...patch });
    } else {
      const created = app.addLead({
        ...patch, tenureMonths: 0, status: suppressed ? 'Do not call' : f.campaignId ? 'Queued' : 'New', score: 0, sentiment: 'Neutral', lastCallAt: null,
        attempts: 0, nextFollowUp: null, createdAt: new Date().toISOString(), notes: [], aiSummary: '',
      });
      app.audit('Created lead', `${created.name} (${created.id})`, 'Data');
      app.toast('Lead added', `${created.name} · ${created.id}${f.campaignId ? ' · queued for campaign' : ''}`);
      onSaved?.(created);
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={lead ? `Edit lead · ${lead.id}` : 'Add lead'} desc={lead ? undefined : 'Create a single lead record. Consent and suppression are checked before any simulated call.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{lead ? 'Save changes' : 'Add lead'}</Button></>}>
      <div className="form-grid">
        <Field label="Full name" required error={err('name')}><input className={`input ${err('name') ? 'invalid' : ''}`} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Amelia Hughes" /></Field>
        <Field label="Mobile / phone (UK)" required error={err('phone')} hint={phoneNorm ? `Stored as ${phoneNorm}` : undefined}><input className={`input ${err('phone') ? 'invalid' : ''}`} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07700 900123" inputMode="tel" /></Field>
        <Field label="Email" required error={err('email')}><input className={`input ${err('email') ? 'invalid' : ''}`} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.co.uk" type="email" /></Field>
        <Field label="City"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Manchester" /></Field>
        <Field label="Customer type"><select className="select" value={f.customerType} onChange={(e) => set('customerType', e.target.value as CustomerType)}>{CUSTOMER_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Current plan"><input className="input" value={f.currentPlan} onChange={(e) => set('currentPlan', e.target.value)} placeholder="e.g. Red Entertainment 20GB" /></Field>
        <Field label="Interested product" required error={err('productInterest')}>
          <select className={`select ${err('productInterest') ? 'invalid' : ''}`} value={f.productInterest} onChange={(e) => set('productInterest', e.target.value)}>
            <option value="">Select product…</option>
            {app.products.filter((p) => p.availability !== 'Retired').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Campaign" hint="Leads in a campaign are queued for simulated AI calls">
          <select className="select" value={f.campaignId} onChange={(e) => { const c = app.campaignById.get(e.target.value); setF((x) => ({ ...x, campaignId: e.target.value, productInterest: x.productInterest || c?.productId || '' })); }}>
            <option value="">No campaign</option>
            {app.campaigns.filter((c) => !['Completed', 'Stopped'].includes(c.status)).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}
          </select>
        </Field>
        <Field label="Source"><select className="select" value={f.source} onChange={(e) => set('source', e.target.value as Lead['source'])}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Assigned rep"><select className="select" value={f.assignedRepId} onChange={(e) => set('assignedRepId', e.target.value)} disabled={!app.can('leads.assign')} title={app.can('leads.assign') ? undefined : 'Your role cannot assign leads'}><option value="">Unassigned</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.team}</option>)}</select></Field>
        <div className="span-all">
          <div className="field-label" style={{ marginBottom: 6 }}>Tags</div>
          <div className="row-wrap">
            {TAGS.map((t) => {
              const on = f.tags.includes(t);
              return <button key={t} type="button" className="tag" style={on ? { borderColor: 'var(--ink)', color: 'var(--ink)', background: 'var(--mist)' } : { cursor: 'pointer' }} onClick={() => set('tags', on ? f.tags.filter((x) => x !== t) : [...f.tags, t])} aria-pressed={on}>{t}</button>;
            })}
          </div>
        </div>
        <div className="span-all">
          {suppressed && <div className="banner warn" style={{ marginBottom: 12 }}><ShieldAlert />This number is on the do-not-call suppression list. The lead will be saved as “Do not call” and excluded from all calling.</div>}
          <label className="row" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" className="checkbox" style={{ marginTop: 3 }} checked={f.consent} onChange={(e) => set('consent', e.target.checked)} />
            <span className="small"><span className="medium" style={{ color: 'var(--ink)' }}>Customer has given marketing consent for voice contact</span><br /><span className="muted">Consent is recorded with timestamp and source for PECR / UK GDPR audit.</span></span>
          </label>
          {err('consent') && <div className="field-error mt-4">{err('consent')}</div>}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Schedule / edit appointment ---------------- */
interface ApptForm { leadId: string; repId: string; type: Appointment['type']; date: string; time: string; duration: number; notes: string; reminder: boolean }
export function ScheduleModal({ open, onClose, leadId, appt, defaultRepId, defaultType = 'Sales call', title, onSaved }: {
  open: boolean; onClose: () => void; leadId?: string; appt?: Appointment | null; defaultRepId?: string; defaultType?: Appointment['type']; title?: string; onSaved?: (a: Appointment) => void;
}) {
  const app = useApp(); const reps = useReps();
  const init = (): ApptForm => {
    const lead = leadId ? app.leadById.get(leadId) : appt ? app.leadById.get(appt.leadId) : undefined;
    const start = appt ? new Date(appt.start) : (() => { const d = new Date(NOW.getTime() + DAY); d.setHours(10, 0, 0, 0); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d; })();
    return {
      leadId: appt?.leadId ?? leadId ?? '', repId: appt?.repId ?? lead?.assignedRepId ?? defaultRepId ?? reps[0]?.id ?? '', type: appt?.type ?? defaultType,
      date: toDateInput(start), time: toTimeInput(start), duration: appt?.durationMin ?? 30, notes: appt?.notes ?? '', reminder: appt?.reminder ?? true,
    };
  };
  const [f, setF] = useState<ApptForm>(init);
  const [touched, setTouched] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setF(init()); setTouched(false); } }, [open, leadId, appt?.id]);
  const set = <K extends keyof ApptForm>(k: K, v: ApptForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const start = f.date && f.time ? fromInputs(f.date, f.time) : null;
  const errors: Partial<Record<keyof ApptForm, string>> = {};
  if (!f.leadId) errors.leadId = 'Choose a lead';
  if (!f.repId) errors.repId = 'Choose a sales rep';
  if (!f.date) errors.date = 'Choose a date';
  if (!f.time) errors.time = 'Choose a time';
  else if (f.time < '08:00' || f.time > '18:45') errors.time = 'Appointments run between 08:00 and 19:00';
  if (start && start < NOW && !errors.time) errors.date = 'Choose a time in the future';
  if (start && start.getDay() === 0) errors.date = 'No appointments on Sundays';
  if (!(f.duration >= 10 && f.duration <= 120)) errors.duration = '10–120 minutes';
  const clash = start && f.repId ? app.appointments.find((a) => a.id !== appt?.id && a.repId === f.repId && ['Scheduled', 'Confirmed', 'Rescheduled'].includes(a.status)
    && new Date(a.start) < new Date(start.getTime() + f.duration * 60000) && new Date(new Date(a.start).getTime() + a.durationMin * 60000) > start) : undefined;
  const err = (k: keyof ApptForm) => (touched ? errors[k] : undefined);

  const save = () => {
    setTouched(true);
    if (Object.keys(errors).length || !start) return;
    const moved = appt && new Date(appt.start).getTime() !== start.getTime();
    const a: Appointment = {
      id: appt?.id ?? newId('AP'), leadId: f.leadId, repId: f.repId, type: f.type, start: start.toISOString(), durationMin: f.duration,
      status: appt ? (moved ? 'Rescheduled' : appt.status) : 'Scheduled', notes: f.notes, source: appt?.source ?? 'Sales rep', reminder: f.reminder,
    };
    app.upsertAppointment(a);
    const lead = app.leadById.get(f.leadId);
    if (lead && (!lead.nextFollowUp || new Date(lead.nextFollowUp) < NOW || new Date(lead.nextFollowUp) > start)) app.updateLead(lead.id, { nextFollowUp: a.start });
    const rep = app.memberById.get(f.repId);
    app.audit(appt ? 'Updated appointment' : 'Scheduled appointment', `${a.id} · ${lead?.name ?? f.leadId}`, 'Data');
    app.toast(appt ? (moved ? 'Appointment rescheduled' : 'Appointment updated') : 'Appointment scheduled', `${lead?.name} · ${fmtSlot(a.start)} with ${rep?.name}${a.reminder ? ' · reminder on' : ''}`);
    onSaved?.(a);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title ?? (appt ? `Edit appointment · ${appt.id}` : 'New appointment')} size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{appt ? 'Save' : 'Schedule'}</Button></>}>
      <div className="form-grid">
        <div className="field span-all">
          <span className="field-label">Lead<span className="red"> *</span></span>
          {leadId || appt ? (() => { const l = app.leadById.get(f.leadId); return <div className="row inset-box" style={{ padding: '6px 10px' }}><Avatar name={l?.name} size="sm" /><span className="medium">{l?.name}</span><span className="mono muted">{f.leadId}</span>{l && <StatusBadge status={l.status} />}</div>; })()
            : <LeadPicker value={f.leadId} onChange={(id) => { const l = app.leadById.get(id); setF((x) => ({ ...x, leadId: id, repId: l?.assignedRepId ?? x.repId })); }} invalid={!!err('leadId')} />}
          {err('leadId') && <span className="field-error">{err('leadId')}</span>}
        </div>
        <Field label="Sales rep" required error={err('repId')}><select className={`select ${err('repId') ? 'invalid' : ''}`} value={f.repId} onChange={(e) => set('repId', e.target.value)}><option value="">Select rep…</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.team}</option>)}</select></Field>
        <Field label="Type"><select className="select" value={f.type} onChange={(e) => set('type', e.target.value as Appointment['type'])}>{APPT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Date" required error={err('date')}><input type="date" className={`input ${err('date') ? 'invalid' : ''}`} value={f.date} min={toDateInput(NOW)} onChange={(e) => set('date', e.target.value)} /></Field>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Field label="Time" required error={err('time')} className="grow"><input type="time" step={900} className={`input ${err('time') ? 'invalid' : ''}`} value={f.time} onChange={(e) => set('time', e.target.value)} /></Field>
          <Field label="Duration" error={err('duration')} className="grow"><select className="select" value={f.duration} onChange={(e) => set('duration', +e.target.value)}>{[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}</select></Field>
        </div>
        <Field label="Notes" className="span-all"><textarea className="textarea" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Agenda, customer preferences, documents to prepare…" /></Field>
        <div className="span-all row between">
          <div><div className="medium small" style={{ color: 'var(--ink)' }}>Send reminder</div><div className="xs muted">SMS + email reminder 24h and 1h before (queued via notification service)</div></div>
          <Switch on={f.reminder} onChange={(v) => set('reminder', v)} label="Send reminder" />
        </div>
        {clash && <div className="span-all banner warn"><AlertTriangle />{app.memberById.get(f.repId)?.name} already has {clash.type.toLowerCase()} {clash.id} at {fmtTime(clash.start)} that overlaps this slot.</div>}
      </div>
    </Modal>
  );
}

/* ---------------- Task modal ---------------- */
export function TaskModal({ open, onClose, leadId, defaultRepId }: { open: boolean; onClose: () => void; leadId: string; defaultRepId?: string | null }) {
  const app = useApp(); const reps = useReps();
  const tomorrow = new Date(NOW.getTime() + DAY);
  const [title, setTitle] = useState(''); const [date, setDate] = useState(toDateInput(tomorrow)); const [time, setTime] = useState('10:00');
  const [priority, setPriority] = useState<Task['priority']>('Medium'); const [repId, setRepId] = useState(defaultRepId ?? '');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setTitle(''); setDate(toDateInput(tomorrow)); setTime('10:00'); setPriority('Medium'); setRepId(defaultRepId ?? reps[0]?.id ?? ''); setTouched(false); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const e = { title: title.trim().length < 3 ? 'Describe the task (min. 3 characters)' : '', date: !date ? 'Choose a due date' : '', rep: !repId ? 'Choose an owner' : '' };
  const save = () => {
    setTouched(true);
    if (e.title || e.date || e.rep) return;
    const t: Task = { id: newId('TK'), leadId, repId, title: title.trim(), due: fromInputs(date, time).toISOString(), priority, done: false };
    app.upsertTask(t);
    app.toast('Task added', `${t.title} · due ${fmtSlot(t.due)}`);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add task" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add task</Button></>}>
      <div className="col gap-12">
        <Field label="Task" required error={touched && e.title}><input className={`input ${touched && e.title ? 'invalid' : ''}`} value={title} onChange={(x) => setTitle(x.target.value)} placeholder="e.g. Send tailored quote" autoFocus /></Field>
        <div className="form-grid">
          <Field label="Due date" required error={touched && e.date}><input type="date" className="input" value={date} onChange={(x) => setDate(x.target.value)} /></Field>
          <Field label="Time"><input type="time" className="input" value={time} onChange={(x) => setTime(x.target.value)} /></Field>
          <Field label="Priority"><select className="select" value={priority} onChange={(x) => setPriority(x.target.value as Task['priority'])}>{(['High', 'Medium', 'Low'] as const).map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Owner" required error={touched && e.rep}><select className="select" value={repId} onChange={(x) => setRepId(x.target.value)}><option value="">Select…</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        </div>
      </div>
    </Modal>
  );
}

/** Local layout fix: let page-header actions wrap below the title on phones (PageHeader is shared, so patched here). */
export function PageFix() {
  return <style>{'@media (max-width: 720px) { .page-head > .grow { flex-basis: 100%; } } .side-layout { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) 300px; } @media (max-width: 1100px) { .side-layout { grid-template-columns: minmax(0, 1fr); } }'}</style>;
}
