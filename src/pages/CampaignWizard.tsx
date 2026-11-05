import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, Copy, Lock, Plus, Rocket, Save, CalendarClock, Trash2, Users, XCircle, ShieldCheck, FlaskConical,
} from 'lucide-react';
import { useApp } from '../store/store';
import { Avatar, Badge, Button, Card, Field, KV, PageHeader, Progress, SimBadge, StatusBadge, Switch } from '../components/ui';
import { fmtDate, fmtDur, fmtGBP, fmtInt, fmtPct } from '../lib/format';
import { DAY, NOW, startOfDay } from '../data/seed';
import type { Campaign, CustomerType, Lead } from '../data/types';
import { DayChips, TIMEZONES, VOICEMAIL_POLICIES, daysRange, getCampaignExtras, setCampaignExtras, toMin, type CampaignExtras, ModulePage } from './campaigns/shared';

const STEPS = ['Campaign information', 'Lead selection', 'AI agent', 'Product & offer', 'Qualification', 'Schedule & retry', 'Review & launch'] as const;
const OBJECTIVES = ['Renewal / recontract', 'New acquisition', 'Upsell / cross-sell', 'Retention / win-back', 'Appointment setting'];
const CUSTOMER_TYPES: CustomerType[] = ['Consumer', 'SME', 'Business', 'Enterprise'];
const SOURCES: Lead['source'][] = ['CRM export', 'Web form', 'Retail store', 'Contract renewal', 'Partner referral', 'CSV import'];
const GENERIC_PITCH = ['Price & monthly saving', 'Network reliability', 'Loyalty reward'];
const DEFAULT_QUESTIONS = ['When does your current contract end?', 'Roughly what do you pay per month today?', 'Are you the account holder / decision maker?'];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 9, 0, 0); };

interface Form {
  name: string; description: string; objective: string; owner: string; startDate: string; endDate: string;
  types: CustomerType[]; city: string; source: string; plan: string; minTenure: number; tags: string[]; excludeContacted: boolean; includeAssigned: boolean; limit: number;
  agentId: string; productId: string; offerId: string; pitch: string[];
  minScore: number; requireBudget: boolean; requireDecisionMaker: boolean; requireTimeline: boolean; hot: number; warm: number; questions: string[];
  days: string[]; start: string; end: string; timezone: string; concurrency: number; dailyCap: number; maxAttempts: number; intervalHours: number; voicemail: CampaignExtras['voicemail'];
}

