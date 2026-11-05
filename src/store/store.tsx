import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as seed from '../data/seed';
import type {
  Agent, Appointment, AuditEntry, Call, CallOutcome, Campaign, ConsentRecord, DeletionRequest, Lead, LeadStatus,
  Notification, Offer, Product, Role, Suppression, Task, TeamMember, TranscriptLine,
} from '../data/types';

// ---------------- RBAC ----------------
export type Permission =
  | 'leads.edit' | 'leads.delete' | 'leads.import' | 'leads.export' | 'leads.assign'
  | 'campaigns.manage' | 'calling.control' | 'calling.takeover'
  | 'agents.edit' | 'agents.publish' | 'products.manage' | 'team.manage'
  | 'compliance.manage' | 'settings.manage' | 'recordings.listen' | 'reports.export';

const ALL: Permission[] = ['leads.edit', 'leads.delete', 'leads.import', 'leads.export', 'leads.assign', 'campaigns.manage', 'calling.control', 'calling.takeover', 'agents.edit', 'agents.publish', 'products.manage', 'team.manage', 'compliance.manage', 'settings.manage', 'recordings.listen', 'reports.export'];
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  'Super Admin': ALL,
  Administrator: ALL.filter((p) => p !== 'leads.delete'),
  'Sales Manager': ['leads.edit', 'leads.import', 'leads.export', 'leads.assign', 'campaigns.manage', 'calling.control', 'recordings.listen', 'reports.export', 'products.manage'],
  Supervisor: ['leads.edit', 'leads.assign', 'calling.control', 'calling.takeover', 'recordings.listen', 'reports.export'],
  'Sales Representative': ['leads.edit', 'recordings.listen'],
  Analyst: ['leads.export', 'reports.export', 'recordings.listen'],
};

// ---------------- Live (simulated) calls ----------------
export const STAGES = ['Dialling', 'Compliance check', 'Introduction', 'Identification', 'Needs assessment', 'Product pitch', 'Objection handling', 'Qualification', 'Booking', 'Wrap-up'] as const;
export interface LiveCall {
  id: string; leadId: string; campaignId: string; agentId: string; startedAt: number;
  stage: number; elapsed: number; sentiment: 'Positive' | 'Neutral' | 'Negative'; intent: number; progress: number;
  lines: TranscriptLine[]; plannedOutcome: CallOutcome; plannedDuration: number;
  whisper: boolean; takenOver: boolean; monitoring: boolean;
}

export interface Settings {
  orgName: string; workspace: string; timezone: string;
  callingHours: { start: string; end: string; days: string[] };
  maxConcurrent: number; dailyCap: number; recordCalls: boolean; disclosure: string; retentionDays: number; transcriptRetentionDays: number;
  assignment: 'Round-robin' | 'Product-based' | 'Team-based' | 'Priority-based' | 'Manual';
  hotThreshold: number; warmThreshold: number;
  notify: Record<string, { inApp: boolean; email: boolean }>;
  integrations: Record<string, { connected: boolean; account?: string }>;
  security: { sso: boolean; mfa: boolean; sessionTimeout: number; ipAllowlist: boolean };
  callingPaused: boolean;
}

export interface Toast { id: number; title: string; desc?: string; kind?: 'success' | 'error' | 'info' }

interface State {
  leads: Lead[]; calls: Call[]; campaigns: Campaign[]; agents: Agent[]; products: Product[]; offers: Offer[];
  team: TeamMember[]; appointments: Appointment[]; tasks: Task[]; notifications: Notification[];
  suppressions: Suppression[]; deletionRequests: DeletionRequest[]; auditLog: AuditEntry[]; consents: ConsentRecord[];
  settings: Settings; live: LiveCall[];
}

