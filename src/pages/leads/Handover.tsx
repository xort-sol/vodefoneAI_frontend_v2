// Human handover drawer, simulated rep dialler and sale-outcome modal (shared by Qualified + Workspace).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, CalendarPlus, ChevronDown, ChevronRight, CircleCheck, ExternalLink, HelpCircle, Lightbulb, MessageSquareWarning,
  Phone, PhoneOff, PoundSterling, ShieldAlert, StickyNote, Target, UserCheck, XCircle,
} from 'lucide-react';
import { useApp } from '../../store/store';
import {
  AudioPlayer, Avatar, Badge, Button, Field, KV, Menu, MenuItem, Modal, Drawer, ScoreBar, Segmented, SimBadge, StatusBadge, Transcript, useConfirm,
} from '../../components/ui';
import type { Call, Lead, LeadStatus, Product } from '../../data/types';
import { DAY, NOW } from '../../data/seed';
import { fmtDateTime, fmtDur, fmtGBP, fmtRelative } from '../../lib/format';
import { LEAD_STATUSES, ScheduleModal, uniq, useReps } from './shared';

/* ---------------- insights derived from call data ---------------- */
const Q_REQ: Record<string, string> = {
  'Is EU roaming included?': 'EU roaming for travel', 'Will my price go up each year?': 'Price certainty over the contract', 'Can I keep my number?': 'Keep existing number',
  'How long does installation take?': 'Fast installation', 'Is there an early termination fee?': 'Clarity on exit fees', 'Does it include 5G?': '5G coverage',
  'Can I add a family member?': 'Additional lines for family', 'Is there a static IP option?': 'Static IP address', 'What hub do I get?': 'Reliable Wi-Fi hub', 'Can I pay annually?': 'Flexible billing',
};
const TAG_REQ: Record<string, string> = {
  'Family plan': 'Multiple lines on one bill', 'Price sensitive': 'Monthly price at or below current spend', 'Multi-line': 'Multi-line discount',
  'High value': 'Premium service and support', 'Bundle eligible': 'Mobile + broadband bundle', 'Renewal due': 'Upgrade at renewal without exit fees',
};

