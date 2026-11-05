// Local model for the agent builder. Extra builder configuration is persisted on the
// agent record under `builder` (an additive field the shared Agent type does not declare),
// so other pages keep working unchanged. Backend integration point: agent config API.
import type { Agent, Offer, Product } from '../../data/types';
import { NOW, DAY } from '../../data/seed';

export const AGENT_COLORS = ['#2563EB', '#1E40AF', '#16A34A', '#7C3AED', '#EA580C', '#0A0A0A', '#525252', '#A3A3A3'];
export const VOICES = [
  'Ava — Neural (Warm)', 'Leo — Neural (Confident)', 'Isla — Neural (Calm)', 'Arjun — Neural (Professional)',
  'Ffion — Neural (Friendly)', 'Max — Neural (Direct)', 'Grace — Neural (Bright)', 'Kwame — Neural (Assured)',
];
export const LANGUAGES = ['English (UK)', 'English / Welsh', 'English (US)', 'English (Ireland)'];
export const ACCENTS = ['Southern English', 'Northern English', 'Scottish', 'Welsh', 'Neutral British', 'Irish', 'Midlands'];
export const ROLES = ['Outbound sales', 'Contract renewal', 'Retention', 'Business development', 'Appointment setting'];
export const VARIABLES = ['{first_name}', '{last_name}', '{current_plan}', '{product_name}', '{monthly_price}', '{contract_months}', '{offer_name}', '{agent_name}', '{renewal_date}'];

export type NodeType = 'start' | 'step' | 'branch' | 'end';
export interface FlowNode { id: string; title: string; type: NodeType; x: number; y: number; prompt: string; conditions: string }
export interface FlowEdge { id: string; from: string; to: string; label: string }
export interface Script { id: string; productId: string; opening: string; pitch: string; closing: string }
export interface KbEntry { id: string; category: KbCategory; title: string; content: string; approved: boolean; updatedAt: string }
export interface Criterion { key: string; label: string; desc: string; enabled: boolean; weight: number }
export interface TestRun { id: string; scenario: string; at: string; checks: { label: string; pass: boolean; detail: string }[] }

export const KB_CATEGORIES = ['Mobile packages', 'Broadband plans', 'SIM-only', 'Business products', 'Pricing', 'Contract terms', 'Promotions', 'Eligibility rules', 'FAQs'] as const;
export type KbCategory = typeof KB_CATEGORIES[number];

export interface Builder {
  description: string; role: string;
  pitch: number; pauseMs: number; noiseSuppression: boolean;
  tone: { formality: number; detail: number; empathy: number }; bannedPhrases: string[];
  disclosure: string;
  scripts: Script[];
  flow: { nodes: FlowNode[]; edges: FlowEdge[] };
  kbCustom: KbEntry[]; kbExcluded: string[];
  criteria: Criterion[]; hotThreshold: number; warmThreshold: number; minScore: number;
  ending: { optOut: 'End call immediately' | 'Confirm then end'; suppress: boolean; voicemail: 'Leave message' | 'Hang up' | 'Send SMS instead'; voicemailMessage: string; maxDurationMin: number; summary: boolean; crmWriteBack: boolean; crmTarget: string };
  tests: TestRun[];
  environment: 'Draft' | 'Testing' | 'Live'; trafficSplit: number;
  snapshots: Record<string, Draft>;
}

export interface Draft {
  name: string; color: string; voice: string; language: string; accent: string; personality: string;
  instructions: string; greeting: string; speakingRate: number; temperature: number;
  objections: Agent['objections']; escalation: Agent['escalation'];
  builder: Omit<Builder, 'snapshots' | 'tests'>;
}

export type AgentX = Agent & { builder?: Builder; archived?: boolean; description?: string };