const initialSettings: Settings = {
  orgName: 'Vodafone UK', workspace: 'Consumer & SME Outbound', timezone: 'Europe/London',
  callingHours: { start: '09:00', end: '20:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
  maxConcurrent: 40, dailyCap: 3000, recordCalls: true,
  disclosure: 'This call is recorded for quality and training purposes. I am an AI assistant calling on behalf of Vodafone.',
  retentionDays: 90, transcriptRetentionDays: 365,
  assignment: 'Product-based', hotThreshold: 85, warmThreshold: 60,
  notify: {
    'New qualified leads': { inApp: true, email: true }, 'High-priority leads': { inApp: true, email: true },
    'Campaign completion': { inApp: true, email: false }, 'AI agent failures': { inApp: true, email: true },
    'Calling capacity limits': { inApp: true, email: false }, 'Follow-up deadlines': { inApp: true, email: true },
    Appointments: { inApp: true, email: false }, 'Expired promotions': { inApp: true, email: false }, 'Unusual calling activity': { inApp: true, email: true },
  },
  integrations: {
    'Twilio Voice': { connected: true, account: 'AC•••• 7f21 (sandbox)' }, 'Vonage': { connected: false }, 'Genesys Cloud': { connected: false },
    'Salesforce': { connected: true, account: 'vodafone-uk.my.salesforce.com' }, 'Microsoft Dynamics 365': { connected: false }, 'HubSpot': { connected: false },
    'Google Calendar': { connected: false }, 'Microsoft Outlook': { connected: true, account: 'Exchange Online' },
    'ElevenLabs Voice': { connected: true, account: 'Voice library (demo)' }, 'Amazon S3 Recordings': { connected: true, account: 'eu-west-2 / vf-recordings' }, 'Snowflake': { connected: false },
  },
  security: { sso: true, mfa: true, sessionTimeout: 30, ipAllowlist: false },
  callingPaused: false,
};

interface Ctx extends State {
  role: Role; setRole: (r: Role) => void; can: (p: Permission) => boolean; me: TeamMember;
  toast: (title: string, desc?: string, kind?: Toast['kind']) => void; toasts: Toast[]; dismissToast: (id: number) => void;
  updateLead: (id: string, patch: Partial<Lead>) => void; updateLeads: (ids: string[], patch: Partial<Lead>) => void;
  addLead: (l: Omit<Lead, 'id'>) => Lead; addLeads: (ls: Omit<Lead, 'id'>[]) => void; archiveLeads: (ids: string[]) => void; deleteLeads: (ids: string[]) => void;
  addNote: (leadId: string, text: string) => void;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void; addCampaign: (c: Omit<Campaign, 'id'>) => Campaign;
  updateAgent: (id: string, patch: Partial<Agent>) => void; addAgent: (a: Omit<Agent, 'id'>) => Agent;
  upsertProduct: (p: Product) => void; upsertOffer: (o: Offer) => void;
  upsertAppointment: (a: Appointment) => void; upsertTask: (t: Task) => void;
  updateMember: (id: string, patch: Partial<TeamMember>) => void; addMember: (m: Omit<TeamMember, 'id'>) => void;
  markNotification: (id: string, read: boolean) => void; markAllRead: () => void;
  addSuppression: (s: Omit<Suppression, 'id'>) => void; removeSuppression: (id: string) => void;
  updateDeletion: (id: string, patch: Partial<DeletionRequest>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateLive: (id: string, patch: Partial<LiveCall>) => void; endLive: (id: string, outcome?: CallOutcome) => void;
  audit: (action: string, target: string, category: AuditEntry['category']) => void;
  // lookups
  leadById: Map<string, Lead>; campaignById: Map<string, Campaign>; agentById: Map<string, Agent>; productById: Map<string, Product>; memberById: Map<string, TeamMember>;
  transcriptFor: (c: Call) => TranscriptLine[];
  eligibility: (l: Lead) => { ok: boolean; reasons: string[] };
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error('no ctx'); return c; };

let liveSeq = 990000;
let callSeqLive = 900000;
let toastSeq = 1;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(() => ({
    leads: seed.leads, calls: seed.calls, campaigns: seed.campaigns, agents: seed.agents, products: seed.products, offers: seed.offers,
    team: seed.team, appointments: seed.appointments, tasks: seed.tasks, notifications: seed.notifications,
    suppressions: seed.suppressions, deletionRequests: seed.deletionRequests, auditLog: seed.auditLog, consents: seed.consents,
    settings: initialSettings, live: [],
  }));
  const [role, setRoleState] = useState<Role>(() => { try { return (localStorage.getItem('vf-role') as Role) || 'Super Admin'; } catch { return 'Super Admin'; } });
  const setRole = (r: Role) => { setRoleState(r); try { localStorage.setItem('vf-role', r); } catch { /* ignore */ } };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((title: string, desc?: string, kind: Toast['kind'] = 'success') => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, title, desc, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const me = useMemo(() => {
    const byRole = state.team.find((t) => t.role === role);
    return byRole ?? state.team[0];
  }, [role, state.team]);
  const can = useCallback((p: Permission) => ROLE_PERMISSIONS[role].includes(p), [role]);

  const audit = useCallback((action: string, target: string, category: AuditEntry['category']) => {
    setState((s) => ({ ...s, auditLog: [{ id: `AU-${Date.now()}`, at: new Date().toISOString(), actor: me.name, action, target, ip: '10.24.18.77', category }, ...s.auditLog] }));
  }, [me.name]);

  const leadById = useMemo(() => new Map(state.leads.map((l) => [l.id, l])), [state.leads]);
  const campaignById = useMemo(() => new Map(state.campaigns.map((l) => [l.id, l])), [state.campaigns]);
  const agentById = useMemo(() => new Map(state.agents.map((l) => [l.id, l])), [state.agents]);
  const productById = useMemo(() => new Map(state.products.map((l) => [l.id, l])), [state.products]);
  const memberById = useMemo(() => new Map(state.team.map((l) => [l.id, l])), [state.team]);
  const suppressedPhones = useMemo(() => new Set(state.suppressions.map((s) => s.phone)), [state.suppressions]);

  const eligibility = useCallback((l: Lead) => {
    const reasons: string[] = [];
    if (!l.consent) reasons.push('No valid marketing consent');
    if (l.dnc || suppressedPhones.has(l.phone)) reasons.push('On do-not-call suppression list');
    if (l.archived) reasons.push('Lead archived');
    if (['Converted', 'Do not call', 'Not interested'].includes(l.status)) reasons.push(`Status is “${l.status}”`);
    const camp = l.campaignId ? campaignById.get(l.campaignId) : undefined;
    if (camp && l.attempts >= camp.retry.maxAttempts) reasons.push(`Attempt limit reached (${camp.retry.maxAttempts})`);
    return { ok: reasons.length === 0, reasons };
  }, [suppressedPhones, campaignById]);

  const mapUpdate = <K extends keyof State>(key: K, id: string, patch: object) =>
    setState((s) => ({ ...s, [key]: (s[key] as unknown as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const api: Omit<Ctx, keyof State | 'role' | 'setRole' | 'can' | 'me' | 'toast' | 'toasts' | 'dismissToast' | 'audit' | 'leadById' | 'campaignById' | 'agentById' | 'productById' | 'memberById' | 'eligibility'> = {
    updateLead: (id, patch) => mapUpdate('leads', id, patch),
    updateLeads: (ids, patch) => { const set = new Set(ids); setState((s) => ({ ...s, leads: s.leads.map((l) => (set.has(l.id) ? { ...l, ...patch } : l)) })); },
    addLead: (l) => { const lead = { ...l, id: `LD-${60000 + Math.floor(Math.random() * 30000)}` } as Lead; setState((s) => ({ ...s, leads: [lead, ...s.leads] })); return lead; },
    addLeads: (ls) => setState((s) => ({ ...s, leads: [...ls.map((l, i) => ({ ...l, id: `LD-${70000 + Math.floor(Math.random() * 20000) + i}` }) as Lead), ...s.leads] })),
    archiveLeads: (ids) => { const set = new Set(ids); setState((s) => ({ ...s, leads: s.leads.map((l) => (set.has(l.id) ? { ...l, archived: true } : l)) })); },
    deleteLeads: (ids) => { const set = new Set(ids); setState((s) => ({ ...s, leads: s.leads.filter((l) => !set.has(l.id)) })); },
    addNote: (leadId, text) => setState((s) => ({ ...s, leads: s.leads.map((l) => (l.id === leadId ? { ...l, notes: [{ id: `n-${Date.now()}`, author: me.name, at: new Date().toISOString(), text }, ...l.notes] } : l)) })),
    updateCampaign: (id, patch) => mapUpdate('campaigns', id, patch),
    addCampaign: (c) => { const camp = { ...c, id: `CMP-${1100 + Math.floor(Math.random() * 800)}` } as Campaign; setState((s) => ({ ...s, campaigns: [camp, ...s.campaigns] })); return camp; },
    updateAgent: (id, patch) => mapUpdate('agents', id, patch),
    addAgent: (a) => { const ag = { ...a, id: `ag-${10 + Math.floor(Math.random() * 89)}` } as Agent; setState((s) => ({ ...s, agents: [...s.agents, ag] })); return ag; },
    upsertProduct: (p) => setState((s) => ({ ...s, products: s.products.some((x) => x.id === p.id) ? s.products.map((x) => (x.id === p.id ? p : x)) : [...s.products, p] })),
    upsertOffer: (o) => setState((s) => ({ ...s, offers: s.offers.some((x) => x.id === o.id) ? s.offers.map((x) => (x.id === o.id ? o : x)) : [o, ...s.offers] })),
    upsertAppointment: (a) => setState((s) => ({ ...s, appointments: s.appointments.some((x) => x.id === a.id) ? s.appointments.map((x) => (x.id === a.id ? a : x)) : [...s.appointments, a] })),
    upsertTask: (t) => setState((s) => ({ ...s, tasks: s.tasks.some((x) => x.id === t.id) ? s.tasks.map((x) => (x.id === t.id ? t : x)) : [t, ...s.tasks] })),
    updateMember: (id, patch) => mapUpdate('team', id, patch),
    addMember: (m) => setState((s) => ({ ...s, team: [...s.team, { ...m, id: `u-${100 + s.team.length}` } as TeamMember] })),
    markNotification: (id, read) => mapUpdate('notifications', id, { read }),
    markAllRead: () => setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
    addSuppression: (sp) => setState((s) => ({ ...s, suppressions: [{ ...sp, id: `SP-${Date.now() % 100000}` }, ...s.suppressions] })),
    removeSuppression: (id) => setState((s) => ({ ...s, suppressions: s.suppressions.filter((x) => x.id !== id) })),
    updateDeletion: (id, patch) => mapUpdate('deletionRequests', id, patch),
    updateSettings: (patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    updateLive: (id, patch) => setState((s) => ({ ...s, live: s.live.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
    endLive: (id, outcome) => setState((s) => finishLive(s, id, outcome)),
    transcriptFor: (c: Call) => {
      const lead = leadById.get(c.leadId); const agent = agentById.get(c.agentId);
      if (!lead) return [];
      return seed.getTranscript(c, lead, agent?.name ?? 'Ava');
    },
  };

  // ---------- live simulation engine (SIMULATED — no real calls) ----------
  const stateRef = useRef(state); stateRef.current = state;
  useEffect(() => {
    // seed a few in-progress calls immediately
    setState((s) => fillLive(s, 7, true));
    const iv = setInterval(() => {
      setState((s) => {
        let next = { ...s, live: s.live.map((lc) => advance(lc, s)) };
        const done = next.live.filter((lc) => !lc.takenOver && lc.elapsed >= lc.plannedDuration);
        for (const d of done) next = finishLive(next, d.id);
        if (!next.settings.callingPaused && Math.random() < 0.45) next = fillLive(next, 1, false);
        return next;
      });
    }, 1500);
    return () => clearInterval(iv);
  }, []);

  const value: Ctx = {
    ...state, ...api, role, setRole, can, me, toast, toasts, dismissToast, audit,
    leadById, campaignById, agentById, productById, memberById, eligibility,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

// ---------- simulation helpers ----------
const SCRIPT: Record<number, [TranscriptLine['speaker'], string][]> = {
  1: [['System', 'Compliance check passed: consent valid, not suppressed, inside permitted hours.']],
  2: [['AI', 'Hi, is that {first}? This is {agent}, an AI assistant calling on behalf of Vodafone. This call is recorded for quality and training.'], ['Customer', 'Yes, that’s me.']],
  3: [['AI', 'Thanks {first}. Could you confirm the first line of your billing address for security?'], ['Customer', 'Sure — it’s 14 Mill Lane.']],
  4: [['AI', 'Lovely. How do you mostly use your connection day to day?'], ['Customer', 'Lots of streaming, and I work from home three days a week.']],
  5: [['AI', 'Based on that, {product} would be a great fit — it’s £{price} a month on a {months}-month plan.'], ['Customer', 'Okay, what’s actually included?']],
  6: [['Customer', 'It sounds a little more than I pay now, though.'], ['AI', 'I understand. With your Together Discount it comes down by £5 a month — would that work better?']],
  7: [['AI', 'Would you be looking to switch in the next month or so?'], ['Customer', 'Yes, probably — if the price is right.']],
  8: [['AI', 'Great. Shall I book a quick call with a specialist to finalise everything — Thursday at 11?'], ['Customer', 'Thursday works.']],
  9: [['AI', 'Perfect, that’s booked. Thanks {first}, have a lovely day!'], ['System', 'Generating AI summary and handover…']],
};

function fillLive(s: State, n: number, warm: boolean): State {
  if (s.settings.callingPaused) return s;
  const activeCamps = s.campaigns.filter((c) => c.status === 'Active');
  if (!activeCamps.length) return s;
  const cap = Math.min(s.settings.maxConcurrent, activeCamps.reduce((a, c) => a + c.concurrency, 0), 14);
  const live = [...s.live];
  const busy = new Set(live.map((l) => l.leadId));
  for (let i = 0; i < n && live.length < cap; i++) {
    const camp = activeCamps[Math.floor(Math.random() * activeCamps.length)];
    if (live.filter((l) => l.campaignId === camp.id).length >= camp.concurrency) continue;
    const pool = s.leads.filter((l) => l.campaignId === camp.id && !busy.has(l.id) && l.consent && !l.dnc && ['Queued', 'New', 'Contacted', 'Callback requested'].includes(l.status));
    if (!pool.length) continue;
    const lead = pool[Math.floor(Math.random() * pool.length)];
    busy.add(lead.id);
    const r = Math.random();
    const plannedOutcome: CallOutcome = r < 0.28 ? 'No answer' : r < 0.36 ? 'Voicemail' : r < 0.58 ? 'Not interested' : r < 0.68 ? 'Callback requested' : r < 0.84 ? 'Interested' : 'Qualified';
    const connected = !['No answer', 'Voicemail'].includes(plannedOutcome);
    const plannedDuration = connected ? 40 + Math.floor(Math.random() * 60) : 8 + Math.floor(Math.random() * 10);
    const elapsed = warm ? Math.floor(Math.random() * plannedDuration * 0.7) : 0;
    const lc: LiveCall = {
      id: `LV-${liveSeq++}`, leadId: lead.id, campaignId: camp.id, agentId: camp.agentId, startedAt: Date.now() - elapsed * 1000 * 4,
      stage: 0, elapsed: 0, sentiment: 'Neutral', intent: 20, progress: 0, lines: [], plannedOutcome, plannedDuration,
      whisper: false, takenOver: false, monitoring: false,
    };
    let x = lc; for (let k = 0; k < elapsed; k++) x = advance(x, s, true);
    live.push(x);
  }
  return { ...s, live };
}

function advance(lc: LiveCall, s: State, silent = false): LiveCall {
  if (lc.takenOver) return { ...lc, elapsed: lc.elapsed + 1 };
  const elapsed = lc.elapsed + 1;
  const connected = !['No answer', 'Voicemail'].includes(lc.plannedOutcome);
  const maxStage = connected ? (lc.plannedOutcome === 'Not interested' ? 6 : lc.plannedOutcome === 'Callback requested' ? 3 : 9) : 0;
  const stage = Math.min(maxStage, Math.floor((elapsed / lc.plannedDuration) * (maxStage + 1)));
  let lines = lc.lines;
  if (stage > lc.stage || (elapsed === 1 && lines.length === 0)) {
    const lead = s.leads.find((l) => l.id === lc.leadId)!;
    const agent = s.agents.find((a) => a.id === lc.agentId);
    const camp = s.campaigns.find((c) => c.id === lc.campaignId)!;
    const p = s.products.find((x) => x.id === camp.productId)!;
    const fill = (t: string) => t.replace('{first}', lead.name.split(' ')[0]).replace('{agent}', agent?.name ?? 'Ava').replace('{product}', p.name).replace('{price}', String(p.monthlyPrice)).replace('{months}', String(p.contractMonths));
    const add: TranscriptLine[] = [];
    if (!connected && elapsed === 1) add.push({ t: 0, speaker: 'System', text: 'Dialling… ringing.' });
    for (let st = lc.stage + 1; st <= stage; st++) {
      let script = SCRIPT[st] ?? [];
      if (lc.plannedOutcome === 'Callback requested' && st === 3) script = [['Customer', 'Sorry, I’m driving — can you call me back this evening?'], ['AI', 'Of course. I’ll arrange a callback after 6pm. Drive safely!']];
      if (lc.plannedOutcome === 'Not interested' && st === 6) script = [['Customer', 'I’m happy with what I have at the moment, thanks.'], ['AI', 'No problem at all — thanks for your time, {first}.']];
      script.forEach(([sp, tx]) => add.push({ t: lc.elapsed * 4, speaker: sp, text: fill(tx), flag: st === 6 ? 'objection' : st === 5 ? 'pricing' : undefined }));
    }
    lines = [...lines, ...add];
  }
  const target = lc.plannedOutcome === 'Qualified' ? 88 : lc.plannedOutcome === 'Interested' ? 68 : lc.plannedOutcome === 'Not interested' ? 14 : 40;
  const intent = Math.round(lc.intent + (target - lc.intent) * 0.12 + (silent ? 0 : (Math.random() - 0.5) * 4));
  const sentiment = intent > 60 ? 'Positive' : intent < 25 && stage > 4 ? 'Negative' : 'Neutral';
  return { ...lc, elapsed, stage, lines, intent: Math.max(0, Math.min(100, intent)), sentiment, progress: Math.min(100, Math.round((stage / 9) * 100)) };
}

function finishLive(s: State, id: string, forced?: CallOutcome): State {
  const lc = s.live.find((x) => x.id === id);
  if (!lc) return s;
  const outcome = forced ?? lc.plannedOutcome;
  const camp = s.campaigns.find((c) => c.id === lc.campaignId)!;
  const connected = !['No answer', 'Voicemail', 'Busy', 'Failed'].includes(outcome);
  const duration = Math.round(lc.elapsed * 4);
  const score = outcome === 'Qualified' ? 80 + Math.floor(Math.random() * 15) : outcome === 'Interested' ? 62 : outcome === 'Callback requested' ? 45 : outcome === 'Transferred to human' ? 82 : connected ? 15 : 0;
  const lead = s.leads.find((l) => l.id === lc.leadId)!;
  const call: Call = {
    id: `CL-${callSeqLive++}`, leadId: lc.leadId, campaignId: lc.campaignId, agentId: lc.agentId, startedAt: new Date(lc.startedAt).toISOString(),
    duration, outcome, connected, sentiment: lc.sentiment, intent: lc.intent, score, productId: camp.productId,
    cost: +((Math.max(duration, 6) / 60) * camp.costPerMinute).toFixed(3), recording: connected ? 'Processing' : 'Not recorded',
    summary: connected ? `Simulated call — ${outcome.toLowerCase()}. ${lead.name.split(' ')[0]} discussed ${s.products.find((p) => p.id === camp.productId)?.name}.` : `Simulated call — ${outcome.toLowerCase()}.`,
    objections: lc.lines.some((l) => l.flag === 'objection') ? ['Price too high'] : [], questions: connected ? ['What’s actually included?'] : [], unanswered: [], simulated: true,
  };
  const statusMap: Partial<Record<CallOutcome, LeadStatus>> = { Qualified: score >= s.settings.hotThreshold ? 'Hot' : 'Warm', Interested: 'Warm', 'Callback requested': 'Callback requested', 'Not interested': 'Not interested', 'No answer': 'Contacted', Voicemail: 'Contacted', 'Transferred to human': 'Hot' };
  const leads = s.leads.map((l) => l.id === lc.leadId ? { ...l, attempts: l.attempts + 1, lastCallAt: call.startedAt, status: statusMap[outcome] ?? l.status, score: Math.max(l.score, score), sentiment: lc.sentiment, aiSummary: call.summary } : l);
  const campaigns = s.campaigns.map((c) => c.id === camp.id ? { ...c, attempted: c.attempted + (lead.attempts === 0 ? 1 : 0), connected: c.connected + (connected ? 1 : 0), qualified: c.qualified + (outcome === 'Qualified' ? 1 : 0), warm: c.warm + (outcome === 'Interested' ? 1 : 0), minutes: c.minutes + Math.round(duration / 60) } : c);
  let notifications = s.notifications;
  if (outcome === 'Qualified') {
    notifications = [{ id: `NT-${Date.now()}`, category: 'Leads', priority: 'High', title: 'New qualified lead (simulated)', body: `${lead.name} qualified with score ${score}/100 on ${camp.name}.`, at: new Date().toISOString(), read: false, link: `/qualified?lead=${lead.id}` }, ...s.notifications];
  }
  return { ...s, live: s.live.filter((x) => x.id !== id), calls: [call, ...s.calls], leads, campaigns, notifications };
}
