import { useState } from 'react';
import { CalendarClock, Mail, Play, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../store/store';
import { Badge, Button, Card, EmptyState, Field, Modal, Segmented, Switch, useConfirm } from '../../components/ui';
import { fmtRelative } from '../../lib/format';
import { useExport, type AnalyticsCtx, type SavedReport, type Schedule } from './common';

export const BUILT_IN_REPORTS = ['Executive summary', 'Call analytics', 'Lead analytics', 'AI agent performance', 'Cost analytics', 'Campaign comparison'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const SEED_SCHEDULES: Schedule[] = [
  { id: 'SCH-1001', report: 'Executive summary', frequency: 'Weekly', day: 'Monday', time: '08:00', recipients: ['sales.leadership@vodafone.co.uk', 'rachel.adeyemi@vodafone.co.uk'], format: 'PDF', active: true, lastRun: new Date(Date.now() - 3 * 86400000).toISOString(), createdBy: 'Rachel Adeyemi' },
  { id: 'SCH-1002', report: 'Cost analytics', frequency: 'Monthly', day: '1', time: '07:30', recipients: ['finance.ops@vodafone.co.uk'], format: 'Excel', active: true, lastRun: new Date(Date.now() - 5 * 86400000).toISOString(), createdBy: 'Tom Hargreaves' },
  { id: 'SCH-1003', report: 'AI agent performance', frequency: 'Daily', day: '', time: '18:30', recipients: ['qa.team@vodafone.co.uk'], format: 'CSV', active: false, lastRun: new Date(Date.now() - 12 * 86400000).toISOString(), createdBy: 'Sarah Mitchell' },
];

const describe = (s: Schedule) => s.frequency === 'Daily' ? `Every day at ${s.time}` : s.frequency === 'Weekly' ? `Every ${s.day} at ${s.time}` : `Day ${s.day} of each month at ${s.time}`;

export default function ScheduledTab({ ctx, saved, schedules, setSchedules }: { ctx: AnalyticsCtx; saved: SavedReport[]; schedules: Schedule[]; setSchedules: (f: (p: Schedule[]) => Schedule[]) => void }) {
  const app = useApp(); const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const can = app.can('reports.export');
  const why = !can ? 'Your role cannot manage scheduled reports' : undefined;

  useExport(ctx, () => ({ name: 'scheduled-reports', rows: schedules.map((s) => ({ id: s.id, report: s.report, schedule: describe(s), format: s.format, recipients: s.recipients.join('; '), active: s.active ? 'yes' : 'no' })) }));

  const toggle = (s: Schedule) => {
    setSchedules((p) => p.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)));
    app.audit(s.active ? 'Paused scheduled report' : 'Resumed scheduled report', s.report, 'Export');
    app.toast(s.active ? 'Schedule paused' : 'Schedule activated', s.report);
  };
  const remove = async (s: Schedule) => {
    if (!(await confirm({ title: 'Delete schedule?', desc: `“${s.report}” will no longer be sent to ${s.recipients.length} recipient${s.recipients.length > 1 ? 's' : ''}.`, confirmLabel: 'Delete schedule', danger: true }))) return;
    setSchedules((p) => p.filter((x) => x.id !== s.id));
    app.audit('Deleted scheduled report', s.report, 'Export');
    app.toast('Schedule deleted', s.report);
  };
  const runNow = (s: Schedule) => {
    setSchedules((p) => p.map((x) => (x.id === s.id ? { ...x, lastRun: new Date().toISOString() } : x)));
    app.toast('Report run queued', `${s.report} (${s.format}) will be emailed to ${s.recipients.length} recipient${s.recipients.length > 1 ? 's' : ''}.`, 'info');
  };

  return (
    <>
      <Card flush title="Scheduled reports" sub={`${schedules.filter((s) => s.active).length} active · delivered by email from reports@vodafone-ai-sales (demo)`}
        actions={<Button size="sm" variant="primary" icon={<Plus />} disabled={!can} title={why} onClick={() => setOpen(true)}>New schedule</Button>}>
        {schedules.length ? (
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead><tr><th>Report</th><th>Schedule</th><th>Format</th><th>Recipients</th><th>Last run</th><th>Active</th><th /></tr></thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Report"><div className="cell-primary">{s.report}</div><div className="mono xs muted">{s.id} · {s.createdBy}</div></td>
                    <td data-label="Schedule"><span className="row gap-4 small"><CalendarClock size={13} className="muted" />{describe(s)}</span></td>
                    <td data-label="Format"><Badge tone="outline">{s.format}</Badge></td>
                    <td data-label="Recipients" style={{ whiteSpace: 'normal' }}>
                      <div className="col" style={{ gap: 2 }}>{s.recipients.slice(0, 2).map((r) => <span key={r} className="mono xs">{r}</span>)}{s.recipients.length > 2 && <span className="xs muted">+{s.recipients.length - 2} more</span>}</div>
                    </td>
                    <td data-label="Last run" className="small muted">{s.lastRun ? fmtRelative(s.lastRun) : 'Never'}</td>
                    <td data-label="Active"><span title={why}><Switch on={s.active} disabled={!can} onChange={() => toggle(s)} label={`Toggle ${s.report}`} /></span></td>
                    <td data-label=""><span className="row" style={{ justifyContent: 'flex-end' }}>
                      <Button size="xs" icon={<Play />} disabled={!can} title={why} onClick={() => runNow(s)}>Run now</Button>
                      <Button size="xs" variant="ghost" iconOnly icon={<Trash2 />} disabled={!can} title={why ?? 'Delete schedule'} aria-label="Delete schedule" onClick={() => remove(s)} />
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={<Mail size={18} />} title="No scheduled reports" desc="Schedule a report to email it to stakeholders automatically." action={<Button size="sm" disabled={!can} onClick={() => setOpen(true)} icon={<Plus />}>New schedule</Button>} />}
      </Card>
      <div className="xs muted mt-12">Delivery is a backend integration point — in this demo, schedules are stored in your browser and no emails are sent.</div>
      {open && <ScheduleModal saved={saved} onClose={() => setOpen(false)} onCreate={(s) => { setSchedules((p) => [s, ...p]); app.audit('Created scheduled report', `${s.report} · ${describe(s)}`, 'Export'); app.toast('Schedule created', `${s.report} · ${describe(s)}`); setOpen(false); }} />}
    </>
  );
}

function ScheduleModal({ saved, onClose, onCreate }: { saved: SavedReport[]; onClose: () => void; onCreate: (s: Schedule) => void }) {
  const app = useApp();
  const [report, setReport] = useState(BUILT_IN_REPORTS[0]);
  const [frequency, setFrequency] = useState<Schedule['frequency']>('Weekly');
  const [day, setDay] = useState('Monday');
  const [monthDay, setMonthDay] = useState('1');
  const [time, setTime] = useState('08:00');
  const [recipients, setRecipients] = useState(app.me.email);
  const [format, setFormat] = useState<Schedule['format']>('PDF');
  const [touched, setTouched] = useState(false);

  const list = recipients.split(/[,;\s]+/).map((r) => r.trim()).filter(Boolean);
  const invalid = list.filter((r) => !EMAIL_RE.test(r));
  const recipErr = !list.length ? 'Add at least one recipient' : invalid.length ? `Invalid email: ${invalid.join(', ')}` : list.length > 20 ? 'Maximum 20 recipients' : '';
  const timeErr = !/^\d{2}:\d{2}$/.test(time) ? 'Choose a time' : '';
  const md = Number(monthDay);
  const dayErr = frequency === 'Monthly' && (!Number.isInteger(md) || md < 1 || md > 28) ? 'Use a day between 1 and 28' : '';

  const submit = () => {
    setTouched(true);
    if (recipErr || timeErr || dayErr) return;
    onCreate({ id: `SCH-${1000 + Math.floor(Math.random() * 8999)}`, report, frequency, day: frequency === 'Weekly' ? day : frequency === 'Monthly' ? String(md) : '', time, recipients: [...new Set(list.map((r) => r.toLowerCase()))], format, active: true, lastRun: null, createdBy: app.me.name });
  };

  return (
    <Modal open onClose={onClose} title="Schedule a report" desc="Email a report automatically on a recurring schedule." footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={submit}>Create schedule</Button>
    </>}>
      <div className="col gap-16">
        <Field label="Report" required>
          <select className="select" value={report} onChange={(e) => setReport(e.target.value)}>
            <optgroup label="Standard reports">{BUILT_IN_REPORTS.map((r) => <option key={r}>{r}</option>)}</optgroup>
            {saved.length > 0 && <optgroup label="Saved reports">{saved.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}</optgroup>}
          </select>
        </Field>
        <Field label="Frequency"><Segmented value={frequency} onChange={setFrequency} options={['Daily', 'Weekly', 'Monthly']} /></Field>
        <div className="form-grid">
          {frequency === 'Weekly' && <Field label="Day of week"><select className="select" value={day} onChange={(e) => setDay(e.target.value)}>{WEEKDAYS.map((d) => <option key={d}>{d}</option>)}</select></Field>}
          {frequency === 'Monthly' && <Field label="Day of month" error={touched && dayErr}><input className={`input ${touched && dayErr ? 'invalid' : ''}`} type="number" min={1} max={28} value={monthDay} onChange={(e) => setMonthDay(e.target.value)} /></Field>}
          <Field label="Time (Europe/London)" error={touched && timeErr}><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Recipients" required hint="Separate multiple emails with commas." error={touched && recipErr}>
          <textarea className={`textarea ${touched && recipErr ? 'invalid' : ''}`} rows={2} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="name@vodafone.co.uk, team@vodafone.co.uk" />
        </Field>
        <Field label="Format"><Segmented value={format} onChange={setFormat} options={['PDF', 'CSV', 'Excel']} /></Field>
      </div>
    </Modal>
  );
}