export interface Insights {
  calls: Call[]; latest?: Call; latestConnected?: Call; reason: string; requirements: string[]; objections: string[]; questions: string[]; unanswered: string[];
  nextAction: string; deadline: string | null; overdue: boolean;
}
export function leadInsights(lead: Lead, calls: Call[], product?: Product): Insights {
  const connected = calls.filter((c) => c.connected);
  const latest = calls[0]; const latestConnected = connected[0];
  const objections = uniq(connected.flatMap((c) => c.objections));
  const questions = uniq(connected.flatMap((c) => c.questions));
  const unanswered = uniq(connected.flatMap((c) => c.unanswered));
  const pName = product?.name ?? 'the offer';
  const intent = latestConnected?.intent ?? 0;
  const ctx = `Currently on ${lead.currentPlan}${lead.tenureMonths ? ` (${lead.tenureMonths} months tenure)` : ''}${lead.tags.includes('Renewal due') ? ', in renewal window' : ''}.`;
  const reason = lead.status === 'Hot' || lead.status === 'Converted' ? `Confirmed need, budget and timeline for ${pName}; buying intent ${intent}/100. ${ctx}`
    : lead.status === 'Warm' ? `Interested in ${pName} but wants to ${objections.includes('Needs to discuss with partner') ? 'discuss with their partner' : 'compare details'} before committing. ${ctx}`
      : lead.status === 'Callback requested' ? `Asked for a callback at a more convenient time to hear about ${pName}. ${ctx}`
        : lead.status === 'Unreachable' ? `Not yet reached after ${lead.attempts} attempt${lead.attempts === 1 ? '' : 's'}. ${ctx}`
          : `Low or no interest expressed in ${pName}. ${ctx}`;
  const requirements = uniq([...questions.map((q) => Q_REQ[q]).filter(Boolean), ...lead.tags.map((t) => TAG_REQ[t]).filter(Boolean)]);
  if (!requirements.length && product) requirements.push(product.benefits[0]);
  const priceObj = objections.some((o) => o.toLowerCase().includes('price'));
  let nextAction = lead.status === 'Converted' ? 'Sale completed — send welcome pack and confirm activation date.'
    : lead.status === 'Hot' && !lead.assignedRepId ? 'Assign to a product specialist and call within 2 hours while intent is high.'
      : lead.status === 'Hot' ? 'Call to close: confirm plan, address eligibility and place the order.'
        : lead.status === 'Warm' && priceObj ? 'Send a tailored quote including the Together Discount and follow up within 48 hours.'
          : lead.status === 'Warm' ? 'Email the plan summary and book a follow-up call with a specialist.'
            : lead.status === 'Callback requested' ? 'Call back at the customer’s requested time and re-qualify.'
              : lead.status === 'Unreachable' ? 'Try SMS or email before the next call attempt.'
                : 'Nurture: revisit in a future campaign in 90 days.';
  if (unanswered[0] && lead.status !== 'Converted') nextAction += ` Answer open question: “${unanswered[0]}”.`;
  const deadline = lead.nextFollowUp ?? (lead.lastCallAt ? new Date(new Date(lead.lastCallAt).getTime() + (lead.status === 'Hot' ? 1 : 2) * DAY).toISOString() : null);
  const overdue = !!deadline && new Date(deadline) < NOW && !['Converted', 'Not interested', 'Do not call'].includes(lead.status);
  return { calls, latest, latestConnected, reason, requirements, objections, questions, unanswered, nextAction, deadline, overdue };
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="label row" style={{ gap: 6, marginBottom: 8 }}>{icon}{title}</div>
      {children}
    </div>
  );
}
function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <div className="small muted">{empty}</div>;
  return <ul style={{ margin: 0, paddingLeft: 18 }} className="small col gap-4">{items.map((i) => <li key={i} style={{ color: 'var(--graphite)' }}>{i}</li>)}</ul>;
}