/* ---------- flow defaults ---------- */
const MAIN = ['Call initiated', 'Introduction', 'Customer identification', 'Needs assessment', 'Product pitch', 'Objection handling', 'Qualification', 'Appointment booking', 'AI summary', 'Human handover'];
const MAIN_PROMPTS: Record<string, string> = {
  'Call initiated': 'Run compliance check (consent, suppression list, permitted hours) then dial.',
  Introduction: 'Greet the customer, state you are an AI assistant calling on behalf of Vodafone and that the call is recorded.',
  'Customer identification': 'Confirm you are speaking with the account holder using first line of billing address.',
  'Needs assessment': 'Ask how they use their mobile / broadband today and what matters most.',
  'Product pitch': 'Recommend the best-fit approved product. Quote only approved prices and terms.',
  'Objection handling': 'Use the objection library. Never pressure the customer.',
  Qualification: 'Score budget, authority, need and timeline against qualification criteria.',
  'Appointment booking': 'Offer two slots with a human specialist and confirm the chosen time back.',
  'AI summary': 'Generate a call summary, outcome and next steps for the CRM.',
  'Human handover': 'Route to the assigned sales representative with full context.',
};
export const FLOW_NODE_W = 168;
const COL = (i: number) => 30 + i * 220;
export function defaultFlow(): Builder['flow'] {
  const nodes: FlowNode[] = MAIN.map((t, i) => ({
    id: `n${i + 1}`, title: t, type: i === 0 ? 'start' : i === MAIN.length - 1 ? 'end' : 'step',
    x: i < 5 ? COL(i) : COL(4 - (i - 5)), y: i < 5 ? 30 : 300,
    prompt: MAIN_PROMPTS[t] ?? '', conditions: '',
  }));
  const br: [string, number, number, string][] = [
    ['Unreachable', COL(0), 165, 'No answer, busy or voicemail after 25s'],
    ['Customer opts out', COL(1), 165, 'Customer says stop, remove me or do not call'],
    ['Customer requests a human', COL(2), 165, 'Customer asks for a person or advisor'],
    ['Customer has questions', COL(3), 165, 'Customer asks about product details'],
    ['Interested', COL(5), 165, 'Positive buying signal detected'],
    ['Not interested', COL(4), 440, 'Customer declines after objection handling'],
    ['Callback requested', COL(3), 440, 'Customer asks to be called another time'],
  ];
  br.forEach(([t, x, y, c], i) => nodes.push({ id: `b${i + 1}`, title: t, type: 'branch', x, y, prompt: '', conditions: c }));
  const e = (from: string, to: string, label = '') => ({ id: `e-${from}-${to}`, from, to, label });
  const edges: FlowEdge[] = [
    e('n1', 'n2', 'Answered'), e('n2', 'n3'), e('n3', 'n4', 'Verified'), e('n4', 'n5'), e('n5', 'n6', 'Objection'),
    e('n6', 'n7', 'Resolved'), e('n7', 'n8', 'Qualified'), e('n8', 'n9', 'Booked'), e('n9', 'n10'),
    e('n1', 'b1', 'No answer'), e('n2', 'b2', 'Opt-out'), e('n3', 'b3', 'Asks for human'), e('b3', 'n10', 'Escalate'),
    e('n4', 'b4', 'Questions'), e('b4', 'n5', 'Answered'), e('n5', 'b5', 'Positive'), e('b5', 'n7'),
    e('n6', 'b6', 'Declines'), e('b6', 'n9'), e('n6', 'b7', 'Not now'), e('b7', 'n9', 'Schedule'),
  ];
  return { nodes, edges };
}

export const DEFAULT_CRITERIA: Criterion[] = [
  { key: 'budget', label: 'Budget', desc: 'Customer confirms monthly price is affordable', enabled: true, weight: 25 },
  { key: 'authority', label: 'Authority', desc: 'Account holder or business decision maker', enabled: true, weight: 25 },
  { key: 'need', label: 'Need', desc: 'Clear usage need matched to the product', enabled: true, weight: 30 },
  { key: 'timeline', label: 'Timeline', desc: 'Intends to switch or upgrade within 30 days', enabled: true, weight: 20 },
];

