import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowLeft, CalendarClock, CalendarPlus, Check, ChevronDown, ChevronRight, CircleDot, Edit3, FileAudio, Megaphone, Phone,
  PhoneCall, Plus, ShieldCheck, ShieldOff, StickyNote, UserPlus, X, XCircle, CheckCircle2, UserRoundPlus, ListTodo,
} from 'lucide-react';
import { useApp } from '../store/store';
import {
  Avatar, Badge, Button, Card, EmptyState, KV, Menu, MenuItem, Modal, ScoreBar, SimBadge, StatusBadge, Tabs, Transcript, useConfirm,
} from '../components/ui';
import type { Call, Lead } from '../data/types';
import { NOW } from '../data/seed';
import { fmtDate, fmtDateTime, fmtDur, fmtGBP, fmtRelative } from '../lib/format';
import { LeadFormModal, PageFix, ScheduleModal, TAGS, TaskModal, toDateInput, toTimeInput, fromInputs, uniq, useCallsByLead, useReps } from './leads/shared';

type Tab = 'overview' | 'calls' | 'notes' | 'tasks' | 'activity';

export default function LeadProfile() {
  const { id = '' } = useParams();
  const app = useApp(); const nav = useNavigate(); const confirm = useConfirm(); const reps = useReps();
  const byLead = useCallsByLead();
  const lead = app.leadById.get(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [sched, setSched] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const [note, setNote] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [openCall, setOpenCall] = useState<string | null>(null);
  const [fuDate, setFuDate] = useState(''); const [fuTime, setFuTime] = useState('10:00');

  const calls = useMemo(() => byLead.get(id) ?? [], [byLead, id]);
  const tasks = useMemo(() => app.tasks.filter((t) => t.leadId === id).sort((a, b) => Number(a.done) - Number(b.done) || +new Date(a.due) - +new Date(b.due)), [app.tasks, id]);
  const appts = useMemo(() => app.appointments.filter((a) => a.leadId === id).sort((a, b) => +new Date(b.start) - +new Date(a.start)), [app.appointments, id]);

  if (!lead) {
    return <Card><EmptyState title="Lead not found" desc={`No lead with ID ${id}. It may have been deleted or merged.`} action={<Button onClick={() => nav('/leads')} icon={<ArrowLeft />}>Back to leads</Button>} /></Card>;
  }

  const product = app.productById.get(lead.productInterest);
  const campaign = lead.campaignId ? app.campaignById.get(lead.campaignId) : undefined;
  const rep = lead.assignedRepId ? app.memberById.get(lead.assignedRepId) : undefined;
  const elig = app.eligibility(lead);
  const suppressed = app.suppressions.some((s) => s.phone === lead.phone);
  const canEdit = app.can('leads.edit'); const canAssign = app.can('leads.assign');
  const noEdit = canEdit ? undefined : 'Your role cannot edit leads';

  const hour = NOW.getHours() + NOW.getMinutes() / 60;
  const [sh, sm] = app.settings.callingHours.start.split(':').map(Number); const [eh, em] = app.settings.callingHours.end.split(':').map(Number);
  const dayName = NOW.toLocaleDateString('en-GB', { weekday: 'short' });
  const inHours = app.settings.callingHours.days.includes(dayName) && hour >= sh + sm / 60 && hour < eh + em / 60;
  const checks: [string, boolean, string][] = [
    ['Marketing consent on file', lead.consent, lead.consent ? 'Voice consent granted' : 'No valid consent — cannot be called'],
    ['Not on suppression / TPS list', !(lead.dnc || suppressed), lead.dnc || suppressed ? 'Number is suppressed' : 'Checked against 1 internal + TPS list'],
    ['Record active', !lead.archived, lead.archived ? 'Archived' : 'Active record'],
    ['Status permits contact', !['Converted', 'Do not call', 'Not interested'].includes(lead.status), `Status: ${lead.status}`],
    ['Within attempt limit', !campaign || lead.attempts < campaign.retry.maxAttempts, campaign ? `${lead.attempts} of ${campaign.retry.maxAttempts} attempts used` : 'No campaign limit'],
    ['Inside permitted calling hours', inHours, `${inHours ? '' : 'Outside window now — calls wait for the next slot · '}${app.settings.callingHours.days.join(', ')} · ${app.settings.callingHours.start}–${app.settings.callingHours.end}`],
  ];

  /* ----- actions ----- */
  const assign = (repId: string | null) => {
    const r = repId ? app.memberById.get(repId) : undefined;
    app.updateLead(lead.id, { assignedRepId: repId });
    app.audit('Assigned lead', `${lead.name} (${lead.id}) → ${r?.name ?? 'Unassigned'}`, 'Data');
    app.toast(repId ? 'Rep assigned' : 'Lead unassigned', repId ? `${lead.name} → ${r?.name}` : lead.name);
  };
  const addToCampaign = (campId: string) => {
    const c = app.campaignById.get(campId)!;
    if (lead.dnc || suppressed || !lead.consent) { setBlocked(elig.reasons.length ? elig.reasons : ['No valid marketing consent']); return; }
    app.updateLead(lead.id, { campaignId: campId, productInterest: c.productId, status: ['New', 'Unreachable', 'Contacted'].includes(lead.status) ? 'Queued' : lead.status });
    app.audit('Assigned campaign', `${lead.name} → ${c.name}`, 'Campaign');
    app.toast('Added to campaign', `${lead.name} → ${c.name}`);
  };
  const suppress = async () => {
    if (!(await confirm({ title: 'Add to suppression list?', desc: `${lead.phone} will be marked do-not-call and excluded from every campaign.`, confirmLabel: 'Suppress', danger: true }))) return;
    if (!suppressed) app.addSuppression({ phone: lead.phone, name: lead.name, reason: 'Customer opt-out', addedAt: new Date().toISOString(), addedBy: app.me.name });
    app.updateLead(lead.id, { dnc: true, status: 'Do not call' });
    app.audit('Added suppression', `${lead.name} (${lead.phone})`, 'Compliance');
    app.toast('Number suppressed', `${lead.name} will not be called`);
  };
  const callNow = () => {
    if (!elig.ok) { setBlocked(elig.reasons); return; }
    app.updateLead(lead.id, { status: 'Queued' });
    app.audit('Queued simulated call', `${lead.name} (${lead.id})`, 'Campaign');
    app.toast('Simulated call queued', `${lead.name} will be called by ${app.agentById.get(campaign?.agentId ?? 'ag-01')?.name ?? 'Ava'} (AI) at the next free slot — no real call is placed.`);
  };
  const addNote = () => { if (!note.trim()) return; app.addNote(lead.id, note.trim()); setNote(''); app.toast('Note added'); };
  const addTag = (t: string) => { const v = t.trim(); if (!v || lead.tags.includes(v)) return; app.updateLead(lead.id, { tags: [...lead.tags, v] }); setTagDraft(''); app.toast('Tag added', v); };
  const removeTag = (t: string) => app.updateLead(lead.id, { tags: lead.tags.filter((x) => x !== t) });
  const setFollowUp = () => {
    if (!fuDate) return;
    const d = fromInputs(fuDate, fuTime);
    if (d < NOW) { app.toast('Choose a future date', undefined, 'error'); return; }
    app.updateLead(lead.id, { nextFollowUp: d.toISOString() }); setFuDate('');
    app.toast('Follow-up set', fmtDateTime(d));
  };

  /* ----- campaign history ----- */
  const campHist = uniq(calls.map((c) => c.campaignId)).map((cid) => {
    const cc = calls.filter((c) => c.campaignId === cid);
    return { id: cid, camp: app.campaignById.get(cid), n: cc.length, last: cc[0] };
  });

  /* ----- activity timeline ----- */
  type Ev = { at: string; icon: ReactNode; title: ReactNode; sub?: ReactNode; tone?: string };
  const events: Ev[] = [
    { at: lead.createdAt, icon: <UserRoundPlus size={9} />, title: 'Lead created', sub: `Source: ${lead.source}` },
    ...calls.map((c): Ev => ({ at: c.startedAt, icon: <PhoneCall size={9} />, title: <span>AI call <Link to={`/conversations/${c.id}`} className="mono">{c.id}</Link> · {c.outcome}</span>, sub: `${app.agentById.get(c.agentId)?.name} · ${fmtDur(c.duration)} · score ${c.score}`, tone: c.connected ? 'var(--blue)' : undefined })),
    ...lead.notes.map((n): Ev => ({ at: n.at, icon: <StickyNote size={9} />, title: `Note by ${n.author}`, sub: n.text })),
    ...appts.map((a): Ev => ({ at: a.start, icon: <CalendarClock size={9} />, title: <span>{a.type} <Link to={`/appointments?appt=${a.id}`} className="mono">{a.id}</Link> · {a.status}</span>, sub: `with ${app.memberById.get(a.repId)?.name}`, tone: 'var(--lavender)' })),
    ...tasks.map((t): Ev => ({ at: t.due, icon: <ListTodo size={9} />, title: `Task: ${t.title}`, sub: t.done ? 'Completed' : `Due · ${t.priority} priority`, tone: t.done ? 'var(--green)' : undefined })),
  ];
  if (calls[0]) events.push({ at: new Date(new Date(calls[0].startedAt).getTime() + 60000).toISOString(), icon: <CircleDot size={9} />, title: <span>Status set to <StatusBadge status={lead.status} /></span>, sub: `Score ${lead.score}/100 · AI qualification`, tone: 'var(--green)' });
  events.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const tabs = [
    { value: 'overview' as const, label: 'Overview' }, { value: 'calls' as const, label: 'Calls', count: calls.length },
    { value: 'notes' as const, label: 'Notes', count: lead.notes.length }, { value: 'tasks' as const, label: 'Tasks & follow-ups', count: tasks.filter((t) => !t.done).length },
    { value: 'activity' as const, label: 'Activity', count: events.length },
  ];

  return (
    <>
      <PageFix />
      <div className="row small" style={{ marginBottom: 16 }}><Link to="/leads" className="row gap-4 muted"><ArrowLeft size={14} />Leads</Link><ChevronRight size={12} className="muted" /><span className="mono">{lead.id}</span></div>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div className="row grow" style={{ gap: 16 }}>
          <Avatar name={lead.name} size="xl" />
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title" style={{ fontSize: 30 }}>{lead.name}</h1>
            <div className="row-wrap mt-8">
              <span className="mono muted">{lead.id}</span><StatusBadge status={lead.status} /><ScoreBar value={lead.score} />
              {lead.archived && <Badge tone="outline">Archived</Badge>}{(lead.dnc || suppressed) && <Badge tone="red">Do not call</Badge>}
              {campaign && <Link to={`/campaigns/${campaign.id}`} className="small">{campaign.name}</Link>}
            </div>
          </div>
        </div>
        <div className="row-wrap">
          <Button size="sm" icon={<Edit3 />} onClick={() => setEditing(true)} disabled={!canEdit} title={noEdit}>Edit</Button>
          <Menu trigger={(t) => <Button size="sm" icon={<UserPlus />} iconRight={<ChevronDown size={13} />} onClick={t} disabled={!canAssign} title={canAssign ? undefined : 'Your role cannot assign leads'}>Assign rep</Button>}>
            {(close) => (<>
              <div className="menu-label label">Assign to</div>
              {reps.map((r) => <MenuItem key={r.id} onClick={() => { close(); assign(r.id); }}>{r.name}{r.products.includes(lead.productInterest) && <Badge tone="blue">Specialist</Badge>}{lead.assignedRepId === r.id && <Check size={14} style={{ marginLeft: 'auto' }} />}</MenuItem>)}
              <div className="menu-sep" /><MenuItem onClick={() => { close(); assign(null); }}>Unassign</MenuItem>
            </>)}
          </Menu>
          <Button size="sm" icon={<CalendarPlus />} onClick={() => setSched(true)} disabled={!canEdit} title={noEdit}>Schedule follow-up</Button>
          <Menu trigger={(t) => <Button size="sm" icon={<Megaphone />} iconRight={<ChevronDown size={13} />} onClick={t} disabled={!canEdit} title={noEdit}>Add to campaign</Button>}>
            {(close) => (<>
              <div className="menu-label label">Campaigns</div>
              {app.campaigns.filter((c) => ['Active', 'Paused', 'Scheduled', 'Draft'].includes(c.status)).map((c) => <MenuItem key={c.id} onClick={() => { close(); addToCampaign(c.id); }}>{c.name}<span style={{ marginLeft: 'auto' }}><StatusBadge status={c.status} dot={false} /></span></MenuItem>)}
            </>)}
          </Menu>
          <Button size="sm" variant="danger" icon={<ShieldOff />} onClick={suppress} disabled={!canEdit || lead.dnc} title={lead.dnc ? 'Already suppressed' : noEdit}>Suppress</Button>
          <Button size="sm" variant="primary" icon={<Phone />} onClick={callNow} disabled={!app.can('calling.control') && !canEdit}>Call now</Button>
        </div>
      </div>

      <div className="grid g-main-side">
        <div style={{ minWidth: 0 }}>
          <Tabs value={tab} onChange={setTab} tabs={tabs} />

          {tab === 'overview' && (
            <div className="col gap-16">
              <div className="grid g-2">
                <Card title="Customer information">
                  <KV items={[
                    ['Category', lead.customerType], ['City', lead.city], ['Current plan', lead.currentPlan], ['Tenure', lead.tenureMonths ? `${lead.tenureMonths} months (${(lead.tenureMonths / 12).toFixed(1)} yrs)` : 'New customer'],
                    ['Source', lead.source], ['Created', fmtDate(lead.createdAt)],
                  ]} />
                </Card>
                <Card title="Contact details">
                  <KV items={[
                    ['Phone', <span key="p" className="mono">{lead.phone}</span>], ['Email', <a key="e" href={`mailto:${lead.email}`}>{lead.email}</a>],
                    ['Consent', lead.consent ? <Badge key="c" tone="green" dot>Granted</Badge> : <Badge key="c" tone="red" dot>Not granted</Badge>],
                    ['Do not call', lead.dnc || suppressed ? <Badge key="d" tone="red">Suppressed</Badge> : <span key="d" className="muted">No</span>],
                    ['Attempts', `${lead.attempts}${campaign ? ` of ${campaign.retry.maxAttempts}` : ''}`], ['Last call', fmtRelative(lead.lastCallAt)],
                  ]} />
                </Card>
              </div>
              <div className="grid g-2">
                <Card title="Product interest">
                  {product ? (
                    <>
                      <div className="row between"><div><div className="cell-primary">{product.name}</div><div className="cell-sub">{product.category} · {product.contractMonths} months · {product.data}{product.speed ? ` · ${product.speed}` : ''}</div></div><div className="mono strong">{fmtGBP(product.monthlyPrice)}<span className="muted">/mo</span></div></div>
                      <div className="row-wrap mt-12">{product.benefits.map((b) => <span key={b} className="tag">{b}</span>)}</div>
                      {!product.approved && <div className="banner warn mt-12"><AlertTriangle />Product pending compliance approval — AI pitching is blocked.</div>}
                    </>
                  ) : <div className="muted small">No product set.</div>}
                </Card>
                <Card title="AI qualification" actions={<SimBadge />}>
                  <div className="row" style={{ gap: 20 }}>
                    <div><div className="kpi-value">{lead.score}<span className="muted" style={{ fontSize: 14 }}>/100</span></div><div className="mt-8" style={{ width: 120 }}><ScoreBar value={lead.score} showValue={false} /></div></div>
                    <div className="col gap-4 small">
                      <div className="row">Sentiment <StatusBadge status={lead.sentiment} dot={false} /></div>
                      <div className="row">Category <StatusBadge status={lead.status} /></div>
                      <div className="muted">{lead.score >= app.settings.hotThreshold ? `Above hot threshold (${app.settings.hotThreshold})` : lead.score >= app.settings.warmThreshold ? `Above warm threshold (${app.settings.warmThreshold})` : 'Below warm threshold'}</div>
                    </div>
                  </div>
                </Card>
              </div>
              <Card className="inset" title="AI summary" sub={calls[0] ? `From ${calls[0].id} · ${fmtRelative(calls[0].startedAt)}` : undefined}>
                <div style={{ color: 'var(--graphite)', lineHeight: 1.6 }}>{lead.aiSummary || 'This lead has not been contacted by an AI agent yet.'}</div>
              </Card>
              <div className="grid g-2">
                <Card title="Eligibility & compliance" sub={elig.ok ? 'Eligible for simulated AI calling' : `${elig.reasons.length} blocker${elig.reasons.length > 1 ? 's' : ''}`} actions={elig.ok ? <Badge tone="green" dot>Eligible</Badge> : <Badge tone="red" dot>Blocked</Badge>}>
                  <div className="col" style={{ gap: 10 }}>
                    {checks.map(([label, ok, sub]) => (
                      <div key={label} className="row" style={{ alignItems: 'flex-start' }}>
                        {ok ? <CheckCircle2 size={15} className="green" style={{ marginTop: 2, flexShrink: 0 }} /> : label.startsWith('Inside') ? <AlertTriangle size={15} className="orange" style={{ marginTop: 2, flexShrink: 0 }} /> : <XCircle size={15} className="red" style={{ marginTop: 2, flexShrink: 0 }} />}
                        <div><div className="small medium" style={{ color: 'var(--ink)' }}>{label}</div><div className="xs muted">{sub}</div></div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card flush title="Campaign history">
                  {campHist.length ? (
                    <div className="list" style={{ padding: '0 16px 8px' }}>
                      {campHist.map((h) => (
                        <div key={h.id} className="list-item clickable" onClick={() => nav(`/campaigns/${h.id}`)}>
                          <Megaphone size={14} className="muted" />
                          <div className="grow"><div className="cell-primary truncate">{h.camp?.name ?? h.id}</div><div className="cell-sub">{h.n} call{h.n > 1 ? 's' : ''} · last {fmtRelative(h.last.startedAt)}</div></div>
                          <StatusBadge status={h.last.outcome} />
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ padding: '0 16px 16px' }} className="small muted">{campaign ? `Queued in ${campaign.name} — not yet attempted.` : 'Not part of any campaign yet.'}</div>}
                </Card>
              </div>
            </div>
          )}

          {tab === 'calls' && (
            <Card flush>
              {calls.length ? (
                <div>
                  {calls.map((c) => <CallRow key={c.id} call={c} lead={lead} open={openCall === c.id} onToggle={() => setOpenCall(openCall === c.id ? null : c.id)} />)}
                </div>
              ) : <EmptyState icon={<PhoneCall size={18} />} title="No calls yet" desc="Simulated AI calls will appear here once the lead has been attempted." />}
            </Card>
          )}

          {tab === 'notes' && (
            <Card>
              <div className="col gap-8">
                <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a note — e.g. customer preferences, objections, agreed next steps…" disabled={!canEdit} />
                <div className="row between"><span className="xs muted">Notes are visible to everyone with access to this lead and are kept in the audit trail.</span><Button size="sm" variant="primary" icon={<Plus />} onClick={addNote} disabled={!note.trim() || !canEdit}>Add note</Button></div>
              </div>
              <div className="divider" />
              {lead.notes.length ? (
                <div className="list">
                  {lead.notes.map((n) => (
                    <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                      <Avatar name={n.author} size="sm" />
                      <div className="grow"><div className="row between"><span className="small medium" style={{ color: 'var(--ink)' }}>{n.author}</span><span className="xs muted mono">{fmtDateTime(n.at)}</span></div><div className="mt-4" style={{ color: 'var(--graphite)' }}>{n.text}</div></div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={<StickyNote size={18} />} title="No notes yet" />}
            </Card>
          )}

          {tab === 'tasks' && (
            <div className="col gap-16">
              <Card title="Tasks" sub={`${tasks.filter((t) => !t.done).length} open · ${tasks.filter((t) => !t.done && new Date(t.due) < NOW).length} overdue`} actions={<Button size="sm" icon={<Plus />} onClick={() => setTaskOpen(true)} disabled={!canEdit} title={noEdit}>Add task</Button>}>
                {tasks.length ? (
                  <div className="list">
                    {tasks.map((t) => {
                      const overdue = !t.done && new Date(t.due) < NOW;
                      return (
                        <div key={t.id} className="list-item">
                          <input type="checkbox" className="checkbox" checked={t.done} disabled={!canEdit} onChange={() => { app.upsertTask({ ...t, done: !t.done }); app.toast(t.done ? 'Task reopened' : 'Task completed', t.title); }} aria-label={`Mark ${t.title} done`} />
                          <div className="grow"><div className="cell-primary" style={t.done ? { textDecoration: 'line-through', color: 'var(--fog)' } : undefined}>{t.title}</div><div className="cell-sub">{app.memberById.get(t.repId)?.name} · <span className={overdue ? 'red' : ''}>{overdue ? 'Overdue · ' : ''}{fmtDateTime(t.due)}</span></div></div>
                          <StatusBadge status={t.priority} dot={false} />
                        </div>
                      );
                    })}
                  </div>
                ) : <EmptyState icon={<ListTodo size={18} />} title="No tasks" desc="Add a task to track the next step with this customer." />}
              </Card>
              <Card title="Appointments & follow-ups" actions={<Button size="sm" icon={<CalendarPlus />} onClick={() => setSched(true)} disabled={!canEdit}>Schedule</Button>}>
                {appts.length ? (
                  <div className="list">
                    {appts.map((a) => (
                      <div key={a.id} className="list-item clickable" onClick={() => nav(`/appointments?appt=${a.id}`)}>
                        <div className="inset-box" style={{ padding: '4px 8px', textAlign: 'center', minWidth: 56 }}><div className="xs muted">{new Date(a.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div><div className="mono small strong">{toTimeInput(new Date(a.start))}</div></div>
                        <div className="grow"><div className="cell-primary">{a.type}</div><div className="cell-sub">{app.memberById.get(a.repId)?.name} · {a.durationMin} min · {a.source}</div></div>
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                  </div>
                ) : <div className="small muted">No appointments booked.</div>}
              </Card>
            </div>
          )}

          {tab === 'activity' && (
            <Card>
              <div className="timeline">
                {events.map((e, i) => (
                  <div key={i} className="tl-item">
                    <span className="tl-dot" style={e.tone ? { borderColor: e.tone, color: e.tone } : { color: 'var(--fog)' }}>{e.icon}</span>
                    <div className="row between" style={{ alignItems: 'flex-start' }}>
                      <div className="small medium" style={{ color: 'var(--ink)' }}>{e.title}</div>
                      <span className="mono xs muted nowrap" title={fmtDateTime(e.at)}>{fmtRelative(e.at)}</span>
                    </div>
                    {e.sub && <div className="small muted mt-4">{e.sub}</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* sidebar */}
        <div className="col gap-16">
          <Card title="Assignment">
            <div className="row" style={{ marginBottom: 12 }}>
              {rep ? <><Avatar name={rep.name} initials={rep.initials} /><div className="grow"><div className="cell-primary">{rep.name}</div><div className="cell-sub">{rep.team} · {rep.status}</div></div></> : <span className="small muted">No rep assigned — lead is in the AI queue.</span>}
            </div>
            <select className="select sm soft" value={lead.assignedRepId ?? ''} onChange={(e) => assign(e.target.value || null)} disabled={!canAssign} title={canAssign ? undefined : 'Your role cannot assign leads'} aria-label="Assigned rep">
              <option value="">Unassigned</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}{r.products.includes(lead.productInterest) ? ' · specialist' : ''}</option>)}
            </select>
            {rep && <Link to={`/team/${rep.id}`} className="small mt-8" style={{ display: 'inline-block' }}>View rep profile</Link>}
          </Card>
          <Card title="Tags">
            <div className="row-wrap">
              {lead.tags.map((t) => <span key={t} className="tag">{t}{canEdit && <button className="btn ghost xs icon" style={{ width: 16, height: 16, padding: 0 }} onClick={() => removeTag(t)} aria-label={`Remove ${t}`}><X size={11} /></button>}</span>)}
              {!lead.tags.length && <span className="small muted">No tags</span>}
            </div>
            {canEdit && (
              <form className="row mt-12" onSubmit={(e) => { e.preventDefault(); addTag(tagDraft); }}>
                <input className="input sm soft" list="lead-tags" placeholder="Add tag…" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} />
                <datalist id="lead-tags">{TAGS.filter((t) => !lead.tags.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
                <Button size="sm" type="submit" disabled={!tagDraft.trim()}>Add</Button>
              </form>
            )}
          </Card>
          <Card title="Next follow-up">
            {lead.nextFollowUp ? (
              <div className="row" style={{ marginBottom: 12 }}>
                <CalendarClock size={16} className={new Date(lead.nextFollowUp) < NOW ? 'red' : 'muted'} />
                <div className="grow"><div className="cell-primary">{fmtDateTime(lead.nextFollowUp)}</div><div className={`cell-sub ${new Date(lead.nextFollowUp) < NOW ? 'red' : ''}`}>{new Date(lead.nextFollowUp) < NOW ? 'Overdue · ' : ''}{fmtRelative(lead.nextFollowUp)}</div></div>
                {canEdit && <Button size="xs" variant="ghost" onClick={() => { app.updateLead(lead.id, { nextFollowUp: null }); app.toast('Follow-up cleared'); }}>Clear</Button>}
              </div>
            ) : <div className="small muted" style={{ marginBottom: 12 }}>No follow-up scheduled.</div>}
            {canEdit && (
              <div className="row">
                <input type="date" className="input sm soft" value={fuDate} min={toDateInput(NOW)} onChange={(e) => setFuDate(e.target.value)} aria-label="Follow-up date" />
                <input type="time" className="input sm soft" style={{ width: 100 }} value={fuTime} onChange={(e) => setFuTime(e.target.value)} aria-label="Follow-up time" />
                <Button size="sm" onClick={setFollowUp} disabled={!fuDate}>Set</Button>
              </div>
            )}
            <Button size="sm" variant="ghost" className="mt-8" icon={<CalendarPlus />} onClick={() => setSched(true)} disabled={!canEdit}>Book appointment instead</Button>
          </Card>
          <Card title="Upcoming" sub="Open tasks and appointments">
            <div className="list">
              {appts.filter((a) => new Date(a.start) > NOW && !['Cancelled', 'Completed'].includes(a.status)).slice(0, 3).map((a) => (
                <div key={a.id} className="list-item clickable" onClick={() => nav(`/appointments?appt=${a.id}`)}><CalendarClock size={14} className="muted" /><div className="grow"><div className="small medium" style={{ color: 'var(--ink)' }}>{a.type}</div><div className="xs muted">{fmtDateTime(a.start)}</div></div><StatusBadge status={a.status} dot={false} /></div>
              ))}
              {tasks.filter((t) => !t.done).slice(0, 3).map((t) => (
                <div key={t.id} className="list-item"><ListTodo size={14} className={new Date(t.due) < NOW ? 'red' : 'muted'} /><div className="grow"><div className="small medium" style={{ color: 'var(--ink)' }}>{t.title}</div><div className={`xs ${new Date(t.due) < NOW ? 'red' : 'muted'}`}>{fmtRelative(t.due)}</div></div></div>
              ))}
              {!appts.some((a) => new Date(a.start) > NOW) && !tasks.some((t) => !t.done) && <div className="small muted">Nothing scheduled.</div>}
            </div>
          </Card>
        </div>
      </div>

      <LeadFormModal open={editing} onClose={() => setEditing(false)} lead={lead} />
      <ScheduleModal open={sched} onClose={() => setSched(false)} leadId={lead.id} title="Schedule follow-up" />
      <TaskModal open={taskOpen} onClose={() => setTaskOpen(false)} leadId={lead.id} defaultRepId={lead.assignedRepId} />
      <Modal open={!!blocked} onClose={() => setBlocked(null)} title="Call blocked by compliance checks" desc="No call was queued. Resolve the following before this lead can be contacted:"
        footer={<Button variant="primary" onClick={() => setBlocked(null)}>Got it</Button>}>
        <div className="col gap-8">
          {blocked?.map((r) => <div key={r} className="banner warn"><ShieldCheck />{r}</div>)}
          <div className="xs muted">Checks run automatically before every simulated AI call and are recorded in the audit log.</div>
        </div>
      </Modal>
    </>
  );
}

function CallRow({ call, lead, open, onToggle }: { call: Call; lead: Lead; open: boolean; onToggle: () => void }) {
  const app = useApp();
  const agent = app.agentById.get(call.agentId);
  const lines = open ? app.transcriptFor(call) : [];
  return (
    <div style={{ borderBottom: '1px solid var(--ash)' }}>
      <div className="row" style={{ padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap' }} onClick={onToggle}>
        {open ? <ChevronDown size={14} className="muted" /> : <ChevronRight size={14} className="muted" />}
        <div className="grow" style={{ minWidth: 200 }}>
          <div className="row-wrap"><Link to={`/conversations/${call.id}`} className="mono" onClick={(e) => e.stopPropagation()}>{call.id}</Link><StatusBadge status={call.outcome} /><StatusBadge status={call.sentiment} dot={false} /></div>
          <div className="cell-sub mt-4">{fmtDateTime(call.startedAt)} · {agent?.name} (AI) · {app.campaignById.get(call.campaignId)?.name}</div>
        </div>
        <div className="row" style={{ gap: 16 }}>
          <span className="mono small">{fmtDur(call.duration)}</span>
          <ScoreBar value={call.score} />
          <span className="row gap-4 xs muted"><FileAudio size={12} />{call.recording}</span>
        </div>
      </div>
      {open && (
        <div style={{ padding: '0 16px 16px 38px' }}>
          <div className="inset-box small" style={{ color: 'var(--graphite)' }}>{call.summary}</div>
          <div className="row-wrap mt-12 small">
            <span className="muted">Recording reference:</span><span className="mono">REC-{call.id.slice(3)}</span><span className="muted">·</span><span className="mono xs muted">s3://vf-recordings/{call.startedAt.slice(0, 10)}/{call.id}.wav</span>
            <Link to={`/conversations/${call.id}`} className="row gap-4" style={{ marginLeft: 'auto' }}><Activity size={13} />Open conversation</Link>
          </div>
          <div className="mt-12" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <Transcript lines={lines.slice(0, 10)} agentName={agent?.name ?? 'Ava'} customerName={lead.name} agentColor={agent?.color} />
          </div>
          {lines.length > 10 && <Link to={`/conversations/${call.id}`} className="small mt-8" style={{ display: 'inline-block' }}>View full transcript ({lines.length} lines)</Link>}
        </div>
      )}
    </div>
  );
}
