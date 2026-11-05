// Pure database-row to screen-model adapters for Live mode. No Supabase calls here.
import type { Call, CallOutcome, Campaign, Lead, LeadStatus, Role, Suppression, TeamMember, TranscriptLine } from '../data/types';
import { products, initialsOf } from '../data/seed';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const COST_PER_MINUTE = 0.22; // assumed rate, shown as an estimate

const ROLES: Record<string, Role> = {
  admin: 'Administrator', sales_manager: 'Sales Manager', salesperson: 'Sales Representative', analyst: 'Analyst',
};
export const toRole = (dbRole: string): Role => ROLES[dbRole];

const LEAD_STATUS: Record<string, LeadStatus> = {
  new: 'New', dialling: 'Contacted', retry: 'Contacted', callback: 'Callback requested',
  closed: 'Not interested', exhausted: 'Unreachable', do_not_call: 'Do not call',
};
export function toLeadStatus(row: Row): LeadStatus {
  if (row.sales_status) return row.sales_status as LeadStatus;
  if (row.status === 'interested') return (row.score ?? 0) >= 85 ? 'Hot' : 'Warm';
  return LEAD_STATUS[row.status] ?? 'New';
}
// Queueing never touches sales_status: clearing it would hand a lead a rep holds back to the dialler
export const leadStatusPatch = (status: LeadStatus): { sales_status?: string | null } =>
  (status === 'Queued' ? {} : { sales_status: status === 'New' ? null : status });

export function toLead(row: Row, notes: Row[]): Lead {
  return {
    id: String(row.id), name: row.name ?? '', phone: row.phone ?? '', email: row.email ?? '', city: row.city ?? '',
    customerType: row.customer_type ?? 'Business', currentPlan: row.current_plan ?? '', tenureMonths: 0,
    productInterest: row.product_ref ?? products[0].id, // pages look products up by id
    source: row.source ?? 'CSV import', campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    status: toLeadStatus(row), score: row.score ?? 0, sentiment: row.sentiment ?? 'Neutral',
    lastCallAt: row.last_call_at ?? null, attempts: row.attempts ?? 0,
    assignedRepId: row.assigned_to ?? null, nextFollowUp: row.next_follow_up ?? null,
    tags: row.tags ?? [], consent: !!row.consent, dnc: row.status === 'do_not_call', createdAt: row.created_at,
    archived: !!row.archived,
    notes: notes.map((n) => ({ id: String(n.id), author: n.author, at: n.created_at, text: n.text })),
    aiSummary: row.ai_summary ?? '',
    callable: !row.sales_status && !!row.consent && !row.archived && ['new', 'retry', 'callback'].includes(row.status),
  };
}

const defined = (o: Row): Row => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Only the columns web users may update; everything else in the patch is dropped. */
export const leadToDb = (p: Partial<Lead>): Row => defined({
  name: p.name, email: p.email, city: p.city, customer_type: p.customerType, tags: p.tags, consent: p.consent, archived: p.archived,
  assigned_to: p.assignedRepId, next_follow_up: p.nextFollowUp, product_ref: p.productInterest, campaign_id: p.campaignId,
  ...(p.status ? leadStatusPatch(p.status) : {}),
});
export const leadInsertRow = (l: Omit<Lead, 'id'>): Row => ({ ...leadToDb(l), phone: l.phone, source: l.source, current_plan: l.currentPlan });

const CAMPAIGN_STATUS: Record<string, Campaign['status']> = {
  draft: 'Draft', approved: 'Scheduled', running: 'Active', paused: 'Paused', done: 'Completed',
};
export const campaignStatusToDb = (s: Campaign['status']): string =>
  ({ Draft: 'draft', Scheduled: 'approved', Active: 'running', Paused: 'paused', Completed: 'done', Stopped: 'done' })[s];

export const campaignToDb = (p: Partial<Campaign>): Row => defined({
  name: p.name, status: p.status && campaignStatusToDb(p.status), product_ref: p.productId, agent_ref: p.agentId, offer_ref: p.offerId,
  description: p.description, segment: p.segment, start_date: p.startDate, end_date: p.endDate,
  days: p.schedule?.days, calling_hours_start: p.schedule?.start, calling_hours_end: p.schedule?.end,
  max_attempts: p.retry?.maxAttempts, retry_hours: p.retry?.intervalHours, concurrency: p.concurrency, daily_cap: p.dailyCap,
  min_score: p.qualification?.minScore,
});

export const campaignStats = (calls: Call[]) => ({
  attempted: new Set(calls.map((c) => c.leadId)).size,
  connected: calls.filter((c) => c.connected).length,
  warm: calls.filter((c) => c.outcome === 'Interested').length,
  qualified: calls.filter((c) => c.outcome === 'Qualified').length,
  minutes: Math.round(calls.reduce((s, c) => s + c.duration, 0) / 60),
});

