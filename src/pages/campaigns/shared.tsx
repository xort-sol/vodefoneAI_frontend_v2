// Shared helpers for the Campaigns module (list, wizard, detail, calling centre).
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useApp } from '../../store/store';
import { Button, Field, Modal, useConfirm } from '../../components/ui';
import { downloadFile, fmtDate, fmtDateTime, toCSV } from '../../lib/format';
import { NOW, startOfDay } from '../../data/seed';
import type { Call, Campaign } from '../../data/types';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const TIMEZONES = ['Europe/London', 'Europe/Dublin', 'Europe/Amsterdam', 'UTC'];
export const VOICEMAIL_POLICIES = ['Do not leave a message', 'Leave approved compliant message', 'Hang up and retry later'] as const;

export const spendOf = (c: Campaign) => c.minutes * c.costPerMinute;
export const pctOf = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const isToday = (iso: string) => startOfDay(new Date(iso)).getTime() === startOfDay(NOW).getTime() || new Date(iso).toDateString() === new Date().toDateString();
export const daysRange = (days: string[]) => {
  const idx = days.map((d) => WEEKDAYS.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (!idx.length) return '—';
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return contiguous && idx.length > 2 ? `${WEEKDAYS[idx[0]]}–${WEEKDAYS[idx[idx.length - 1]]}` : idx.map((i) => WEEKDAYS[i]).join(', ');
};

/* Extra wizard configuration that the shared Campaign model does not carry.
   Kept module-local (would be persisted by the campaign service in production). */
export interface CampaignExtras {
  objective: string; owner: string; pitch: string[]; questions: string[]; hotThreshold: number; warmThreshold: number;
  voicemail: (typeof VOICEMAIL_POLICIES)[number]; filters?: string;
}
const extras = new Map<string, CampaignExtras>();
export const setCampaignExtras = (id: string, e: CampaignExtras) => { extras.set(id, e); };
export const getCampaignExtras = (id: string) => extras.get(id);

export function callsCSV(calls: Call[], app: ReturnType<typeof useApp>) {
  return toCSV(calls.map((c) => ({
    call_id: c.id, started_at: c.startedAt, lead_id: c.leadId, customer: app.leadById.get(c.leadId)?.name ?? '',
    campaign: app.campaignById.get(c.campaignId)?.name ?? c.campaignId, agent: app.agentById.get(c.agentId)?.name ?? c.agentId,
    outcome: c.outcome, connected: c.connected ? 'yes' : 'no', duration_s: c.duration, score: c.score, sentiment: c.sentiment,
    cost_gbp: c.cost.toFixed(3), failure_reason: c.failureReason ?? '', simulated: 'yes',
  })));
}

/** Common campaign lifecycle actions with RBAC, confirmation, audit and toasts. */
export function useCampaignActions() {
  const app = useApp(); const nav = useNavigate(); const confirm = useConfirm();
  const canManage = app.can('campaigns.manage');
  const denied = 'Your role cannot manage campaigns';
  const pause = (c: Campaign) => {
    app.updateCampaign(c.id, { status: 'Paused' });
    const ending = app.live.filter((l) => l.campaignId === c.id && !l.takenOver);
    app.audit('Paused campaign', c.name, 'Campaign');
    app.toast('Campaign paused', ending.length ? `${ending.length} in-progress simulated calls will finish; no new calls will start.` : `${c.name} will not place new calls.`);
  };
  const resume = (c: Campaign) => {
    app.updateCampaign(c.id, { status: 'Active' });
    app.audit(c.status === 'Paused' ? 'Resumed campaign' : 'Launched campaign', c.name, 'Campaign');
    app.toast(c.status === 'Paused' ? 'Campaign resumed' : 'Campaign launched', `${c.name} is now active (simulated calling).`);
  };
  const stop = async (c: Campaign) => {
    const ok = await confirm({ title: `Stop “${c.name}”?`, desc: 'Stopping ends the campaign permanently. Queued leads will not be called and the campaign cannot be resumed. In-progress simulated calls will be allowed to finish.', confirmLabel: 'Stop campaign', danger: true });
    if (!ok) return;
    app.updateCampaign(c.id, { status: 'Stopped', endDate: new Date().toISOString() });
    app.audit('Stopped campaign', c.name, 'Campaign');
    app.toast('Campaign stopped', c.name);
  };
  const duplicate = (c: Campaign) => nav(`/campaigns/new?duplicate=${c.id}`);
  const exportCalls = (c: Campaign) => {
    const rows = app.calls.filter((x) => x.campaignId === c.id);
    if (!rows.length) { app.toast('Nothing to export', 'This campaign has no calls yet.', 'info'); return; }
    downloadFile(`${c.id}-calls.csv`, callsCSV(rows, app));
    app.audit('Exported campaign calls', `${c.name} (${rows.length} rows)`, 'Export');
    app.toast('Export ready', `${rows.length.toLocaleString('en-GB')} calls exported as CSV.`);
  };
  return { canManage, denied, pause, resume, stop, duplicate, exportCalls };
}

/** Quick edit of a campaign's operational settings. */
export function EditCampaignModal({ campaign, open, onClose, showName = true }: { campaign: Campaign | null; open: boolean; onClose: () => void; showName?: boolean }) {
  const app = useApp();
  const [f, setF] = useState(() => draftOf(campaign));
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setF(draftOf(campaign)); setTouched(false); } }, [open, campaign?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!campaign) return null;
  const errs: Record<string, string> = {};
  if (!f.name.trim()) errs.name = 'Name is required';
  if (!f.days.length) errs.days = 'Select at least one calling day';
  if (toMin(f.end) <= toMin(f.start)) errs.end = 'End time must be after start time';
  if (f.concurrency < 1 || f.concurrency > 50) errs.concurrency = 'Between 1 and 50';
  if (f.dailyCap < 1) errs.dailyCap = 'Must be at least 1';
  if (f.maxAttempts < 1 || f.maxAttempts > 6) errs.maxAttempts = 'Between 1 and 6 (Ofcom guidance)';
  if (f.intervalHours < 1) errs.intervalHours = 'At least 1 hour';
  const hours = app.settings.callingHours;
  const outside = toMin(f.start) < toMin(hours.start) || toMin(f.end) > toMin(hours.end) || f.days.some((d) => !hours.days.includes(d));
  const save = () => {
    setTouched(true);
    if (Object.keys(errs).length) return;
    app.updateCampaign(campaign.id, {
      name: f.name.trim(), concurrency: f.concurrency, dailyCap: f.dailyCap,
      retry: { maxAttempts: f.maxAttempts, intervalHours: f.intervalHours },
      schedule: { ...campaign.schedule, days: f.days, start: f.start, end: f.end },
    });
    app.audit('Edited campaign settings', f.name.trim(), 'Campaign');
    app.toast('Campaign updated', f.name.trim());
    onClose();
  };
  const e = (k: string) => (touched ? errs[k] : undefined);
  return (
    <Modal open={open} onClose={onClose} title="Edit campaign" desc={<span className="mono">{campaign.id}</span>} footer={<>
      <Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save changes</Button>
    </>}>
      <div className="col gap-16">
        {showName && <Field label="Campaign name" required error={e('name')}><input className={`input ${e('name') ? 'invalid' : ''}`} value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></Field>}
        <Field label="Calling days" error={e('days')}>
          <DayChips value={f.days} onChange={(days) => setF({ ...f, days })} />
        </Field>
        <div className="form-grid">
          <Field label="Window start"><input type="time" className="input" value={f.start} onChange={(ev) => setF({ ...f, start: ev.target.value })} /></Field>
          <Field label="Window end" error={e('end')}><input type="time" className={`input ${e('end') ? 'invalid' : ''}`} value={f.end} onChange={(ev) => setF({ ...f, end: ev.target.value })} /></Field>
          <Field label="Concurrent calls" error={e('concurrency')} hint={`Workspace limit ${app.settings.maxConcurrent}`}><input type="number" min={1} className="input" value={f.concurrency} onChange={(ev) => setF({ ...f, concurrency: +ev.target.value })} /></Field>
          <Field label="Daily call cap" error={e('dailyCap')}><input type="number" min={1} className="input" value={f.dailyCap} onChange={(ev) => setF({ ...f, dailyCap: +ev.target.value })} /></Field>
          <Field label="Max attempts per lead" error={e('maxAttempts')}><input type="number" min={1} max={6} className="input" value={f.maxAttempts} onChange={(ev) => setF({ ...f, maxAttempts: +ev.target.value })} /></Field>
          <Field label="Retry interval (hours)" error={e('intervalHours')}><input type="number" min={1} className="input" value={f.intervalHours} onChange={(ev) => setF({ ...f, intervalHours: +ev.target.value })} /></Field>
        </div>
        {outside && <div className="banner warn"><AlertTriangle />Schedule falls outside workspace calling hours ({hours.days.join(', ')} {hours.start}–{hours.end}). Calls outside policy hours are blocked automatically.</div>}
      </div>
    </Modal>
  );
}
function draftOf(c: Campaign | null) {
  return {
    name: c?.name ?? '', days: c?.schedule.days ?? [], start: c?.schedule.start ?? '09:00', end: c?.schedule.end ?? '18:00',
    concurrency: c?.concurrency ?? 4, dailyCap: c?.dailyCap ?? 200, maxAttempts: c?.retry.maxAttempts ?? 3, intervalHours: c?.retry.intervalHours ?? 24,
  };
}