/* ---------------- Handover drawer ---------------- */
export function HandoverDrawer({ lead, calls, onClose, actingRepId, onContact, onRecordSale }: {
  lead: Lead | null; calls: Call[]; onClose: () => void; actingRepId?: string; onContact?: (l: Lead) => void; onRecordSale?: (l: Lead) => void;
}) {
  const app = useApp(); const reps = useReps(); const confirm = useConfirm();
  const [showTx, setShowTx] = useState(false); const [t, setT] = useState(0); const [sched, setSched] = useState(false); const [note, setNote] = useState('');
  useEffect(() => { setShowTx(false); setT(0); setNote(''); }, [lead?.id]);
  const product = lead ? app.productById.get(lead.productInterest) : undefined;
  const ins = useMemo(() => (lead ? leadInsights(lead, calls, product) : null), [lead, calls, product]);
  if (!lead || !ins) return null;
  const call = ins.latestConnected ?? ins.latest;
  const agent = call ? app.agentById.get(call.agentId) : undefined;
  const tx = call ? app.transcriptFor(call) : [];
  const rep = lead.assignedRepId ? app.memberById.get(lead.assignedRepId) : undefined;
  const accepted = lead.tags.includes('Handover accepted');
  const canAssign = app.can('leads.assign'); const canEdit = app.can('leads.edit');
  const accepter = actingRepId ?? lead.assignedRepId ?? (app.me.role === 'Sales Representative' ? app.me.id : undefined);

  const assign = (repId: string) => {
    const r = app.memberById.get(repId);
    app.updateLead(lead.id, { assignedRepId: repId || null, tags: lead.tags.filter((x) => x !== 'Handover accepted') });
    app.audit('Assigned lead', `${lead.name} (${lead.id}) → ${r?.name ?? 'Unassigned'}`, 'Data');
    app.toast(repId ? 'Lead assigned' : 'Lead unassigned', repId ? `${lead.name} → ${r?.name}` : lead.name);
  };
  const accept = () => {
    if (!accepter) return;
    const r = app.memberById.get(accepter);
    app.updateLead(lead.id, { assignedRepId: accepter, tags: uniq([...lead.tags, 'Handover accepted']) });
    app.addNote(lead.id, `Handover accepted by ${r?.name}. AI summary and transcript reviewed.`);
    app.audit('Accepted handover', `${lead.name} (${lead.id})`, 'Data');
    app.toast('Handover accepted', `${r?.name} now owns ${lead.name}`);
  };
  const convert = async () => {
    if (onRecordSale) { onRecordSale(lead); return; }
    if (!(await confirm({ title: 'Mark as converted?', desc: `${lead.name} will be marked as a completed sale for ${product?.name}.`, confirmLabel: 'Mark converted' }))) return;
    app.updateLead(lead.id, { status: 'Converted' });
    app.audit('Marked lead converted', `${lead.name} (${lead.id})`, 'Data');
    app.toast('Lead converted', `${lead.name} · ${product?.name}`);
  };
  const disqualify = async (status: LeadStatus, reason: string) => {
    if (!(await confirm({ title: 'Disqualify lead?', desc: `${lead.name} will be set to “${status}” (${reason.toLowerCase()}) and removed from the handover queue.`, confirmLabel: 'Disqualify', danger: true }))) return;
    app.updateLead(lead.id, { status, assignedRepId: status === 'Cold' ? lead.assignedRepId : null });
    app.addNote(lead.id, `Disqualified: ${reason}.`);
    app.audit('Disqualified lead', `${lead.name} (${lead.id}) · ${reason}`, 'Data');
    app.toast('Lead disqualified', `${lead.name} → ${status}`);
  };
  const setStatus = (s: LeadStatus) => { app.updateLead(lead.id, { status: s }); app.audit('Changed lead status', `${lead.name} → ${s}`, 'Data'); app.toast('Status updated', `${lead.name} → ${s}`); };
  const addNote = () => { if (!note.trim()) return; app.addNote(lead.id, note.trim()); setNote(''); app.toast('Note added', lead.name); };

  return (
    <>
      <Drawer open={!!lead} onClose={onClose} width={640} title={<span className="row">Handover · <span className="mono muted">{lead.id}</span></span>}
        footer={
          <div className="row-wrap" style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Menu align="left" trigger={(tg) => <Button size="sm" variant="ghost" onClick={tg} iconRight={<ChevronDown size={13} />} disabled={!canEdit} title={canEdit ? undefined : 'Your role cannot edit leads'}>Disqualify</Button>}>
              {(close) => (<>
                <div className="menu-label label">Reason</div>
                <MenuItem icon={<XCircle />} onClick={() => { close(); disqualify('Not interested', 'Customer not interested'); }}>Not interested</MenuItem>
                <MenuItem icon={<XCircle />} onClick={() => { close(); disqualify('Cold', 'Not ready — revisit later'); }}>Not ready — mark cold</MenuItem>
                <MenuItem icon={<XCircle />} onClick={() => { close(); disqualify('Unreachable', 'Could not reach customer'); }}>Unreachable</MenuItem>
                <MenuItem icon={<XCircle />} onClick={() => { close(); disqualify('Not interested', 'Not eligible for product'); }}>Not eligible</MenuItem>
              </>)}
            </Menu>
            <Button size="sm" icon={<CalendarPlus />} onClick={() => setSched(true)} disabled={!canEdit}>Schedule</Button>
            {onContact && <Button size="sm" icon={<Phone />} onClick={() => onContact(lead)}>Contact</Button>}
            <Button size="sm" icon={<BadgeCheck />} onClick={convert} disabled={!canEdit || lead.status === 'Converted'}>{onRecordSale ? 'Record sale' : 'Mark converted'}</Button>
            <Button size="sm" variant="primary" icon={<UserCheck />} onClick={accept} disabled={!accepter || accepted} title={!accepter ? 'Assign a rep first' : accepted ? 'Already accepted' : undefined}>{accepted ? 'Accepted' : 'Accept handover'}</Button>
          </div>
        }>
        <div className="row" style={{ gap: 12, marginBottom: 16 }}>
          <Avatar name={lead.name} size="lg" />
          <div className="grow">
            <div className="row-wrap"><Link to={`/leads/${lead.id}`} className="strong" style={{ fontSize: 16 }}>{lead.name}</Link><StatusBadge status={lead.status} />{accepted && <Badge tone="green">Accepted</Badge>}</div>
            <div className="small muted mt-4">{lead.customerType} · {lead.city} · <span className="mono">{lead.phone}</span></div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="label">Score</div><div className="mt-4"><ScoreBar value={lead.score} /></div></div>
        </div>

        <div className="grid g-2" style={{ gap: 12, marginBottom: 18 }}>
          <div className="inset-box">
            <div className="label">Assigned rep</div>
            <select className="select sm soft mt-8" value={lead.assignedRepId ?? ''} onChange={(e) => assign(e.target.value)} disabled={!canAssign} title={canAssign ? undefined : 'Your role cannot assign leads'} style={{ background: '#fff' }}>
              <option value="">Unassigned</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}{r.products.includes(lead.productInterest) ? ' ★' : ''}</option>)}
            </select>
            <div className="xs muted mt-4">{rep ? `${rep.team} · ${rep.status}` : '★ = product specialist'}</div>
          </div>
          <div className="inset-box">
            <div className="label">Follow-up deadline</div>
            <div className={`medium mt-8 ${ins.overdue ? 'red' : ''}`} style={{ color: ins.overdue ? undefined : 'var(--ink)' }}>{ins.deadline ? fmtDateTime(ins.deadline) : '—'}</div>
            <div className="xs muted mt-4">{ins.overdue ? <span className="red row gap-4"><AlertTriangle size={12} />Overdue · {fmtRelative(ins.deadline)}</span> : ins.deadline ? fmtRelative(ins.deadline) : 'No deadline set'}</div>
          </div>
        </div>

        <Section icon={<Target size={12} />} title="Customer & product">
          <KV items={[
            ['Email', <span className="truncate" key="e">{lead.email}</span>], ['Current plan', `${lead.currentPlan} · ${lead.tenureMonths} mo`],
            ['Product interest', <span key="p">{product?.name} <span className="muted">· {product ? fmtGBP(product.monthlyPrice) : ''}/mo · {product?.contractMonths} mo</span></span>],
            ['Campaign', lead.campaignId ? <Link key="c" to={`/campaigns/${lead.campaignId}`}>{app.campaignById.get(lead.campaignId)?.name}</Link> : '—'],
            ['Sentiment', <StatusBadge key="s" status={lead.sentiment} dot={false} />], ['Status', canEdit ? <select key="st" className="select sm soft" style={{ width: 180, height: 28 }} value={lead.status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select> : lead.status],
          ]} />
        </Section>

        <div className="card inset" style={{ marginBottom: 18 }}>
          <div className="row between"><div className="label">AI summary</div><SimBadge /></div>
          <div className="mt-8" style={{ color: 'var(--graphite)', lineHeight: 1.55 }}>{lead.aiSummary || 'No AI conversation yet.'}</div>
        </div>

        <Section icon={<Lightbulb size={12} />} title="Reason for interest"><div className="small" style={{ color: 'var(--graphite)' }}>{ins.reason}</div></Section>
        <div className="grid g-2" style={{ gap: 16 }}>
          <Section icon={<CircleCheck size={12} />} title="Customer requirements"><Bullets items={ins.requirements} empty="None captured." /></Section>
          <Section icon={<MessageSquareWarning size={12} />} title="Main objections"><Bullets items={ins.objections} empty="No objections raised." /></Section>
        </div>
        <Section icon={<HelpCircle size={12} />} title="Questions asked">
          <Bullets items={ins.questions} empty="No questions recorded." />
          {ins.unanswered.length > 0 && <div className="banner warn mt-8"><AlertTriangle />Unanswered by AI: {ins.unanswered.join('; ')}</div>}
        </Section>
        <div className="banner info" style={{ marginBottom: 18 }}><Lightbulb /><div><div className="medium">Recommended next action</div><div className="mt-4">{ins.nextAction}</div></div></div>

        <Section icon={<Phone size={12} />} title="Recording & transcript">
          {call ? (
            <>
              <div className="row between small" style={{ marginBottom: 8 }}>
                <span><Link to={`/conversations/${call.id}`} className="mono">{call.id}</Link> <span className="muted">· {fmtDateTime(call.startedAt)} · {fmtDur(call.duration)} · {agent?.name}</span></span>
                <span className="row gap-4"><StatusBadge status={call.outcome} /><span className="mono xs muted">REC-{call.id.slice(3)}</span></span>
              </div>
              {app.can('recordings.listen')
                ? <AudioPlayer duration={call.duration} time={t} onTime={setT} recordingId={call.id} available={call.recording === 'Available'} />
                : <div className="small muted">Your role cannot listen to recordings.</div>}
              <button type="button" className="btn ghost sm mt-8" onClick={() => setShowTx(!showTx)}>{showTx ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{showTx ? 'Hide transcript' : `Show transcript (${tx.length} lines)`}</button>
              {showTx && <div className="mt-12" style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}><Transcript lines={tx} agentName={agent?.name ?? 'Ava'} customerName={lead.name} activeTime={t} onSeek={setT} agentColor={agent?.color} /></div>}
            </>
          ) : <div className="small muted">No calls recorded for this lead yet.</div>}
        </Section>

        <Section icon={<StickyNote size={12} />} title={`Notes (${lead.notes.length})`}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <textarea className="textarea" style={{ minHeight: 56 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for this handover…" disabled={!canEdit} />
            <Button size="sm" onClick={addNote} disabled={!note.trim()}>Add</Button>
          </div>
          <div className="list mt-8">
            {lead.notes.slice(0, 4).map((n) => <div key={n.id} className="list-item" style={{ alignItems: 'flex-start', padding: '8px 0' }}><Avatar name={n.author} size="sm" /><div className="grow"><div className="xs muted">{n.author} · {fmtRelative(n.at)}</div><div className="small" style={{ color: 'var(--graphite)' }}>{n.text}</div></div></div>)}
          </div>
        </Section>
      </Drawer>
      <ScheduleModal open={sched} onClose={() => setSched(false)} leadId={lead.id} defaultRepId={actingRepId} />
    </>
  );
}

/* ---------------- Simulated rep dialler ---------------- */
type DialOutcome = 'Spoke — interested' | 'Spoke — not interested' | 'Callback requested' | 'Sale agreed' | 'No answer' | 'Voicemail';
const OUTCOME_STATUS: Record<DialOutcome, LeadStatus> = {
  'Spoke — interested': 'Warm', 'Spoke — not interested': 'Not interested', 'Callback requested': 'Callback requested', 'Sale agreed': 'Converted', 'No answer': 'Contacted', Voicemail: 'Contacted',
};
export function SimDialModal({ lead, onClose, onSale }: { lead: Lead | null; onClose: () => void; onSale?: (l: Lead) => void }) {
  const app = useApp();
  const [phase, setPhase] = useState<'ready' | 'dialling' | 'connected' | 'wrap'>('ready');
  const [secs, setSecs] = useState(0);
  const [outcome, setOutcome] = useState<DialOutcome>('Spoke — interested');
  const [status, setStatus] = useState<LeadStatus>('Warm');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (lead) { setPhase('ready'); setSecs(0); setOutcome('Spoke — interested'); setStatus(lead.status === 'Hot' ? 'Hot' : 'Warm'); setNotes(''); } }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase === 'dialling') { const to = setTimeout(() => setPhase('connected'), 1800); return () => clearTimeout(to); }
    if (phase === 'connected') { const iv = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(iv); }
    return undefined;
  }, [phase]);
  if (!lead) return null;
  const blockers = app.eligibility(lead).reasons.filter((r) => r.includes('consent') || r.includes('suppression'));
  const close = () => { if (phase === 'connected' || phase === 'dialling') return; onClose(); };
  const save = () => {
    app.updateLead(lead.id, { status: outcome === 'Sale agreed' ? lead.status : status });
    app.addNote(lead.id, `Simulated rep call (${fmtDur(secs)}) — ${outcome}.${notes.trim() ? ` ${notes.trim()}` : ''}`);
    app.audit('Logged rep contact (simulated)', `${lead.name} (${lead.id}) · ${outcome}`, 'Data');
    app.toast('Contact logged', `${lead.name} · ${outcome} · ${fmtDur(secs)} (simulated)`);
    onClose();
    if (outcome === 'Sale agreed') onSale?.(lead);
  };
  return (
    <Modal open={!!lead} onClose={close} title={<span className="row">Contact customer <SimBadge /></span>} desc="Simulated dialler — no real phone call is placed."
      footer={phase === 'ready' ? <><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Phone />} onClick={() => setPhase('dialling')} disabled={blockers.length > 0}>Start simulated call</Button></>
        : phase === 'wrap' ? <><Button onClick={onClose}>Discard</Button><Button variant="primary" onClick={save}>Save outcome</Button></>
          : <Button variant="danger-solid" icon={<PhoneOff />} onClick={() => setPhase('wrap')}>End call</Button>}>
      <div className="row" style={{ gap: 12 }}>
        <Avatar name={lead.name} size="lg" />
        <div className="grow"><div className="strong">{lead.name}</div><div className="mono small muted">{lead.phone}</div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono strong" style={{ fontSize: 22 }}>{fmtDur(secs)}</div>
          <div className="xs muted">{phase === 'ready' ? 'Ready' : phase === 'dialling' ? 'Dialling…' : phase === 'connected' ? 'Connected (simulated)' : 'Call ended'}</div>
        </div>
      </div>
      <div className="banner sim mt-16"><ShieldAlert />This is a demonstration. Starting the call only runs a timer — nothing is dialled.</div>
      {phase === 'ready' && blockers.length > 0 && <div className="banner warn mt-12"><AlertTriangle /><div><div className="medium">Contact blocked by compliance</div>{blockers.map((b) => <div key={b}>• {b}</div>)}</div></div>}
      {phase === 'connected' && <div className="row mt-16"><span className="live-dot" /><span className="small">Talking to {lead.name.split(' ')[0]} — take notes below.</span></div>}
      {(phase === 'connected' || phase === 'wrap') && (
        <div className="col gap-12 mt-16">
          {phase === 'wrap' && (
            <div className="form-grid">
              <Field label="Outcome"><select className="select" value={outcome} onChange={(e) => { const o = e.target.value as DialOutcome; setOutcome(o); setStatus(OUTCOME_STATUS[o]); }}>{(Object.keys(OUTCOME_STATUS) as DialOutcome[]).map((o) => <option key={o}>{o}</option>)}</select></Field>
              <Field label="Update lead status" hint={outcome === 'Sale agreed' ? 'You’ll record the sale details next' : undefined}><select className="select" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)} disabled={outcome === 'Sale agreed'}>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            </div>
          )}
          <Field label="Call notes"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did the customer say?" /></Field>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Sale outcome ---------------- */