export default function CampaignWizard() {
  const app = useApp(); const nav = useNavigate();
  const [sp] = useSearchParams();
  const dupId = sp.get('duplicate');
  const source = dupId ? app.campaignById.get(dupId) : undefined;
  const owners = app.team.filter((t) => ['Super Admin', 'Administrator', 'Sales Manager', 'Supervisor'].includes(t.role));

  const [form, setForm] = useState<Form>(() => initialForm(source, app.me.name, app.settings));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [step, setStep] = useState(0);
  const [showErr, setShowErr] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const canManage = app.can('campaigns.manage');

  // ---------- lead matching ----------
  const leadOpts = useMemo(() => ({
    cities: [...new Set(app.leads.map((l) => l.city))].sort(),
    plans: [...new Set(app.leads.map((l) => l.currentPlan))].sort(),
    tags: [...new Set(app.leads.flatMap((l) => l.tags))].sort(),
  }), [app.leads]);
  const match = useMemo(() => {
    const matched = app.leads.filter((l) => !l.archived
      && (!form.types.length || form.types.includes(l.customerType))
      && (!form.city || l.city === form.city) && (!form.source || l.source === form.source) && (!form.plan || l.currentPlan === form.plan)
      && l.tenureMonths >= (form.minTenure || 0)
      && (!form.tags.length || form.tags.some((t) => l.tags.includes(t)))
      && (!form.excludeContacted || l.attempts === 0));
    const reasons = new Map<string, number>();
    let assigned = 0; let compliance = 0;
    const eligible: Lead[] = [];
    for (const l of matched) {
      const camp = l.campaignId ? app.campaignById.get(l.campaignId) : undefined;
      if (!form.includeAssigned && camp && ['Active', 'Scheduled', 'Paused'].includes(camp.status)) { assigned++; continue; }
      const e = app.eligibility(l);
      if (!e.ok) { compliance++; e.reasons.forEach((r) => reasons.set(r.replace(/\(.*\)/, '').replace(/“.*”/, '(closed)').trim(), (reasons.get(r.replace(/\(.*\)/, '').replace(/“.*”/, '(closed)').trim()) ?? 0) + 1)); continue; }
      eligible.push(l);
    }
    eligible.sort((a, b) => b.tenureMonths - a.tenureMonths);
    const selected = form.limit > 0 ? eligible.slice(0, form.limit) : eligible;
    return { matched, assigned, compliance, reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]), eligible, selected };
  }, [app.leads, app.campaignById, app.eligibility, form.types, form.city, form.source, form.plan, form.minTenure, form.tags, form.excludeContacted, form.includeAssigned, form.limit]);

  const product = app.productById.get(form.productId);
  const agent = app.agentById.get(form.agentId);
  const offer = app.offers.find((o) => o.id === form.offerId);
  const productOffers = app.offers.filter((o) => o.status === 'Active' && o.productIds.includes(form.productId));
  const hours = app.settings.callingHours;
  const outsideHours = form.days.filter((d) => !hours.days.includes(d)).length > 0 || toMin(form.start) < toMin(hours.start) || toMin(form.end) > toMin(hours.end);
  const today = startOfDay(NOW);

  // ---------- validation ----------
  const errorsFor = (i: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (i === 0) {
      if (!form.name.trim()) e.name = 'Campaign name is required';
      else if (form.name.trim().length > 80) e.name = 'Keep the name under 80 characters';
      else if (app.campaigns.some((c) => c.name.toLowerCase() === form.name.trim().toLowerCase())) e.name = 'A campaign with this name already exists';
      if (!form.objective) e.objective = 'Choose an objective';
      if (!form.owner) e.owner = 'Choose an owner';
      if (!form.startDate) e.startDate = 'Start date is required';
      else if (fromYmd(form.startDate) < today) e.startDate = 'Start date cannot be in the past';
      if (!form.endDate) e.endDate = 'End date is required';
      else if (form.startDate && fromYmd(form.endDate) <= fromYmd(form.startDate)) e.endDate = 'End date must be after the start date';
    }
    if (i === 1) {
      if (form.minTenure < 0) e.minTenure = 'Cannot be negative';
      if (form.limit < 0) e.limit = 'Cannot be negative';
      if (!match.selected.length) e.leads = 'No eligible leads match these filters — broaden the criteria';
    }
    if (i === 2) {
      if (!form.agentId) e.agent = 'Select an AI agent';
      else if (agent && !['Live', 'Testing'].includes(agent.status)) e.agent = 'This agent cannot be assigned';
    }
    if (i === 3) {
      if (!form.productId) e.product = 'Select a product';
      else if (product && (!product.approved || product.availability === 'Retired')) e.product = 'Product is not approved for outbound selling';
      if (!form.pitch.length) e.pitch = 'Choose at least one pitch emphasis';
    }
    if (i === 4) {
      if (form.warm >= form.hot) e.thresholds = 'Warm threshold must be lower than the hot threshold';
      if (form.hot > 100 || form.warm < 0) e.thresholds = 'Thresholds must be between 0 and 100';
      if (form.questions.some((q) => !q.trim())) e.questions = 'Remove or complete empty questions';
    }
    if (i === 5) {
      if (!form.days.length) e.days = 'Select at least one calling day';
      if (toMin(form.end) <= toMin(form.start)) e.end = 'End time must be after start time';
      if (form.concurrency < 1) e.concurrency = 'At least 1';
      else if (form.concurrency > app.settings.maxConcurrent) e.concurrency = `Exceeds workspace limit of ${app.settings.maxConcurrent}`;
      if (form.dailyCap < 1) e.dailyCap = 'At least 1 call per day';
      else if (form.dailyCap > app.settings.dailyCap) e.dailyCap = `Exceeds workspace daily cap of ${fmtInt(app.settings.dailyCap)}`;
      if (form.maxAttempts < 1 || form.maxAttempts > 6) e.maxAttempts = 'Between 1 and 6 attempts';
      if (form.intervalHours < 1) e.intervalHours = 'At least 1 hour';
    }
    return e;
  };
  const valid = (i: number) => Object.keys(errorsFor(i)).length === 0;
  const err = (k: string) => (showErr.has(step) ? errorsFor(step)[k] : undefined);
  const firstInvalid = STEPS.findIndex((_, i) => i < 6 && !valid(i));
  const reachable = (i: number) => firstInvalid === -1 || i <= firstInvalid;

  const next = () => {
    if (!valid(step)) { setShowErr((s) => new Set(s).add(step)); return; }
    setStep((s) => Math.min(6, s + 1)); window.scrollTo({ top: 0 });
  };
  const back = () => { setStep((s) => Math.max(0, s - 1)); window.scrollTo({ top: 0 }); };
  const goto = (i: number) => {
    if (i <= step || reachable(i)) { setStep(i); return; }
    setShowErr((s) => new Set(s).add(step));
    if (!valid(step)) return;
    setStep(firstInvalid === -1 ? i : firstInvalid);
  };

  // ---------- estimates ----------
  const est = useMemo(() => {
    const n = match.selected.length;
    const attemptsPerLead = 1 + (form.maxAttempts - 1) * 0.42;
    const calls = Math.round(n * attemptsPerLead);
    const connected = Math.round(n * Math.min(0.82, 0.46 + (form.maxAttempts - 1) * 0.08));
    const minutes = Math.round(connected * 3.4 + (calls - connected) * 0.35);
    const cpm = form.productId.startsWith('p-biz') ? 0.145 : 0.118;
    const cost = minutes * cpm;
    const windowMin = Math.max(0, toMin(form.end) - toMin(form.start));
    const perDay = Math.max(1, Math.min(form.dailyCap, Math.floor((form.concurrency * windowMin) / 2.6)));
    const callingDays = Math.ceil(calls / perDay);
    const calendarDays = form.days.length ? Math.ceil((callingDays / form.days.length) * 7) : 0;
    const span = form.startDate && form.endDate ? Math.round((fromYmd(form.endDate).getTime() - fromYmd(form.startDate).getTime()) / DAY) : 0;
    const qualified = Math.round(connected * Math.max(0.06, 0.26 - (form.minScore - 50) * 0.004));
    return { n, calls, connected, minutes, cpm, cost, perDay, callingDays, calendarDays, span, qualified, cpq: qualified ? cost / qualified : 0 };
  }, [match.selected.length, form.maxAttempts, form.productId, form.start, form.end, form.dailyCap, form.concurrency, form.days.length, form.startDate, form.endDate, form.minScore]);

  type Check = { label: string; detail: string; state: 'pass' | 'warn' | 'fail' };
  const checks: Check[] = [
    { label: 'Marketing consent verified', detail: `${fmtInt(est.n)} selected leads hold valid voice consent`, state: est.n > 0 ? 'pass' : 'fail' },
    { label: 'Suppression & TPS screening', detail: match.compliance ? `${fmtInt(match.compliance)} leads excluded automatically (DNC, consent, attempt limits)` : 'No suppressed numbers in selection', state: 'pass' },
    { label: 'Product approved for outbound', detail: product ? `${product.name} · reviewed ${fmtDate(product.lastReviewed)}` : 'No product selected', state: product?.approved ? 'pass' : 'fail' },
    { label: 'Offer validity', detail: offer ? (new Date(offer.endDate) < fromYmd(form.endDate || ymd(today)) ? `${offer.name} ends ${fmtDate(offer.endDate)} — before campaign end` : `${offer.name} valid until ${fmtDate(offer.endDate)}`) : 'No promotional offer — standard pricing only', state: offer && new Date(offer.endDate) < fromYmd(form.endDate || ymd(today)) ? 'warn' : 'pass' },
    { label: 'AI agent readiness', detail: agent ? `${agent.name} ${agent.version} · ${agent.status}${agent.status === 'Testing' ? ' — supervised test calls only' : ''}` : 'No agent selected', state: !agent ? 'fail' : agent.status === 'Live' ? 'pass' : agent.status === 'Testing' ? 'warn' : 'fail' },
    { label: 'AI disclosure & recording notice', detail: app.settings.disclosure ? `Recording ${app.settings.recordCalls ? 'enabled' : 'disabled'} · disclosure read at call start` : 'No disclosure configured', state: app.settings.disclosure ? 'pass' : 'fail' },
    { label: 'Permitted calling hours', detail: outsideHours ? `Window extends beyond policy (${hours.days.join(', ')} ${hours.start}–${hours.end}); out-of-policy slots are blocked` : `${daysRange(form.days)} ${form.start}–${form.end} within policy`, state: outsideHours ? 'warn' : 'pass' },
    { label: 'Contact frequency limits', detail: `${form.maxAttempts} attempts, every ${form.intervalHours}h`, state: form.maxAttempts <= 4 && form.intervalHours >= 4 ? 'pass' : 'warn' },
    { label: 'Duration fits campaign window', detail: `~${est.calendarDays} days needed vs ${est.span} days scheduled`, state: est.calendarDays <= est.span ? 'pass' : 'warn' },
  ];
  const blocking = checks.some((c) => c.state === 'fail') || firstInvalid !== -1;
  const startsLater = !!form.startDate && fromYmd(form.startDate) > new Date(today.getTime() + DAY - 1);

  // ---------- submit ----------
  const submit = (status: Campaign['status']) => {
    if (!canManage) return;
    if (status === 'Draft' && !form.name.trim()) { setStep(0); setShowErr((s) => new Set(s).add(0)); app.toast('Name required', 'Give the draft a name before saving.', 'error'); return; }
    if (status !== 'Draft' && blocking) { app.toast('Resolve blocking issues first', 'Some steps are incomplete or compliance checks failed.', 'error'); return; }
    setSubmitting(true);
    const startISO = status === 'Active' ? new Date().toISOString() : form.startDate ? fromYmd(form.startDate).toISOString() : new Date().toISOString();
    const endISO = form.endDate ? new Date(fromYmd(form.endDate).getTime() + 9 * 3600000).toISOString() : new Date(Date.now() + 30 * DAY).toISOString();
    const segment = [form.types.length ? form.types.join(' / ') : 'All customer types', form.city, form.tags[0]].filter(Boolean).join(' · ');
    const pid = form.productId || (app.products.find((p) => p.approved)?.id ?? app.products[0].id);
    const camp = app.addCampaign({
      name: form.name.trim(), productId: pid, offerId: form.offerId || null, agentId: form.agentId || (app.agents.find((a) => a.status === 'Live')?.id ?? app.agents[0].id), status,
      startDate: startISO, endDate: endISO, totalLeads: match.selected.length, attempted: 0, connected: 0, warm: 0, qualified: 0, minutes: 0,
      costPerMinute: pid.startsWith('p-biz') ? 0.145 : 0.118, segment,
      schedule: { days: form.days, start: form.start, end: form.end, timezone: form.timezone },
      retry: { maxAttempts: form.maxAttempts, intervalHours: form.intervalHours }, concurrency: form.concurrency, dailyCap: form.dailyCap,
      qualification: { minScore: form.minScore, requireBudget: form.requireBudget, requireDecisionMaker: form.requireDecisionMaker, requireTimeline: form.requireTimeline },
      createdBy: form.owner, description: form.description.trim() || `${form.objective} campaign for ${segment.toLowerCase()}.`,
    });
    setCampaignExtras(camp.id, {
      objective: form.objective, owner: form.owner, pitch: form.pitch, questions: form.questions.filter((q) => q.trim()), hotThreshold: form.hot, warmThreshold: form.warm, voicemail: form.voicemail,
      filters: describeFilters(form),
    });
    if (match.selected.length) app.updateLeads(match.selected.map((l) => l.id), { campaignId: camp.id, status: 'Queued' });
    const verb = status === 'Active' ? 'Launched campaign' : status === 'Scheduled' ? 'Scheduled campaign' : 'Saved campaign draft';
    app.audit(verb, camp.name, 'Campaign');
    app.toast(status === 'Active' ? 'Campaign launched' : status === 'Scheduled' ? 'Campaign scheduled' : 'Draft saved',
      status === 'Active' ? `${fmtInt(match.selected.length)} leads queued — simulated calling begins shortly.` : status === 'Scheduled' ? `Starts ${fmtDate(startISO)} · ${fmtInt(match.selected.length)} leads queued.` : `${camp.name} saved as draft.`);
    nav(`/campaigns/${camp.id}`);
  };

  // ---------- render helpers ----------
  const chip = (on: boolean, label: string, onClick: () => void, key?: string) => (
    <button key={key ?? label} type="button" className={`btn sm ${on ? 'primary' : ''}`} aria-pressed={on} onClick={onClick}>{on && <Check size={13} />}{label}</button>
  );
  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const stepBody: ReactNode[] = [
    // 1 — Campaign information
    <div className="col gap-16" key="s1">
      <div className="form-grid">
        <Field label="Campaign name" required error={err('name')} className="span-2" hint="Visible to sales, supervisors and in reports.">
          <input className={`input ${err('name') ? 'invalid' : ''}`} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Unlimited Max Spring Renewal" autoFocus />
        </Field>
        <Field label="Description" className="span-2" hint="Optional — who you are targeting and why.">
          <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Outbound AI campaign targeting customers in their renewal window…" />
        </Field>
        <Field label="Objective" required error={err('objective')}>
          <select className={`select ${err('objective') ? 'invalid' : ''}`} value={form.objective} onChange={(e) => set('objective', e.target.value)}>
            <option value="">Select objective…</option>
            {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Campaign owner" required error={err('owner')}>
          <select className="select" value={form.owner} onChange={(e) => set('owner', e.target.value)}>
            {owners.map((o) => <option key={o.id} value={o.name}>{o.name} — {o.role}</option>)}
          </select>
        </Field>
        <Field label="Start date" required error={err('startDate')}>
          <input type="date" className={`input ${err('startDate') ? 'invalid' : ''}`} min={ymd(today)} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="End date" required error={err('endDate')} hint={form.startDate && form.endDate && fromYmd(form.endDate) > fromYmd(form.startDate) ? `${Math.round((fromYmd(form.endDate).getTime() - fromYmd(form.startDate).getTime()) / DAY)} days` : undefined}>
          <input type="date" className={`input ${err('endDate') ? 'invalid' : ''}`} min={form.startDate} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
      </div>
      {source && <div className="banner info"><Copy />Prefilled from <span className="strong" style={{ color: 'inherit' }}>{source.name}</span> ({source.id}). Lead selection is re-evaluated against current compliance rules.</div>}
    </div>,

    // 2 — Leads
    <div className="col gap-16" key="s2">
      <div>
        <div className="field-label" style={{ marginBottom: 6 }}>Customer type</div>
        <div className="row-wrap" style={{ gap: 6 }}>{CUSTOMER_TYPES.map((t) => chip(form.types.includes(t), t, () => set('types', toggleIn(form.types, t))))}</div>
      </div>
      <div className="grid g-4 keep-2" style={{ gap: 12 }}>
        <Field label="City"><select className="select sm" value={form.city} onChange={(e) => set('city', e.target.value)}><option value="">All cities</option>{leadOpts.cities.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Lead source"><select className="select sm" value={form.source} onChange={(e) => set('source', e.target.value)}><option value="">All sources</option>{SOURCES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Current plan"><select className="select sm" value={form.plan} onChange={(e) => set('plan', e.target.value)}><option value="">All plans</option>{leadOpts.plans.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Min. tenure (months)" error={err('minTenure')}><input type="number" min={0} className="input sm" value={form.minTenure} onChange={(e) => set('minTenure', Math.max(0, +e.target.value))} /></Field>
      </div>
      <div>
        <div className="field-label" style={{ marginBottom: 6 }}>Tags <span className="muted small">(any of)</span></div>
        <div className="row-wrap" style={{ gap: 6 }}>{leadOpts.tags.map((t) => chip(form.tags.includes(t), t, () => set('tags', toggleIn(form.tags, t))))}</div>
      </div>
      <div className="row-wrap gap-16">
        <label className="row small" style={{ cursor: 'pointer' }}><input type="checkbox" className="checkbox" checked={form.excludeContacted} onChange={(e) => set('excludeContacted', e.target.checked)} />Exclude already-contacted leads</label>
        <label className="row small" style={{ cursor: 'pointer' }}><input type="checkbox" className="checkbox" checked={form.includeAssigned} onChange={(e) => set('includeAssigned', e.target.checked)} />Include leads assigned to other live campaigns</label>
        <label className="row small">Limit to <input type="number" min={0} className="input sm" style={{ width: 90 }} value={form.limit} onChange={(e) => set('limit', Math.max(0, +e.target.value))} /> leads <span className="muted">(0 = all)</span></label>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <MiniStat label="Matching filters" value={fmtInt(match.matched.length)} />
        <MiniStat label="Assigned elsewhere" value={fmtInt(match.assigned)} foot={form.includeAssigned ? 'included' : 'excluded'} />
        <MiniStat label="Excluded by compliance" value={fmtInt(match.compliance)} tone="orange" />
        <MiniStat label="Selected for campaign" value={fmtInt(match.selected.length)} tone="green" />
      </div>
      {err('leads') && <div className="banner warn"><AlertTriangle />{err('leads')}</div>}
      {match.reasons.length > 0 && (
        <div className="inset-box">
          <div className="row small medium" style={{ marginBottom: 8 }}><ShieldCheck size={14} />Compliance exclusions</div>
          <div className="col" style={{ gap: 6 }}>
            {match.reasons.map(([r, n]) => (
              <div key={r} className="row small"><span className="grow subtle">{r}</span><span className="mono tnum">{fmtInt(n)}</span><div style={{ width: 80 }}><Progress value={(n / Math.max(1, match.compliance)) * 100} color="var(--tangerine)" /></div></div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="row between" style={{ marginBottom: 8 }}><span className="field-label">Preview</span><span className="xs muted">Showing {Math.min(8, match.selected.length)} of {fmtInt(match.selected.length)}</span></div>
        <div className="table-wrap" style={{ border: '1px solid var(--ash)', borderRadius: 10 }}>
          <table className="table table-responsive">
            <thead><tr><th>Lead</th><th>Type</th><th>City</th><th>Current plan</th><th className="num">Tenure</th><th>Tags</th></tr></thead>
            <tbody>
              {match.selected.slice(0, 8).map((l) => (
                <tr key={l.id}>
                  <td data-label="Lead"><div className="cell-primary">{l.name}</div><div className="mono muted">{l.id} · {l.phone}</div></td>
                  <td data-label="Type">{l.customerType}</td><td data-label="City">{l.city}</td><td data-label="Current plan">{l.currentPlan}</td>
                  <td data-label="Tenure" className="num mono">{l.tenureMonths} mo</td>
                  <td data-label="Tags"><div className="row-wrap" style={{ gap: 4 }}>{l.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!match.selected.length && <div className="empty small">No eligible leads.</div>}
        </div>
      </div>
    </div>,

    // 3 — Agent
    <div className="col gap-12" key="s3">
      {err('agent') && <div className="banner warn"><AlertTriangle />{err('agent')}</div>}
      <div className="grid g-2" style={{ gap: 12 }}>
        {app.agents.map((a) => {
          const ok = a.status === 'Live' || a.status === 'Testing';
          const on = form.agentId === a.id;
          return (
            <button key={a.id} type="button" className={`option-card ${on ? 'on' : ''}`} disabled={!ok} onClick={() => set('agentId', a.id)}
              style={!ok ? { opacity: 0.55, cursor: 'not-allowed', background: '#fafafa' } : undefined} title={!ok ? `${a.status} agents cannot be assigned to campaigns` : undefined}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Avatar initials={a.initials} color={a.color} agent size="lg" />
                <div className="grow">
                  <div className="row between"><span className="cell-primary">{a.name} <span className="mono muted">{a.version}</span></span><StatusBadge status={a.status} /></div>
                  <div className="cell-sub mt-4">{a.voice} · {a.accent}</div>
                  <div className="small subtle mt-4">{a.personality}</div>
                </div>
              </div>
              <div className="grid g-4 keep-2 mt-12" style={{ gap: 8 }}>
                <Kpi l="Calls" v={fmtInt(a.totalCalls)} /><Kpi l="Qual. rate" v={fmtPct(a.qualificationRate)} /><Kpi l="Avg dur." v={fmtDur(a.avgDuration)} /><Kpi l="Sentiment" v={`${a.sentimentScore}`} />
              </div>
              {!ok && <div className="row xs muted mt-8"><Lock size={12} />{a.status === 'Paused' ? 'Paused — re-enable in Agent Builder before assigning' : 'Draft — publish a version before assigning'}</div>}
              {a.status === 'Testing' && <div className="row xs mt-8" style={{ color: '#6d28d9' }}><AlertTriangle size={12} />Testing agent — calls will be flagged for supervised review</div>}
            </button>
          );
        })}
      </div>
    </div>,

    // 4 — Product & offer
    <div className="col gap-16" key="s4">
      {err('product') && <div className="banner warn"><AlertTriangle />{err('product')}</div>}
      <div className="grid g-2" style={{ gap: 12 }}>
        {app.products.map((p) => {
          const ok = p.approved && p.availability !== 'Retired';
          const on = form.productId === p.id;
          return (
            <button key={p.id} type="button" className={`option-card ${on ? 'on' : ''}`} disabled={!ok}
              onClick={() => setForm((f) => ({ ...f, productId: p.id, offerId: '', pitch: p.benefits.slice(0, 2) }))}
              style={!ok ? { opacity: 0.55, cursor: 'not-allowed', background: '#fafafa' } : undefined}>
              <div className="row between"><span className="cell-primary">{p.name}</span><span className="mono small">{fmtGBP(p.monthlyPrice)}/mo</span></div>
              <div className="row mt-4"><span className="cell-sub">{p.category} · {p.contractMonths}-month · {p.data}{p.speed ? ` · ${p.speed}` : ''}</span>{p.availability !== 'Available' && <StatusBadge status={p.availability} dot={false} />}</div>
              {!ok && <div className="row xs mt-8" style={{ color: 'var(--red)' }}><Lock size={12} />Not approved by compliance — last reviewed {fmtDate(p.lastReviewed)}</div>}
            </button>
          );
        })}
      </div>
      {product && (
        <div className="grid g-2">
          <Field label="Promotional offer" hint={productOffers.length ? 'Only active offers for this product are listed.' : 'No active offers for this product.'}>
            <select className="select" value={form.offerId} onChange={(e) => set('offerId', e.target.value)}>
              <option value="">No offer — standard pricing</option>
              {productOffers.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
            </select>
            {offer && <div className="inset-box small mt-4"><div className="medium" style={{ color: 'var(--ink)' }}>{offer.discount}</div><div className="subtle mt-4">{offer.description}</div><div className="xs muted mt-4 mono">Valid {fmtDate(offer.startDate)} – {fmtDate(offer.endDate)}</div></div>}
          </Field>
          <div className="field">
            <span className="field-label">Pitch emphasis</span>
            <div className="col" style={{ gap: 6 }}>
              {[...product.benefits, ...GENERIC_PITCH].map((b) => (
                <label key={b} className="row small" style={{ cursor: 'pointer' }}><input type="checkbox" className="checkbox" checked={form.pitch.includes(b)} onChange={() => set('pitch', toggleIn(form.pitch, b))} />{b}</label>
              ))}
            </div>
            {err('pitch') && <span className="field-error">{err('pitch')}</span>}
          </div>
        </div>
      )}
    </div>,

    // 5 — Qualification
    <div className="col gap-16" key="s5">
      <Field label={<span className="row between" style={{ width: '100%' }}>Minimum qualification score<span className="mono">{form.minScore}/100</span></span>} hint="Leads below this score are logged as not qualified.">
        <input type="range" className="range" min={30} max={95} step={1} value={form.minScore} onChange={(e) => set('minScore', +e.target.value)} />
      </Field>
      <div>
        <SettingRow title="Require confirmed budget" desc="Customer confirms they are comfortable with the quoted monthly price."><Switch on={form.requireBudget} onChange={(v) => set('requireBudget', v)} label="Require budget" /></SettingRow>
        <SettingRow title="Require decision maker" desc="Account holder or authorised business contact."><Switch on={form.requireDecisionMaker} onChange={(v) => set('requireDecisionMaker', v)} label="Require decision maker" /></SettingRow>
        <SettingRow title="Require purchase timeline" desc="Customer intends to switch or upgrade within 60 days."><Switch on={form.requireTimeline} onChange={(v) => set('requireTimeline', v)} label="Require timeline" /></SettingRow>
      </div>
      <div className="form-grid">
        <Field label="Hot lead threshold" error={err('thresholds')} hint="Routed to sales immediately."><input type="number" min={0} max={100} className="input" value={form.hot} onChange={(e) => set('hot', +e.target.value)} /></Field>
        <Field label="Warm lead threshold" hint="Follow-up within 48 hours."><input type="number" min={0} max={100} className="input" value={form.warm} onChange={(e) => set('warm', +e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, form.warm)}%`, background: 'var(--ash)' }} title="Cold" />
        <div style={{ width: `${Math.max(0, form.hot - form.warm)}%`, background: '#F59E0B' }} title="Warm" />
        <div style={{ flex: 1, background: 'var(--tangerine)' }} title="Hot" />
      </div>
      <div className="row xs muted between"><span>Cold &lt; {form.warm}</span><span>Warm {form.warm}–{form.hot - 1}</span><span>Hot ≥ {form.hot}</span></div>
      <div className="field">
        <span className="field-label">Custom qualification questions</span>
        <div className="col" style={{ gap: 6 }}>
          {form.questions.map((q, i) => (
            <div key={i} className="row">
              <span className="mono xs muted" style={{ width: 18 }}>{i + 1}.</span>
              <input className={`input sm ${showErr.has(4) && !q.trim() ? 'invalid' : ''}`} value={q} onChange={(e) => set('questions', form.questions.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Question the AI agent should ask…" />
              <Button size="sm" variant="ghost" iconOnly icon={<Trash2 />} aria-label="Remove question" onClick={() => set('questions', form.questions.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
        {err('questions') && <span className="field-error">{err('questions')}</span>}
        <div><Button size="sm" icon={<Plus />} onClick={() => set('questions', [...form.questions, ''])} disabled={form.questions.length >= 8}>Add question</Button></div>
      </div>
    </div>,

    // 6 — Schedule
    <div className="col gap-16" key="s6">
      <Field label="Calling days" error={err('days')}><DayChips value={form.days} onChange={(v) => set('days', v)} /></Field>
      <div className="grid g-3" style={{ gap: 12 }}>
        <Field label="Window start"><input type="time" className="input" value={form.start} onChange={(e) => set('start', e.target.value)} /></Field>
        <Field label="Window end" error={err('end')}><input type="time" className={`input ${err('end') ? 'invalid' : ''}`} value={form.end} onChange={(e) => set('end', e.target.value)} /></Field>
        <Field label="Timezone"><select className="select" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      </div>
      {outsideHours && <div className="banner warn"><AlertTriangle /><div>This window is outside workspace calling hours (<span className="medium">{hours.days.join(', ')} · {hours.start}–{hours.end}</span>). Calls will not be placed outside permitted hours.</div></div>}
      <div className="grid g-2" style={{ gap: 16 }}>
        <Field label={<span className="row between" style={{ width: '100%' }}>Concurrent calls<span className="mono">{form.concurrency}</span></span>} error={err('concurrency')} hint={`Workspace limit ${app.settings.maxConcurrent} concurrent calls`}>
          <input type="range" className="range" min={1} max={Math.max(20, app.settings.maxConcurrent)} value={form.concurrency} onChange={(e) => set('concurrency', +e.target.value)} />
        </Field>
        <Field label="Daily call cap" error={err('dailyCap')} hint={`≈ ${fmtInt(est.perDay)} calls/day achievable with this window`}><input type="number" min={1} className="input" value={form.dailyCap} onChange={(e) => set('dailyCap', +e.target.value)} /></Field>
        <Field label="Max attempts per lead" error={err('maxAttempts')}><input type="number" min={1} max={6} className="input" value={form.maxAttempts} onChange={(e) => set('maxAttempts', +e.target.value)} /></Field>
        <Field label="Retry interval (hours)" error={err('intervalHours')} hint="Minimum wait between attempts to the same lead."><input type="number" min={1} className="input" value={form.intervalHours} onChange={(e) => set('intervalHours', +e.target.value)} /></Field>
        <Field label="Voicemail policy" className="span-2">
          <select className="select" value={form.voicemail} onChange={(e) => set('voicemail', e.target.value as Form['voicemail'])}>{VOICEMAIL_POLICIES.map((v) => <option key={v}>{v}</option>)}</select>
        </Field>
      </div>
    </div>,

    // 7 — Review
    <div className="col gap-16" key="s7">
      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
        <MiniStat label="Leads" value={fmtInt(est.n)} />
        <MiniStat label="Est. calls" value={fmtInt(est.calls)} foot={`${fmtInt(est.connected)} connected`} />
        <MiniStat label="Est. minutes" value={fmtInt(est.minutes)} foot={`at ${fmtGBP(est.cpm, 3)}/min`} />
        <MiniStat label="Est. cost" value={fmtGBP(est.cost)} foot={est.qualified ? `${fmtGBP(est.cpq, 2)} / qualified` : undefined} />
        <MiniStat label="Est. duration" value={`${est.calendarDays}d`} foot={`${est.callingDays} calling days · ~${fmtInt(est.qualified)} qualified`} />
      </div>
      <div className="grid g-2">
        <ReviewCard title="Campaign" onEdit={() => setStep(0)} items={[['Name', form.name || '—'], ['Objective', form.objective || '—'], ['Owner', form.owner], ['Dates', form.startDate && form.endDate ? `${fmtDate(fromYmd(form.startDate))} – ${fmtDate(fromYmd(form.endDate))}` : '—']]} />
        <ReviewCard title="Audience" onEdit={() => setStep(1)} items={[['Selected leads', `${fmtInt(est.n)} of ${fmtInt(match.matched.length)} matching`], ['Filters', describeFilters(form)], ['Excluded', `${fmtInt(match.compliance)} compliance · ${fmtInt(match.assigned)} assigned elsewhere`]]} />
        <ReviewCard title="AI agent & product" onEdit={() => setStep(3)} items={[['Agent', agent ? <span className="row gap-4"><Avatar initials={agent.initials} color={agent.color} size="sm" agent />{agent.name} · <StatusBadge status={agent.status} /></span> : '—'], ['Product', product ? `${product.name} · ${fmtGBP(product.monthlyPrice)}/mo` : '—'], ['Offer', offer ? `${offer.name} (${offer.code})` : 'None'], ['Pitch', form.pitch.join(', ') || '—']]} />
        <ReviewCard title="Qualification & schedule" onEdit={() => setStep(5)} items={[['Min. score', `${form.minScore} · hot ≥ ${form.hot} · warm ≥ ${form.warm}`], ['Requires', [form.requireBudget && 'budget', form.requireDecisionMaker && 'decision maker', form.requireTimeline && 'timeline'].filter(Boolean).join(', ') || 'No hard requirements'], ['Window', `${daysRange(form.days)} · ${form.start}–${form.end} (${form.timezone})`], ['Pacing', `${form.concurrency} concurrent · ${fmtInt(form.dailyCap)}/day · ${form.maxAttempts} attempts / ${form.intervalHours}h`], ['Voicemail', form.voicemail]]} />
      </div>
      <Card title="Compliance checks" sub="Automatically evaluated before any call is placed">
        <div className="col" style={{ gap: 10 }}>
          {checks.map((c) => (
            <div key={c.label} className="row" style={{ alignItems: 'flex-start' }}>
              {c.state === 'pass' ? <CheckCircle2 size={16} className="green" style={{ marginTop: 1, flexShrink: 0 }} /> : c.state === 'warn' ? <AlertTriangle size={16} className="orange" style={{ marginTop: 1, flexShrink: 0 }} /> : <XCircle size={16} className="red" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div className="grow"><div className="small medium" style={{ color: 'var(--ink)' }}>{c.label}</div><div className="xs muted">{c.detail}</div></div>
              <Badge tone={c.state === 'pass' ? 'green' : c.state === 'warn' ? 'amber' : 'red'}>{c.state === 'pass' ? 'Passed' : c.state === 'warn' ? 'Review' : 'Blocking'}</Badge>
            </div>
          ))}
        </div>
      </Card>
      <div className="banner sim"><FlaskConical /><div>Launching queues leads for <span className="medium">simulated</span> AI calls only — no real outbound calls are placed in this demonstration.</div></div>
    </div>,
  ];

  const stepErrors = showErr.has(step) ? Object.values(errorsFor(step)) : [];

  return (
    <ModulePage>
      <style>{`
        @media (max-width: 1100px) {
          .wiz-rail .steps { flex-direction: row; overflow-x: auto; gap: 4px; scrollbar-width: none; }
          .wiz-rail .step { width: auto; white-space: nowrap; flex-shrink: 0; }
          .wiz-rail .wiz-side-extra { display: none; }
        }
        @media (max-width: 720px) { .wiz-rail .step:not(.on) .step-label { display: none; } }
      `}</style>
      <PageHeader
        title={source ? 'Duplicate campaign' : 'New campaign'}
        desc="Configure the audience, AI agent, offer, qualification rules and calling schedule. All calling is simulated."
        eyebrow={<><Button size="xs" variant="ghost" icon={<ArrowLeft size={12} />} onClick={() => nav('/campaigns')}>Campaigns</Button><SimBadge /></>}
        actions={<>
          <Button size="sm" variant="ghost" onClick={() => nav('/campaigns')}>Cancel</Button>
          <Button size="sm" icon={<Save />} disabled={!canManage || submitting} title={canManage ? undefined : 'Your role cannot manage campaigns'} onClick={() => submit('Draft')}>Save as draft</Button>
        </>}
      />
      {!canManage && <div className="banner warn" style={{ marginBottom: 16 }}><Lock />Your role ({app.role}) can view this wizard but cannot create campaigns.</div>}

      <div className="grid g-side-main" style={{ alignItems: 'start' }}>
        <Card className="wiz-rail" style={{ padding: 8 }}>
          <div className="steps">
            {STEPS.map((s, i) => {
              const done = i < step && valid(i);
              return (
                <button key={s} type="button" className={`step ${i === step ? 'on' : ''} ${done ? 'done' : ''}`} onClick={() => goto(i)} disabled={!reachable(i) && i > step} style={!reachable(i) && i > step ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
                  <span className="step-num">{done ? <Check size={12} /> : i + 1}</span><span className="step-label">{s}</span>
                </button>
              );
            })}
          </div>
          <div className="wiz-side-extra" style={{ padding: '12px 10px 6px' }}>
            <div className="divider" style={{ margin: '4px 0 12px' }} />
            <div className="label" style={{ marginBottom: 8 }}>Running estimate</div>
            <div className="col" style={{ gap: 8 }}>
              <div className="row between small"><span className="row gap-4 subtle"><Users size={13} />Leads</span><span className="mono">{fmtInt(est.n)}</span></div>
              <div className="row between small"><span className="row gap-4 subtle"><Clock size={13} />Minutes</span><span className="mono">{fmtInt(est.minutes)}</span></div>
              <div className="row between small"><span className="row gap-4 subtle"><CalendarClock size={13} />Duration</span><span className="mono">{est.calendarDays}d</span></div>
              <div className="row between small"><span className="subtle">Est. cost</span><span className="mono strong">{fmtGBP(est.cost)}</span></div>
            </div>
            <div className="mt-12"><Progress value={((step + 1) / STEPS.length) * 100} /></div>
            <div className="xs muted mt-4">Step {step + 1} of {STEPS.length}</div>
          </div>
        </Card>

        <Card>
          <div className="row between" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
            <div>
              <div className="label">Step {step + 1} of {STEPS.length}</div>
              <div className="section-title mt-4">{STEPS[step]}</div>
              <div className="section-desc mt-4">{STEP_DESC[step]}</div>
            </div>
          </div>
          {stepBody[step]}
          {stepErrors.length > 0 && step !== 6 && (
            <div className="banner warn mt-16"><AlertTriangle /><div>Fix {stepErrors.length === 1 ? 'this issue' : `${stepErrors.length} issues`} to continue: {stepErrors.join(' · ')}</div></div>
          )}
          <div className="divider" />
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <Button icon={<ArrowLeft />} onClick={back} disabled={step === 0}>Back</Button>
            {step < 6 ? (
              <Button variant="primary" iconRight={<ArrowRight />} onClick={next}>Next: {STEPS[step + 1]}</Button>
            ) : (
              <div className="row-wrap">
                <Button icon={<Save />} disabled={!canManage || submitting} onClick={() => submit('Draft')}>Save as draft</Button>
                <Button icon={<CalendarClock />} disabled={!canManage || submitting || blocking || !startsLater} title={!startsLater ? 'Set a future start date to schedule' : blocking ? 'Resolve blocking checks first' : undefined} onClick={() => submit('Scheduled')}>Schedule for {form.startDate ? fmtDate(fromYmd(form.startDate)) : '—'}</Button>
                <Button variant="primary" icon={<Rocket />} disabled={!canManage || submitting || blocking} title={blocking ? 'Resolve blocking checks first' : !canManage ? 'Your role cannot manage campaigns' : undefined} onClick={() => submit('Active')}>Launch now</Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </ModulePage>
  );
}

const STEP_DESC = [
  'Name the campaign, set its purpose, owner and active dates.',
  'Target leads from the CRM. Compliance rules (consent, suppression, attempt limits) are applied automatically.',
  'Choose the voice agent that will handle conversations. Only Live or Testing agents can be assigned.',
  'Select an approved product, an optional active promotion and what the agent should emphasise.',
  'Define when a conversation counts as qualified and how leads are graded.',
  'Control when and how often the AI calls, and how retries and voicemail are handled.',
  'Check the configuration, estimated cost and compliance checks before launching.',
];

function initialForm(c: Campaign | undefined, me: string, settings: { hotThreshold: number; warmThreshold: number; callingHours: { start: string; end: string; days: string[] } }): Form {
  const today = startOfDay(NOW);
  const ex = c ? getCampaignExtras(c.id) : undefined;
  const biz = c?.productId.startsWith('p-biz');
  return {
    name: c ? `${c.name} (copy)` : '', description: c?.description ?? '', objective: ex?.objective ?? (c ? 'Upsell / cross-sell' : ''), owner: ex?.owner ?? c?.createdBy ?? me,
    startDate: ymd(today), endDate: ymd(new Date(today.getTime() + 30 * DAY)),
    types: c ? (biz ? ['SME', 'Business'] : ['Consumer']) : [], city: '', source: '', plan: '', minTenure: 0, tags: [], excludeContacted: true, includeAssigned: false, limit: 0,
    agentId: c?.agentId ?? '', productId: c?.productId ?? '', offerId: c?.offerId ?? '', pitch: ex?.pitch ?? [],
    minScore: c?.qualification.minScore ?? 70, requireBudget: c?.qualification.requireBudget ?? false, requireDecisionMaker: c?.qualification.requireDecisionMaker ?? false, requireTimeline: c?.qualification.requireTimeline ?? true,
    hot: ex?.hotThreshold ?? settings.hotThreshold, warm: ex?.warmThreshold ?? settings.warmThreshold, questions: ex?.questions ?? [...DEFAULT_QUESTIONS],
    days: c?.schedule.days ?? settings.callingHours.days.filter((d) => d !== 'Sat'), start: c?.schedule.start ?? '09:30', end: c?.schedule.end ?? '18:00', timezone: c?.schedule.timezone ?? 'Europe/London',
    concurrency: c?.concurrency ?? 6, dailyCap: c?.dailyCap ?? 300, maxAttempts: c?.retry.maxAttempts ?? 3, intervalHours: c?.retry.intervalHours ?? 24, voicemail: ex?.voicemail ?? 'Do not leave a message',
  };
}
function describeFilters(f: Form) {
  const parts = [
    f.types.length ? f.types.join('/') : 'All types', f.city, f.source, f.plan, f.minTenure ? `tenure ≥ ${f.minTenure} mo` : '',
    f.tags.length ? `tags: ${f.tags.join(', ')}` : '', f.excludeContacted ? 'never contacted' : '', f.limit ? `max ${f.limit}` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

function MiniStat({ label, value, foot, tone }: { label: string; value: ReactNode; foot?: ReactNode; tone?: 'green' | 'orange' }) {
  return <div><div className="kpi-label">{label}</div><div className={`kpi-value mt-4 ${tone ?? ''}`} style={{ fontSize: 22, color: tone ? undefined : undefined }}>{value}</div>{foot && <div className="kpi-foot mt-4 truncate">{foot}</div>}</div>;
}
function Kpi({ l, v }: { l: string; v: string }) {
  return <div><div className="xs muted">{l}</div><div className="mono small strong">{v}</div></div>;
}
function SettingRow({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return <div className="setting-row"><div><div className="title">{title}</div><div className="desc">{desc}</div></div>{children}</div>;
}
function ReviewCard({ title, items, onEdit }: { title: string; items: [ReactNode, ReactNode][]; onEdit: () => void }) {
  return <Card title={title} actions={<Button size="xs" variant="ghost" onClick={onEdit}>Edit</Button>}><KV items={items} /></Card>;
}