export function defaultBuilder(a: AgentX, products: Product[]): Builder {
  const biz = /B2B|business/i.test(a.personality);
  const prods = products.filter((p) => (biz ? p.category.startsWith('Business') : !p.category.startsWith('Business'))).slice(0, 2);
  return {
    description: a.description ?? `${a.personality}. Handles outbound ${biz ? 'SME and business' : 'consumer'} sales conversations.`,
    role: biz ? 'Business development' : 'Outbound sales',
    pitch: 1, pauseMs: 400, noiseSuppression: true,
    tone: { formality: biz ? 70 : 45, detail: 50, empathy: 70 },
    bannedPhrases: ['Act now', 'Limited time only', 'Guaranteed savings', 'Trust me'],
    disclosure: 'This call is recorded for quality and training purposes. I am an AI assistant calling on behalf of Vodafone.',
    scripts: prods.map((p, i) => ({
      id: `s${i + 1}`, productId: p.id,
      opening: `I'm calling because you're eligible for ${p.name}.`,
      pitch: `${p.name} gives you ${p.data.toLowerCase()} data${p.speed ? ` and ${p.speed} average speeds` : ''} for £${p.monthlyPrice} a month on a ${p.contractMonths}-month plan.`,
      closing: 'Would you like me to book a quick call with a specialist to go through the details?',
    })),
    flow: defaultFlow(),
    kbCustom: [
      { id: 'kb-1', category: 'FAQs', title: 'Can I keep my number?', content: 'Yes. Customers can keep their number; porting completes within one working day using a PAC code.', approved: true, updatedAt: new Date(NOW.getTime() - 5 * DAY).toISOString() },
      { id: 'kb-2', category: 'Contract terms', title: 'Annual price changes', content: 'Monthly plan prices increase each April by the fixed amount stated in the contract summary.', approved: true, updatedAt: new Date(NOW.getTime() - 46 * DAY).toISOString() },
      { id: 'kb-3', category: 'FAQs', title: 'Cooling-off period', content: 'Customers have 14 days to cancel a new contract under the Consumer Contracts Regulations.', approved: false, updatedAt: new Date(NOW.getTime() - 2 * DAY).toISOString() },
    ],
    kbExcluded: [],
    criteria: DEFAULT_CRITERIA.map((c) => ({ ...c, enabled: c.key === 'authority' ? true : c.enabled })),
    hotThreshold: 85, warmThreshold: 60, minScore: biz ? 75 : 65,
    ending: { optOut: 'End call immediately', suppress: true, voicemail: 'Hang up', voicemailMessage: 'Hi, this is {agent_name} calling from Vodafone about an offer for your account. No action is needed — we will try again another time.', maxDurationMin: 12, summary: true, crmWriteBack: true, crmTarget: 'Salesforce' },
    tests: [],
    environment: a.status === 'Live' ? 'Live' : a.status === 'Testing' ? 'Testing' : 'Draft', trafficSplit: 100,
    snapshots: {},
  };
}

export function builderOf(a: AgentX, products: Product[]): Builder {
  return a.builder ?? defaultBuilder(a, products);
}

export function draftOf(a: AgentX, products: Product[]): Draft {
  const { snapshots: _s, tests: _t, ...b } = builderOf(a, products);
  return {
    name: a.name, color: a.color, voice: a.voice, language: a.language, accent: a.accent, personality: a.personality,
    instructions: a.instructions, greeting: a.greeting, speakingRate: a.speakingRate, temperature: a.temperature,
    objections: a.objections, escalation: a.escalation, builder: b,
  };
}