const LOST_REASONS = ['Price too high', 'Chose a competitor', 'Coverage concerns', 'Not eligible / failed credit check', 'Changed mind', 'Other'];
export function SaleOutcomeModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const app = useApp();
  const [productId, setProductId] = useState(''); const [months, setMonths] = useState(24); const [monthly, setMonthly] = useState('0');
  const [outcome, setOutcome] = useState<'Won' | 'Lost'>('Won'); const [reason, setReason] = useState(''); const [notes, setNotes] = useState(''); const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!lead) return;
    const p = app.productById.get(lead.productInterest);
    setProductId(lead.productInterest); setMonths(p?.contractMonths ?? 24); setMonthly(String(p?.monthlyPrice ?? 0)); setOutcome('Won'); setReason(''); setNotes(''); setTouched(false);
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!lead) return null;
  const mv = parseFloat(monthly);
  const errs = {
    product: !productId ? 'Choose a product' : '',
    months: !(months >= 1 && months <= 48) ? 'Contract must be 1–48 months' : '',
    monthly: outcome === 'Won' && !(mv > 0 && mv < 10000) ? 'Enter a monthly value above £0' : '',
    reason: outcome === 'Lost' && !reason ? 'Choose a reason' : '',
  };
  const tcv = (mv > 0 ? mv : 0) * months;
  const save = () => {
    setTouched(true);
    if (Object.values(errs).some(Boolean)) return;
    const p = app.productById.get(productId);
    if (outcome === 'Won') {
      app.updateLead(lead.id, { status: 'Converted', productInterest: productId, nextFollowUp: null });
      app.addNote(lead.id, `Sale won: ${p?.name}, ${months} months at ${fmtGBP(mv, 2)}/mo (TCV ${fmtGBP(tcv)}).${notes.trim() ? ` ${notes.trim()}` : ''}`);
      app.audit('Recorded sale', `${lead.name} (${lead.id}) · ${p?.name} · ${fmtGBP(tcv)}`, 'Data');
      app.toast('Sale recorded', `${lead.name} · ${p?.name} · ${fmtGBP(tcv)} contract value`);
    } else {
      app.updateLead(lead.id, { status: 'Not interested', nextFollowUp: null });
      app.addNote(lead.id, `Sale lost: ${reason}.${notes.trim() ? ` ${notes.trim()}` : ''}`);
      app.audit('Recorded lost sale', `${lead.name} (${lead.id}) · ${reason}`, 'Data');
      app.toast('Outcome recorded', `${lead.name} · lost — ${reason}`, 'info');
    }
    onClose();
  };
  const e = (k: keyof typeof errs) => (touched ? errs[k] : '');
  return (
    <Modal open={!!lead} onClose={onClose} title="Record sale outcome" desc={`${lead.name} · ${lead.id}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<PoundSterling />} onClick={save}>Record {outcome === 'Won' ? 'sale' : 'outcome'}</Button></>}>
      <div className="col gap-12">
        <Segmented value={outcome} onChange={setOutcome} options={[{ value: 'Won', label: 'Won' }, { value: 'Lost', label: 'Lost' }]} />
        <div className="form-grid">
          <Field label="Product" required error={e('product')} className="span-all"><select className="select" value={productId} onChange={(x) => { const p = app.productById.get(x.target.value); setProductId(x.target.value); if (p) { setMonths(p.contractMonths); setMonthly(String(p.monthlyPrice)); } }}>{app.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Contract length (months)" required error={e('months')}><input type="number" className="input" min={1} max={48} value={months} onChange={(x) => setMonths(+x.target.value)} /></Field>
          <Field label="Monthly value (£)" required={outcome === 'Won'} error={e('monthly')}><input type="number" step="0.01" className="input" value={monthly} onChange={(x) => setMonthly(x.target.value)} /></Field>
          {outcome === 'Lost' && <Field label="Reason" required error={e('reason')} className="span-all"><select className={`select ${e('reason') ? 'invalid' : ''}`} value={reason} onChange={(x) => setReason(x.target.value)}><option value="">Select reason…</option>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>}
          <Field label="Notes" className="span-all"><textarea className="textarea" style={{ minHeight: 64 }} value={notes} onChange={(x) => setNotes(x.target.value)} placeholder="Order reference, add-ons, delivery date…" /></Field>
        </div>
        {outcome === 'Won' && <div className="inset-box row between"><span className="small muted">Total contract value</span><span className="mono strong">{fmtGBP(tcv)}</span></div>}
        <div className="xs muted row gap-4"><ExternalLink size={11} />Order placement happens in the billing system; this records the outcome for reporting.</div>
      </div>
    </Modal>
  );
}