export function DayChips({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="row-wrap" style={{ gap: 6 }}>
      {WEEKDAYS.map((d) => {
        const on = value.includes(d);
        return (
          <button key={d} type="button" disabled={disabled} aria-pressed={on}
            className={`btn sm ${on ? 'primary' : ''}`} style={{ minWidth: 48 }}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || value.includes(x)))}>{d}</button>
        );
      })}
    </div>
  );
}

/** Timeline-friendly history synthesised from audit entries + lifecycle events. */
export function campaignHistory(c: Campaign, app: ReturnType<typeof useApp>) {
  type Ev = { at: string; title: string; actor: string; detail?: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'neutral' };
  const ev: Ev[] = [];
  const start = new Date(c.startDate);
  ev.push({ at: new Date(start.getTime() - 3 * 86400000).toISOString(), title: 'Campaign created', actor: c.createdBy, detail: `${c.segment} · ${app.productById.get(c.productId)?.name ?? ''}`, tone: 'neutral' });
  if (!['Draft'].includes(c.status)) ev.push({ at: new Date(start.getTime() - 2 * 86400000).toISOString(), title: 'Lead list attached', actor: c.createdBy, detail: `${c.totalLeads.toLocaleString('en-GB')} leads after compliance screening`, tone: 'neutral' });
  if (c.status === 'Scheduled') ev.push({ at: new Date(start.getTime() - 86400000).toISOString(), title: `Scheduled to launch ${fmtDate(c.startDate)}`, actor: c.createdBy, tone: 'blue' });
  if (!['Draft', 'Scheduled'].includes(c.status) && start <= new Date()) ev.push({ at: c.startDate, title: 'Campaign launched', actor: c.createdBy, detail: `Agent ${app.agentById.get(c.agentId)?.name ?? ''} · ${c.concurrency} concurrent · cap ${c.dailyCap}/day`, tone: 'green' });
  const cc = app.calls.filter((x) => x.campaignId === c.id);
  const firstQ = [...cc].reverse().find((x) => x.outcome === 'Qualified');
  if (firstQ) ev.push({ at: firstQ.startedAt, title: 'First qualified lead', actor: 'AI agent', detail: `${app.leadById.get(firstQ.leadId)?.name ?? ''} · ${firstQ.id}`, tone: 'green' });
  if (c.status === 'Completed') ev.push({ at: c.endDate, title: 'Campaign completed', actor: 'System', detail: 'End date reached; remaining retries cancelled.', tone: 'green' });
  for (const a of app.auditLog) {
    if (a.target.includes(c.name) || a.target.includes(c.id)) {
      const tone = /stop/i.test(a.action) ? 'red' : /pause/i.test(a.action) ? 'amber' : /launch|resum/i.test(a.action) ? 'green' : 'blue';
      ev.push({ at: a.at, title: a.action, actor: a.actor, detail: a.target === c.name ? undefined : a.target, tone });
    }
  }
  if (c.status === 'Paused' && !ev.some((e) => /pause/i.test(e.title))) ev.push({ at: new Date(Date.now() - 5 * 3600000).toISOString(), title: 'Paused campaign', actor: c.createdBy, tone: 'amber' });
  return ev.sort((a, b) => +new Date(b.at) - +new Date(a.at)).map((e) => ({ ...e, when: fmtDateTime(e.at) }));
}

/** Mobile fix: let the page-head title take the full row on narrow screens (scoped to this module's pages). */
export const MOBILE_HEAD_CSS = `@media (max-width: 720px) { .vf-ph .page-head > .grow { flex-basis: 100%; } }`;
export function ModulePage({ children }: { children: React.ReactNode }) {
  return <div className="vf-ph"><style>{MOBILE_HEAD_CSS}</style>{children}</div>;
}