const hhmm = (t: string | null | undefined, d: string) => (t ? t.slice(0, 5) : d);
export function toCampaign(
  row: Row,
  stats: Partial<Pick<Campaign, 'totalLeads' | 'attempted' | 'connected' | 'warm' | 'qualified' | 'minutes'>>,
): Campaign {
  return {
    id: String(row.id), name: row.name, productId: row.product_ref ?? products[0].id, offerId: row.offer_ref ?? null,
    agentId: row.agent_ref ?? '', status: CAMPAIGN_STATUS[row.status] ?? 'Draft',
    startDate: row.start_date ?? row.created_at, endDate: row.end_date ?? row.created_at,
    totalLeads: 0, attempted: 0, connected: 0, warm: 0, qualified: 0, minutes: 0, ...stats,
    costPerMinute: COST_PER_MINUTE, segment: row.segment ?? '',
    schedule: {
      days: row.days ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: hhmm(row.calling_hours_start, '09:00'),
      end: hhmm(row.calling_hours_end, '17:00'), timezone: 'Europe/Dublin',
    },
    retry: { maxAttempts: row.max_attempts ?? 3, intervalHours: row.retry_hours ?? 4 },
    concurrency: row.concurrency ?? 2, dailyCap: row.daily_cap ?? 0,
    qualification: { minScore: row.min_score ?? 70, requireBudget: false, requireDecisionMaker: false, requireTimeline: false },
    createdBy: row.created_by ?? '', description: row.description ?? '',
  };
}

const OUTCOME: Record<string, CallOutcome> = {
  callback: 'Callback requested', not_interested: 'Not interested', do_not_call: 'Opted out', no_answer: 'No answer',
  voicemail: 'Voicemail', no_response: 'No answer', unreachable: 'Failed', hung_up: 'Not interested',
};
const NOT_CONNECTED = ['no_answer', 'voicemail', 'unreachable', 'no_response'];
const SENTIMENT = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' } as const;

/** `row.analyses` is the joined analysis (or null); `campaign` supplies the agent and product refs. */
export function toCall(row: Row, campaign?: { agent_ref?: string | null; product_ref?: string | null } | null): Call {
  const a: Row = (Array.isArray(row.analyses) ? row.analyses[0] : row.analyses) ?? {};
  const score: number = a.score ?? 0;
  const duration: number = row.duration_s ?? 0;
  const outcome: CallOutcome = row.outcome === 'interested' ? (score >= 85 ? 'Qualified' : 'Interested') : OUTCOME[row.outcome] ?? 'Failed';
  return {
    id: String(row.id), leadId: String(row.lead_id), campaignId: String(row.campaign_id),
    agentId: campaign?.agent_ref ?? '', productId: campaign?.product_ref ?? products[0].id,
    startedAt: row.created_at, duration, outcome, connected: !NOT_CONNECTED.includes(row.outcome),
    sentiment: SENTIMENT[String(a.sentiment).toLowerCase() as keyof typeof SENTIMENT] ?? 'Neutral',
    intent: score, score, cost: (duration / 60) * COST_PER_MINUTE, recording: 'Not recorded',
    summary: a.brief ?? row.notes ?? '', objections: a.objections ?? [], questions: a.questions ?? [], unanswered: a.unanswered ?? [],
    ...(a.qualification ? { qualification: a.qualification } : {}),
    simulated: false,
  };
}

export const stripTags = (text: string): string => text.replace(/\[[^\]]*\]\s*/g, '').replace(/\s+/g, ' ').trim();

export const toTranscript = (rows: Row[]): TranscriptLine[] =>
  rows.map((r) => ({ t: r.t_seconds ?? 0, speaker: r.role === 'agent' ? 'AI' : 'Customer', text: stripTags(r.text) }));

export function toMember(row: Row): TeamMember {
  const name = row.full_name || row.email || 'Unnamed';
  return {
    id: row.id, name, initials: initialsOf(name), email: row.email ?? '', role: toRole(row.role) ?? 'Analyst',
    team: 'Operations', products: [], status: 'Available', capacity: 0, conversions: 0, revenue: 0, responseHrs: 0,
    joined: row.created_at, lastActive: row.created_at,
  };
}

/** The phone is the primary key, so it doubles as the id. The table stores no name, so the caller supplies one. */
export const toSuppression = (row: Row, name: string): Suppression => ({
  id: row.phone, phone: row.phone, name, reason: row.reason ?? 'Customer opt-out', addedAt: row.created_at, addedBy: row.source,
});