export function bumpVersion(v: string, kind: 'minor' | 'patch' = 'minor') {
  const m = /v?(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return 'v1.0.0';
  const [maj, min, pat] = [+m[1], +m[2], +m[3]];
  return kind === 'minor' ? `v${maj}.${min + 1}.0` : `v${maj}.${min}.${pat + 1}`;
}

/* Product-derived knowledge-base entries (read-only here; edited in Products). */
export interface DerivedKb extends KbEntry { source: 'product' | 'offer'; refId: string }
export function derivedKb(products: Product[], offers: Offer[]): DerivedKb[] {
  const cat = (p: Product): KbCategory => p.category === 'Mobile' || p.category === 'Device' ? 'Mobile packages' : p.category === 'SIM Only' ? 'SIM-only' : p.category.startsWith('Business') ? 'Business products' : 'Broadband plans';
  const out: DerivedKb[] = [];
  products.filter((p) => p.availability !== 'Retired').forEach((p) => {
    out.push({ id: `p:${p.id}`, source: 'product', refId: p.id, category: cat(p), title: p.name, content: `${p.description} ${p.benefits.join(' · ')}`, approved: p.approved, updatedAt: p.lastReviewed });
    out.push({ id: `pr:${p.id}`, source: 'product', refId: p.id, category: 'Pricing', title: `${p.name} — price`, content: `£${p.monthlyPrice}/month${p.upfront ? `, £${p.upfront} upfront` : ''}.`, approved: p.approved, updatedAt: p.lastReviewed });
    out.push({ id: `ct:${p.id}`, source: 'product', refId: p.id, category: 'Contract terms', title: `${p.name} — contract`, content: `${p.contractMonths === 1 ? '30-day rolling' : `${p.contractMonths}-month`} contract.`, approved: p.approved, updatedAt: p.lastReviewed });
    out.push({ id: `el:${p.id}`, source: 'product', refId: p.id, category: 'Eligibility rules', title: `${p.name} — eligibility`, content: p.eligibility, approved: p.approved, updatedAt: p.lastReviewed });
  });
  offers.filter((o) => o.status !== 'Expired').forEach((o) => {
    out.push({ id: `o:${o.id}`, source: 'offer', refId: o.id, category: 'Promotions', title: o.name, content: `${o.discount}. ${o.description} Code ${o.code}.`, approved: o.status === 'Active' || o.status === 'Scheduled', updatedAt: o.startDate });
  });
  return out;
}

export const isStale = (iso: string) => NOW.getTime() - new Date(iso).getTime() > 30 * DAY;

/** Section-level diff between two drafts, used for the version history diff summary. */
export function diffSummary(a: Draft | undefined, b: Draft | undefined): string[] {
  if (!a || !b) return [];
  const out: string[] = [];
  const eq = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (a.name !== b.name || a.color !== b.color || a.builder.description !== b.builder.description || a.builder.role !== b.builder.role) out.push('Identity');
  if (a.voice !== b.voice || a.language !== b.language || a.accent !== b.accent || a.speakingRate !== b.speakingRate || a.builder.pitch !== b.builder.pitch || a.builder.pauseMs !== b.builder.pauseMs || a.builder.noiseSuppression !== b.builder.noiseSuppression) out.push('Voice');
  if (!eq(a.builder.tone, b.builder.tone) || !eq(a.builder.bannedPhrases, b.builder.bannedPhrases) || a.personality !== b.personality) out.push('Personality');
  if (a.instructions !== b.instructions || a.greeting !== b.greeting || a.builder.disclosure !== b.builder.disclosure) out.push('Instructions');
  if (!eq(a.builder.scripts, b.builder.scripts)) out.push('Scripts');
  if (!eq(a.builder.flow, b.builder.flow)) out.push('Flow');
  if (!eq(a.builder.kbCustom, b.builder.kbCustom) || !eq(a.builder.kbExcluded, b.builder.kbExcluded)) out.push('Knowledge base');
  if (!eq(a.objections, b.objections)) out.push('Objections');
  if (!eq(a.builder.criteria, b.builder.criteria) || a.builder.hotThreshold !== b.builder.hotThreshold || a.builder.warmThreshold !== b.builder.warmThreshold || a.builder.minScore !== b.builder.minScore) out.push('Qualification');
  if (!eq(a.escalation, b.escalation)) out.push('Escalation');
  if (!eq(a.builder.ending, b.builder.ending)) out.push('Call ending');
  if (a.builder.environment !== b.builder.environment || a.builder.trafficSplit !== b.builder.trafficSplit) out.push('Publishing');
  return out;
}

export function uid(prefix: string) { return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`; }

/** Seed data carries a fixed version list that may not match agent.version; reconcile for display and publishing. */
export function versionsOf(a: Agent): Agent['versions'] {
  if (a.versions.some((v) => v.version === a.version)) return a.versions;
  return a.versions.map((v) => v.status === 'Published' ? { ...v, version: a.version }
    : v.status === 'Draft' ? { ...v, version: `${bumpVersion(a.version)}-draft` } : v);
}
