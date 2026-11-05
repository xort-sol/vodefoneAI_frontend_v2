// Deterministic demonstration dataset. Every module reads from this single model,
// so dashboard metrics, lead records, campaign performance and call history agree.
// ALL call activity here is SIMULATED — no real outbound calls are placed.
import type {
  Agent, Appointment, AuditEntry, Call, CallOutcome, Campaign, ConsentRecord, DeletionRequest,
  Lead, LeadStatus, Notification, Offer, Product, Sentiment, Suppression, Task, TeamMember, TranscriptLine,
} from './types';

// ---------- seeded RNG ----------
let _s = 20261105;
export function rand() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a: number, b: number) => Math.floor(rand() * (b - a + 1)) + a;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
function weighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = rand() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
}
const pad = (n: number, l = 4) => String(n).padStart(l, '0');

// ---------- time anchor ----------
const _now = new Date();
_now.setSeconds(0, 0);
export const NOW = _now;
export const DAY = 86400000;
export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const TODAY = startOfDay(NOW);
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number, h = 10, m = 0) => { const d = new Date(TODAY.getTime() - n * DAY); d.setHours(h, m, 0, 0); return d; };
const daysAhead = (n: number, h = 10, m = 0) => daysAgo(-n, h, m);

// ---------- people ----------
const FIRST = ['Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Ava', 'Noah', 'Mia', 'Jack', 'Sophia', 'Leo', 'Grace', 'Arthur', 'Lily', 'Muhammad', 'Freya', 'Oscar', 'Emily', 'Charlie', 'Ella', 'Henry', 'Poppy', 'Theo', 'Florence', 'Jacob', 'Evie', 'Alfie', 'Rosie', 'Thomas', 'Willow', 'Aisha', 'Priya', 'Rohan', 'Zara', 'Daniel', 'Hannah', 'Samuel', 'Chloe', 'Ethan', 'Lucy', 'Callum', 'Megan', 'Fatima', 'Kwame', 'Siobhan', 'Ewan', 'Niamh', 'Rhys', 'Bethan', 'Imran'];
const LAST = ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Patel', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts', 'Green', 'Hall', 'Thomas', 'Clarke', 'Jackson', 'Wood', 'Harris', 'Edwards', 'Turner', 'Martin', 'Cooper', 'Hill', 'Ward', 'Hughes', 'Khan', 'Ali', 'Begum', 'Murphy', "O'Brien", 'Campbell', 'Kelly', 'Morgan', 'Reid', 'Shah', 'Okafor', 'Mensah', 'Nowak', 'Kowalski', 'Fraser', 'MacDonald', 'Lewis', 'Price', 'Bennett', 'Chen'];
const CITIES = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Bristol', 'Liverpool', 'Edinburgh', 'Cardiff', 'Newcastle', 'Sheffield', 'Nottingham', 'Leicester', 'Belfast', 'Southampton', 'Reading', 'Newbury'];
const COMPANIES = ['Brightwell Dental', 'Hartley & Co Accountants', 'Northgate Logistics', 'Pennine Joinery', 'Cobalt Studio', 'Greenleaf Florists', 'Atlas Physio', 'Riverside Vets', 'Kestrel Engineering', 'Maple Lettings', 'Orbit Coffee', 'Harbour Legal'];
export const initialsOf = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

// ---------- products ----------
export const products: Product[] = [
  { id: 'p-unl-max', name: 'Unlimited Max 5G', category: 'Mobile', description: 'Unlimited data, calls and texts with the fastest available 5G speeds and EU roaming included.', monthlyPrice: 42, upfront: 0, contractMonths: 24, data: 'Unlimited', benefits: ['Unlimited 5G data', 'EU roaming in 81 destinations', 'Entertainment add-on of choice', 'Secure Net included'], eligibility: 'Existing customers in renewal window or new customers passing credit check.', availability: 'Available', approved: true, lastReviewed: iso(daysAgo(6)) },
  { id: 'p-unl-lite', name: 'Unlimited Lite', category: 'Mobile', description: 'Unlimited data at 2Mbps — ideal for messaging, music and browsing.', monthlyPrice: 24, upfront: 0, contractMonths: 24, data: 'Unlimited (2Mbps)', benefits: ['Unlimited data', 'Unlimited calls & texts', 'Annual price rise capped'], eligibility: 'All consumer customers.', availability: 'Available', approved: true, lastReviewed: iso(daysAgo(12)) },
  { id: 'p-sim-100', name: 'SIM Only 100GB', category: 'SIM Only', description: '100GB of 5G data on a flexible 12-month SIM Only plan.', monthlyPrice: 16, upfront: 0, contractMonths: 12, data: '100GB', benefits: ['5G at no extra cost', 'Keep your number', 'Inclusive EU roaming'], eligibility: 'Customers with an unlocked handset.', availability: 'Available', approved: true, lastReviewed: iso(daysAgo(3)) },
  { id: 'p-sim-30', name: 'SIM Only 30GB', category: 'SIM Only', description: 'Great-value 30GB SIM Only plan on a rolling 30-day contract.', monthlyPrice: 10, upfront: 0, contractMonths: 1, data: '30GB', benefits: ['30-day rolling', 'No credit check', '5G ready'], eligibility: 'All customers.', availability: 'Available', approved: true, lastReviewed: iso(daysAgo(20)) },
  { id: 'p-fibre-500', name: 'Full Fibre 500', category: 'Fibre', description: 'Average download speeds of 500Mbps with a Pro Wi-Fi hub and Super Wi-Fi guarantee.', monthlyPrice: 35, upfront: 0, contractMonths: 24, data: 'Unlimited', speed: '500Mbps', benefits: ['Pro II Wi-Fi hub', 'Super Wi-Fi guarantee', '4G broadband back-up', 'Free installation'], eligibility: 'Addresses with Full Fibre availability.', availability: 'Available', approved: true, lastReviewed: iso(daysAgo(9)) },
  { id: 'p-fibre-900', name: 'Full Fibre 900', category: 'Fibre', description: 'Gigabit-class speeds for busy households, gaming and 4K streaming.', monthlyPrice: 45, upfront: 0, contractMonths: 24, data: 'Unlimited', speed: '910Mbps', benefits: ['Wi-Fi 6E hub', 'Whole-home Wi-Fi extenders', 'Static IP option'], eligibility: 'Addresses with Full Fibre availability.', availability: 'Limited', approved: true, lastReviewed: iso(daysAgo(15)) },
  { id: 'p-bb-74', name: 'Superfast Broadband 74', category: 'Broadband', description: 'Reliable fibre-to-the-cabinet broadband with average speeds of 67Mbps.', monthlyPrice: 26, upfront: 0, contractMonths: 24, data: 'Unlimited', speed: '67Mbps', benefits: ['Ultra Hub included', 'Price guarantee', 'Pairs with mobile for discount'], eligibility: 'All serviceable UK addresses.', availability: 'Available', approved: true, lastReviewed: iso(daysAgo(30)) },
  { id: 'p-biz-unl', name: 'Business Unlimited', category: 'Business Mobile', description: 'Unlimited 5G data per user with business-grade support and device management.', monthlyPrice: 28, upfront: 0, contractMonths: 24, data: 'Unlimited', benefits: ['Dedicated account manager (10+ lines)', 'Device management', 'Next-business-day replacement', 'Shared data pools'], eligibility: 'Registered UK businesses; prices exclude VAT.', availability: 'Available', approved: true, lastReviewed: iso(daysAgo(4)) },
  { id: 'p-biz-fibre', name: 'Business Fibre 900', category: 'Business Broadband', description: 'Business Full Fibre with static IP, 4G back-up and 24/7 UK support.', monthlyPrice: 49, upfront: 0, contractMonths: 24, data: 'Unlimited', speed: '900Mbps', benefits: ['Static IP', '4G back-up', 'Fix-time guarantee', '24/7 support'], eligibility: 'Registered UK businesses; prices exclude VAT.', availability: 'Available', approved: true, lastReviewed: iso(daysAgo(8)) },
  { id: 'p-dev-upg', name: 'Device Upgrade — Flagship', category: 'Device', description: 'Early upgrade to a latest-generation flagship handset with trade-in credit.', monthlyPrice: 54, upfront: 29, contractMonths: 36, data: 'Unlimited', benefits: ['Trade-in up to £400', 'Spread device cost over 36 months', 'Upgrade anytime with Evo'], eligibility: 'Customers 18+ months into contract.', availability: 'Available', approved: false, lastReviewed: iso(daysAgo(41)) },
];
const PRODUCT_W: [string, number][] = [['p-unl-max', 18], ['p-unl-lite', 8], ['p-sim-100', 16], ['p-sim-30', 6], ['p-fibre-500', 16], ['p-fibre-900', 6], ['p-bb-74', 5], ['p-biz-unl', 12], ['p-biz-fibre', 8], ['p-dev-upg', 9]];

export const offers: Offer[] = [
  { id: 'o-1', name: 'Winter Switch — 6 months half price', productIds: ['p-fibre-500', 'p-fibre-900'], discount: '50% for 6 months', description: 'New and recontracting broadband customers get half-price line rental for the first six months.', startDate: iso(daysAgo(20)), endDate: iso(daysAhead(40)), status: 'Active', code: 'WINTER50' },
  { id: 'o-2', name: 'Together Discount', productIds: ['p-unl-max', 'p-unl-lite', 'p-fibre-500', 'p-bb-74'], discount: '£5/month off mobile', description: 'Customers with mobile and broadband save £5 per month on each mobile plan.', startDate: iso(daysAgo(200)), endDate: iso(daysAhead(160)), status: 'Active', code: 'TOGETHER5' },
  { id: 'o-3', name: 'Business Starter — 3 months free', productIds: ['p-biz-unl'], discount: '3 months free on additional lines', description: 'Businesses adding 3+ lines get the first three months free on additional lines.', startDate: iso(daysAgo(10)), endDate: iso(daysAhead(80)), status: 'Active', code: 'BIZ3FREE' },
  { id: 'o-4', name: 'Black Friday SIM 100GB', productIds: ['p-sim-100'], discount: '£12/month', description: 'Limited-time price on 100GB SIM Only.', startDate: iso(daysAhead(16)), endDate: iso(daysAhead(28)), status: 'Scheduled', code: 'BF100' },
  { id: 'o-5', name: 'Autumn Upgrade Credit', productIds: ['p-dev-upg'], discount: '£100 extra trade-in', description: 'Additional trade-in credit on eligible devices.', startDate: iso(daysAgo(70)), endDate: iso(daysAgo(2)), status: 'Expired', code: 'AUTUMN100' },
  { id: 'o-6', name: 'Fibre Pro Hub upgrade', productIds: ['p-fibre-900'], discount: 'Free Wi-Fi 6E extender', description: 'Draft promotion pending pricing approval.', startDate: iso(daysAhead(30)), endDate: iso(daysAhead(90)), status: 'Draft', code: 'PROHUB' },
];

// ---------- team ----------
const TEAM_RAW: [string, TeamMember['role'], TeamMember['team'], string[]][] = [
  ['Sarah Mitchell', 'Super Admin', 'Operations', []],
  ['James Okonkwo', 'Administrator', 'Operations', []],
  ['Rachel Adeyemi', 'Sales Manager', 'Consumer Sales', ['p-unl-max', 'p-sim-100']],
  ['Tom Hargreaves', 'Sales Manager', 'Business Sales', ['p-biz-unl', 'p-biz-fibre']],
  ['Priya Raman', 'Sales Representative', 'Consumer Sales', ['p-unl-max', 'p-dev-upg', 'p-unl-lite']],
  ['Ben Carter', 'Sales Representative', 'Consumer Sales', ['p-fibre-500', 'p-fibre-900', 'p-bb-74']],
  ['Hannah Lewis', 'Sales Representative', 'Consumer Sales', ['p-sim-100', 'p-sim-30', 'p-unl-lite']],
  ['Marcus Bell', 'Sales Representative', 'Business Sales', ['p-biz-unl']],
  ['Aisha Rahman', 'Sales Representative', 'Business Sales', ['p-biz-fibre', 'p-biz-unl']],
  ['Daniel Kowalski', 'Sales Representative', 'Retention', ['p-unl-max', 'p-dev-upg']],
  ['Chloe Davies', 'Sales Representative', 'Retention', ['p-fibre-500', 'p-sim-100']],
  ['Owen Price', 'Supervisor', 'Operations', []],
  ['Leila Haddad', 'Supervisor', 'Consumer Sales', []],
  ['Nina Patel', 'Analyst', 'Insights', []],
];
export const team: TeamMember[] = TEAM_RAW.map(([name, role, teamName, prods], i) => ({
  id: `u-${pad(i + 1, 3)}`,
  name, initials: initialsOf(name),
  email: name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.') + '@vodafone-demo.co.uk',
  role, team: teamName, products: prods,
  status: weighted<TeamMember['status']>([['Available', 5], ['Busy', 3], ['Away', 1], ['Offline', 1]]),
  capacity: role === 'Sales Representative' ? ri(25, 40) * 0 + [60, 70, 80][i % 3] : 0,
  conversions: 0, revenue: 0, responseHrs: +(1 + rand() * 5).toFixed(1),
  joined: iso(daysAgo(ri(120, 1400))),
  lastActive: iso(new Date(NOW.getTime() - ri(2, 300) * 60000)),
}));
export const reps = team.filter((t) => t.role === 'Sales Representative');
export const CURRENT_USER_ID = 'u-001';

// ---------- agents ----------
const AGENT_RAW: [string, string, string, string, string, Agent['status'], string][] = [
  ['Ava', 'Ava — Neural (Warm)', 'English (UK)', 'Southern English', 'Warm, consultative and reassuring', 'Live', '#2563EB'],
  ['Leo', 'Leo — Neural (Confident)', 'English (UK)', 'Northern English', 'Upbeat, concise and confident', 'Live', '#16A34A'],
  ['Isla', 'Isla — Neural (Calm)', 'English (UK)', 'Scottish', 'Calm, patient and detail-oriented', 'Live', '#7C3AED'],
  ['Arjun', 'Arjun — Neural (Professional)', 'English (UK)', 'Neutral British', 'Professional, B2B-focused, value-led', 'Live', '#EA580C'],
  ['Ffion', 'Ffion — Neural (Friendly)', 'English / Welsh', 'Welsh', 'Friendly, bilingual and conversational', 'Testing', '#0A0A0A'],
  ['Max', 'Max — Neural (Direct)', 'English (UK)', 'Neutral British', 'Direct and efficient for renewals', 'Paused', '#525252'],
];
export const agents: Agent[] = AGENT_RAW.map(([name, voice, language, accent, personality, status, color], i) => ({
  id: `ag-${pad(i + 1, 2)}`, name, initials: name.slice(0, 2).toUpperCase(), color, voice, language, accent, personality, status,
  version: (ri(0, 9), ri(0, 9), ri(0, 9), 'v3.2.0'),
  totalCalls: 0, avgDuration: 0, qualificationRate: 0, sentimentScore: 0, escalationRate: 0,
  instructions: `You are ${name}, a Vodafone UK sales assistant calling existing customers who are eligible for new offers. Always identify yourself as an AI assistant calling on behalf of Vodafone at the start of the call and state that the call is recorded for quality and training. Confirm you are speaking to the account holder before discussing account details. Only quote approved prices and terms from the product knowledge base. If the customer asks to stop, opt out or speak to a person, comply immediately. Never pressure the customer; aim to understand needs, recommend the best-fit plan and book a follow-up with a human specialist when the customer is interested.`,
  greeting: `Hi, is that {first_name}? This is ${name}, an AI assistant calling on behalf of Vodafone. This call is recorded for quality and training. Have you got two minutes to hear about an offer you're eligible for?`,
  speakingRate: +(0.9 + rand() * 0.2).toFixed(2), temperature: +(0.3 + rand() * 0.3).toFixed(2),
  updatedAt: iso(daysAgo(ri(1, 25))),
  versions: [
    { version: 'v3.2.0', at: iso(daysAgo(3)), author: 'Sarah Mitchell', note: 'Updated Winter Switch pricing and objection responses', status: 'Published' },
    { version: 'v3.1.4', at: iso(daysAgo(19)), author: 'James Okonkwo', note: 'Improved callback scheduling flow', status: 'Archived' },
    { version: 'v3.1.0', at: iso(daysAgo(44)), author: 'Sarah Mitchell', note: 'Added business qualification criteria', status: 'Archived' },
    { version: 'v3.3.0-draft', at: iso(daysAgo(0, 9)), author: 'Owen Price', note: 'Draft: shorter introduction, new opt-out phrasing', status: 'Draft' },
  ],
  objections: [
    { trigger: 'Too expensive', response: 'Acknowledge, compare with current monthly spend, mention Together Discount if eligible, and offer the lower-tier plan.' },
    { trigger: 'Happy with current plan', response: 'Respect the choice, highlight one relevant benefit (e.g. 5G or EU roaming) and offer to email details instead.' },
    { trigger: 'Locked into contract', response: 'Check renewal date, explain early-upgrade eligibility only if it is in the approved rules, otherwise schedule a callback at renewal.' },
    { trigger: 'Not a good time', response: 'Apologise, offer a callback at a time that suits, and confirm the time back to the customer.' },
    { trigger: 'Is this a scam?', response: 'Reassure, never ask for passwords or payment details, and invite the customer to call the number on their bill.' },
  ],
  escalation: [
    { rule: 'Customer asks to speak to a person', enabled: true },
    { rule: 'Customer mentions a complaint or vulnerability', enabled: true },
    { rule: 'Qualification score ≥ 80 and customer agrees to proceed', enabled: true },
    { rule: 'Two consecutive unanswered product questions', enabled: true },
    { rule: 'Negative sentiment sustained for 30+ seconds', enabled: false },
  ],
}));
const AGENT_W: [string, number][] = [['ag-01', 30], ['ag-02', 26], ['ag-03', 20], ['ag-04', 18], ['ag-05', 3], ['ag-06', 3]];

// ---------- campaigns ----------
const CAMP_RAW: [string, string, string | null, string, Campaign['status'], number, number, string][] = [
  ['Unlimited Max Renewal Q4', 'p-unl-max', 'o-2', 'ag-01', 'Active', 84, 50, 'Consumer · in renewal window'],
  ['Winter Fibre Switch', 'p-fibre-500', 'o-1', 'ag-02', 'Active', 52, 40, 'Consumer · Full Fibre available'],
  ['SIM Only Value Push', 'p-sim-100', null, 'ag-03', 'Active', 76, 30, 'Consumer · out of contract'],
  ['SME Business Unlimited', 'p-biz-unl', 'o-3', 'ag-04', 'Active', 38, 80, 'SME · 2–20 employees'],
  ['Business Fibre Upgrade', 'p-biz-fibre', null, 'ag-04', 'Paused', 70, 25, 'Business · copper broadband'],
  ['Flagship Upgrade Autumn', 'p-dev-upg', 'o-5', 'ag-06', 'Completed', 88, -2, 'Consumer · 18+ months tenure'],
  ['Gigabit Fibre Early Access', 'p-fibre-900', null, 'ag-02', 'Scheduled', -6, 60, 'Consumer · high-usage households'],
  ['Unlimited Lite Retention', 'p-unl-lite', 'o-2', 'ag-03', 'Draft', -14, 45, 'Consumer · churn risk'],
];
export const campaigns: Campaign[] = CAMP_RAW.map(([name, productId, offerId, agentId, status, startAgo, endAhead, segment], i) => ({
  id: `CMP-${pad(1040 + i * 7, 4)}`, name, productId, offerId, agentId, status,
  startDate: iso(daysAgo(startAgo)), endDate: iso(daysAhead(endAhead)),
  totalLeads: 0, attempted: 0, connected: 0, warm: 0, qualified: 0, minutes: 0,
  costPerMinute: productId.startsWith('p-biz') ? 0.145 : 0.118,
  segment,
  schedule: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', ...(i % 3 === 0 ? ['Sat'] : [])], start: '09:30', end: i % 2 ? '19:30' : '18:00', timezone: 'Europe/London' },
  retry: { maxAttempts: i % 2 ? 3 : 4, intervalHours: i % 2 ? 24 : 48 },
  concurrency: [12, 8, 10, 6, 4, 8, 6, 4][i], dailyCap: [800, 500, 600, 300, 250, 400, 300, 200][i],
  qualification: { minScore: [70, 65, 60, 75, 75, 70, 70, 65][i], requireBudget: i % 2 === 1, requireDecisionMaker: productId.startsWith('p-biz'), requireTimeline: true },
  createdBy: pick(['Rachel Adeyemi', 'Tom Hargreaves', 'Sarah Mitchell']),
  description: `Outbound AI campaign targeting ${segment.toLowerCase()} customers with ${products.find((p) => p.id === productId)!.name}.`,
}));
const CALLABLE_CAMPS = campaigns.filter((c) => ['Active', 'Paused', 'Completed'].includes(c.status));

// ---------- leads ----------
const LEAD_COUNT = 1240;
const TAGS = ['High value', 'Renewal due', 'Family plan', 'Multi-line', 'Price sensitive', 'Early adopter', 'Loyal 5y+', 'Retention risk', 'Bundle eligible'];
export const leads: Lead[] = [];
for (let i = 0; i < LEAD_COUNT; i++) {
  const first = pick(FIRST); const last = pick(LAST);
  const type = weighted<Lead['customerType']>([['Consumer', 72], ['SME', 16], ['Business', 9], ['Enterprise', 3]]);
  const camp = rand() < 0.88 ? pick(CALLABLE_CAMPS.concat(campaigns.filter((c) => c.status !== 'Draft'))) : null;
  const productInterest = camp ? camp.productId : weighted(PRODUCT_W);
  const name = type === 'Consumer' ? `${first} ${last}` : `${first} ${last}`;
  leads.push({
    id: `LD-${pad(48210 + i, 5)}`,
    name,
    phone: `+44 7${ri(100, 999)} ${ri(100, 999)} ${ri(100, 999)}`,
    email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}${ri(1, 99)}@${type === 'Consumer' ? pick(['gmail.com', 'outlook.com', 'yahoo.co.uk', 'icloud.com', 'btinternet.com']) : pick(COMPANIES).toLowerCase().replace(/[^a-z]/g, '') + '.co.uk'}`,
    city: pick(CITIES),
    customerType: type,
    currentPlan: pick(['Red Entertainment 20GB', 'Unlimited Lite', 'SIM Only 12GB', 'Pay as you go', 'Superfast 2 Broadband', 'Business 10GB', 'Red Extra 50GB', 'Legacy Basics']),
    tenureMonths: ri(3, 140),
    productInterest,
    source: weighted<Lead['source']>([['CRM export', 46], ['Contract renewal', 24], ['Web form', 12], ['Retail store', 8], ['Partner referral', 4], ['CSV import', 6]]),
    campaignId: camp ? camp.id : null,
    status: 'New', score: 0, sentiment: 'Neutral', lastCallAt: null, attempts: 0,
    assignedRepId: null, nextFollowUp: null,
    tags: Array.from(new Set([pick(TAGS), ...(rand() < 0.4 ? [pick(TAGS)] : [])])),
    consent: rand() > 0.03, dnc: false,
    createdAt: iso(daysAgo(ri(5, 140))),
    notes: [], aiSummary: '',
  });
}

// ---------- calls (detailed log: last 90 days) ----------
const OBJECTIONS = ['Price too high', 'Happy with current provider', 'Still in contract', 'Needs to discuss with partner', 'Concerned about installation', 'Coverage concerns at home', 'Wants to compare online', 'Not a good time'];
const QUESTIONS = ['Is EU roaming included?', 'Will my price go up each year?', 'Can I keep my number?', 'How long does installation take?', 'Is there an early termination fee?', 'Does it include 5G?', 'Can I add a family member?', 'Is there a static IP option?', 'What hub do I get?', 'Can I pay annually?'];
const UNANSWERED = ['Exact installation date at my address', 'Whether my building has fibre to the flat', 'Trade-in value for a cracked screen', 'VAT treatment for sole traders', 'Compatibility with a dual-SIM work phone'];

export const calls: Call[] = [];
let callSeq = 731000;
const leadById = new Map(leads.map((l) => [l.id, l]));
const campById = new Map(campaigns.map((c) => [c.id, c]));

function outcomeFor(): CallOutcome {
  return weighted<CallOutcome>([
    ['No answer', 26], ['Voicemail', 11], ['Busy', 5], ['Failed', 4],
    ['Not interested', 20], ['Callback requested', 9], ['Interested', 11], ['Qualified', 9],
    ['Transferred to human', 3], ['Opted out', 2],
  ]);
}

// Hour profile for realistic "calls by hour" heatmap
const HOUR_W: [number, number][] = [[9, 4], [10, 9], [11, 10], [12, 7], [13, 6], [14, 9], [15, 10], [16, 9], [17, 8], [18, 6], [19, 3]];
const leadPool = leads.filter((l) => l.campaignId && campById.get(l.campaignId)!.status !== 'Scheduled');
for (const lead of leadPool) {
  const camp = campById.get(lead.campaignId!)!;
  const campStartAgo = Math.min(89, Math.max(0, Math.round((TODAY.getTime() - new Date(camp.startDate).getTime()) / DAY)));
  const campEndAgo = Math.max(0, Math.round((TODAY.getTime() - new Date(camp.endDate).getTime()) / DAY));
  if (rand() < 0.16) continue; // not yet attempted
  let attemptDayAgo = ri(Math.max(campEndAgo, 0), campStartAgo);
  const maxAttempts = camp.retry.maxAttempts;
  for (let a = 0; a < maxAttempts; a++) {
    if (attemptDayAgo < 0) break;
    let d = daysAgo(attemptDayAgo, weighted(HOUR_W), ri(0, 59));
    if (d.getDay() === 0) d = new Date(d.getTime() + DAY); // never Sunday
    if (d > NOW) d = new Date(NOW.getTime() - ri(5, 240) * 60000);
    const outcome = outcomeFor();
    const connected = !['No answer', 'Voicemail', 'Busy', 'Failed'].includes(outcome);
    const duration = connected
      ? outcome === 'Qualified' || outcome === 'Transferred to human' ? ri(240, 560)
        : outcome === 'Interested' ? ri(180, 420) : outcome === 'Callback requested' ? ri(50, 140) : ri(40, 210)
      : outcome === 'Voicemail' ? ri(18, 35) : ri(0, 28);
    const sentiment: Sentiment = ['Qualified', 'Interested', 'Transferred to human'].includes(outcome) ? weighted([['Positive', 8], ['Neutral', 2]])
      : outcome === 'Not interested' || outcome === 'Opted out' ? weighted([['Negative', 5], ['Neutral', 5]]) : 'Neutral';
    const score = outcome === 'Qualified' || outcome === 'Transferred to human' ? ri(76, 98) : outcome === 'Interested' ? ri(55, 79) : outcome === 'Callback requested' ? ri(40, 65) : connected ? ri(5, 35) : 0;
    const agentId = rand() < 0.85 ? camp.agentId : weighted(AGENT_W);
    const product = products.find((p) => p.id === camp.productId)!;
    calls.push({
      id: `CL-${callSeq++}`,
      leadId: lead.id, campaignId: camp.id, agentId, startedAt: iso(d), duration, outcome, connected, sentiment,
      intent: connected ? Math.min(100, score + ri(-8, 8)) : 0, score,
      productId: camp.productId,
      cost: +((Math.max(duration, 6) / 60) * camp.costPerMinute + 0.004).toFixed(3),
      recording: connected ? (rand() < 0.03 ? 'Processing' : attemptDayAgo > 80 ? 'Expired' : 'Available') : 'Not recorded',
      summary: '',
      objections: connected && outcome !== 'Qualified' ? [pick(OBJECTIONS)] : connected && rand() < 0.5 ? [pick(OBJECTIONS)] : [],
      questions: connected ? Array.from(new Set([pick(QUESTIONS), ...(rand() < 0.5 ? [pick(QUESTIONS)] : [])])) : [],
      unanswered: connected && rand() < 0.14 ? [pick(UNANSWERED)] : [],
      failureReason: outcome === 'Failed' ? pick(['Carrier rejected (SIP 503)', 'Invalid number format', 'Network timeout', 'Media stream dropped']) : undefined,
      simulated: true,
    });
    calls[calls.length - 1].summary = summarise(calls[calls.length - 1], lead.name, product.name);
    if (connected && outcome !== 'Callback requested') break;
    attemptDayAgo -= Math.ceil(camp.retry.intervalHours / 24) + ri(0, 2);
  }
}
calls.sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));

function summarise(c: Call, name: string, product: string) {
  const first = name.split(' ')[0];
  switch (c.outcome) {
    case 'Qualified': return `${first} is keen on ${product} and confirmed budget and timeline. ${c.objections[0] ? `Initial concern (“${c.objections[0].toLowerCase()}”) was resolved.` : ''} Agreed to a follow-up with a specialist to complete the order.`;
    case 'Transferred to human': return `${first} asked detailed questions about ${product} and requested to speak with a person. Warm-transferred with full context.`;
    case 'Interested': return `${first} showed interest in ${product} but wants to ${c.objections[0] === 'Needs to discuss with partner' ? 'discuss with their partner first' : 'compare a few details'} before committing.`;
    case 'Callback requested': return `${first} was busy and asked for a callback. Preferred time captured.`;
    case 'Not interested': return `${first} declined the ${product} offer — ${c.objections[0]?.toLowerCase() ?? 'no specific reason given'}.`;
    case 'Opted out': return `${first} asked not to be contacted again. Number added to suppression list automatically.`;
    case 'Voicemail': return 'Reached voicemail. No message left per policy; retry scheduled.';
    case 'Busy': return 'Line busy. Retry scheduled within campaign rules.';
    case 'Failed': return `Call failed to connect: ${c.failureReason}.`;
    default: return 'No answer. Retry scheduled within campaign rules.';
  }
}

// ---------- derive lead state from calls ----------
const callsByLead = new Map<string, Call[]>();
for (const c of calls) { if (!callsByLead.has(c.leadId)) callsByLead.set(c.leadId, []); callsByLead.get(c.leadId)!.push(c); }
let rr = 0;
const repsForProduct = (pid: string) => { const m = reps.filter((r) => r.products.includes(pid)); return m.length ? m : reps; };
for (const l of leads) {
  const cs = callsByLead.get(l.id);
  if (!cs) {
    l.status = l.campaignId ? 'Queued' : 'New';
    continue;
  }
  const latest = cs[0];
  l.attempts = cs.length;
  l.lastCallAt = latest.startedAt;
  l.score = Math.max(...cs.map((c) => c.score));
  l.sentiment = latest.sentiment;
  const map: Record<CallOutcome, LeadStatus> = {
    Qualified: l.score >= 85 ? 'Hot' : 'Warm', 'Transferred to human': 'Hot', Interested: 'Warm', 'Callback requested': 'Callback requested',
    'Not interested': 'Not interested', 'Opted out': 'Do not call', 'No answer': 'Unreachable', Voicemail: 'Unreachable', Busy: 'Unreachable', Failed: 'Unreachable',
  };
  l.status = map[latest.outcome];
  if (l.status === 'Unreachable' && cs.length < (campById.get(l.campaignId!)?.retry.maxAttempts ?? 3)) l.status = 'Contacted';
  if (l.status === 'Not interested' && l.score > 20 && rand() < 0.3) l.status = 'Cold';
  if (latest.outcome === 'Opted out') { l.dnc = true; l.consent = false; }
  l.aiSummary = latest.summary;
  if (['Hot', 'Warm', 'Callback requested'].includes(l.status)) {
    const daysSince = (TODAY.getTime() - startOfDay(new Date(latest.startedAt)).getTime()) / DAY;
    if (daysSince > 2 || rand() < 0.6) {
      const pool = repsForProduct(l.productInterest);
      l.assignedRepId = pool[rr++ % pool.length].id;
    }
    l.nextFollowUp = iso(new Date(new Date(latest.startedAt).getTime() + ri(1, 5) * DAY));
    if (l.status !== 'Callback requested' && daysSince > 12 && rand() < 0.45) l.status = 'Converted';
  }
}
// a handful of fully-new leads awaiting first attempt
leads.forEach((l) => { if (l.status === 'Queued' && rand() < 0.2) l.status = 'New'; });

// notes
for (const l of leads.filter((x) => x.assignedRepId).slice(0, 220)) {
  const rep = team.find((t) => t.id === l.assignedRepId)!;
  l.notes.push({ id: `n-${l.id}`, author: rep.name, at: iso(new Date(new Date(l.lastCallAt!).getTime() + 5 * 3600000)), text: pick([
    'Reviewed AI handover. Customer prefers email confirmation before any order.',
    'Left a voicemail introducing myself. Will retry tomorrow morning.',
    'Spoke briefly — wants pricing for two additional lines.',
    'Confirmed Full Fibre availability at the address.',
    'Customer asked for a call after 6pm on weekdays.',
  ]) });
}

// ---------- campaign & agent aggregates ----------
export function recomputeAggregates(cmps: Campaign[], ags: Agent[], cls: Call[], lds: Lead[]) {
  for (const c of cmps) {
    const cc = cls.filter((x) => x.campaignId === c.id);
    const cl = lds.filter((x) => x.campaignId === c.id);
    c.totalLeads = cl.length;
    c.attempted = new Set(cc.map((x) => x.leadId)).size;
    c.connected = cc.filter((x) => x.connected).length;
    c.warm = cl.filter((x) => x.status === 'Warm').length;
    c.qualified = cl.filter((x) => ['Hot', 'Warm', 'Converted'].includes(x.status)).length;
    c.minutes = Math.round(cc.reduce((s, x) => s + x.duration, 0) / 60);
  }
  for (const a of ags) {
    const ac = cls.filter((x) => x.agentId === a.id);
    const conn = ac.filter((x) => x.connected);
    a.totalCalls = ac.length;
    a.avgDuration = conn.length ? Math.round(conn.reduce((s, x) => s + x.duration, 0) / conn.length) : 0;
    a.qualificationRate = conn.length ? +((conn.filter((x) => ['Qualified', 'Transferred to human'].includes(x.outcome)).length / conn.length) * 100).toFixed(1) : 0;
    a.sentimentScore = conn.length ? Math.round((conn.filter((x) => x.sentiment === 'Positive').length * 100 + conn.filter((x) => x.sentiment === 'Neutral').length * 55) / conn.length) : 0;
    a.escalationRate = conn.length ? +((conn.filter((x) => x.outcome === 'Transferred to human').length / conn.length) * 100).toFixed(1) : 0;
  }
}
recomputeAggregates(campaigns, agents, calls, leads);
for (const r of reps) {
  const mine = leads.filter((l) => l.assignedRepId === r.id);
  r.conversions = mine.filter((l) => l.status === 'Converted').length;
  r.revenue = mine.filter((l) => l.status === 'Converted').reduce((s, l) => s + (products.find((p) => p.id === l.productInterest)!.monthlyPrice * products.find((p) => p.id === l.productInterest)!.contractMonths), 0);
}

// ---------- historical daily series (12 months) ----------
// Detailed logs are retained for 90 days; older days are kept as daily aggregates.
export interface DayStat { date: string; calls: number; connected: number; qualified: number; minutes: number; cost: number; }
export const dailyHistory: DayStat[] = [];
for (let n = 364; n >= 90; n--) {
  const d = daysAgo(n, 12);
  const ramp = Math.min(1, 0.35 + (364 - n) / 400);
  const weekday = d.getDay();
  const base = weekday === 0 ? 0 : weekday === 6 ? 14 : 34;
  const callsN = Math.round(base * ramp * (0.85 + rand() * 0.3));
  const connected = Math.round(callsN * (0.5 + rand() * 0.08));
  const qualified = Math.round(connected * (0.18 + rand() * 0.05));
  const minutes = Math.round(connected * 3.1 + callsN * 0.2);
  dailyHistory.push({ date: iso(d), calls: callsN, connected, qualified, minutes, cost: +(minutes * 0.124).toFixed(2) });
}

// ---------- transcripts (generated on demand, deterministic per call) ----------
const transcriptCache = new Map<string, TranscriptLine[]>();
export function getTranscript(call: Call, lead: Lead, agentName: string): TranscriptLine[] {
  if (transcriptCache.has(call.id)) return transcriptCache.get(call.id)!;
  const p = products.find((x) => x.id === call.productId)!;
  const first = lead.name.split(' ')[0];
  const lines: TranscriptLine[] = [];
  let t = 0;
  const say = (speaker: TranscriptLine['speaker'], text: string, extra: Partial<TranscriptLine> = {}) => { lines.push({ t, speaker, text, ...extra }); t += Math.max(3, Math.round(text.length / 14)); };
  if (!call.connected) {
    say('System', call.outcome === 'Voicemail' ? 'Voicemail greeting detected. Policy: no message left.' : call.outcome === 'Failed' ? `Call failed: ${call.failureReason}.` : call.outcome === 'Busy' ? 'Busy tone detected.' : 'No answer after 28 seconds.');
    transcriptCache.set(call.id, lines); return lines;
  }
  say('System', 'Compliance check passed: consent on file, not on suppression list, within permitted calling hours.');
  say('AI', `Hi, is that ${first}? This is ${agentName}, an AI assistant calling on behalf of Vodafone. Just so you know, this call is recorded for quality and training.`);
  say('Customer', 'Yes, speaking. What’s this about?', { sentiment: 'Neutral' });
  say('AI', `Thanks ${first}. Before I go on, could you confirm the first line of your billing address so I know I’m speaking with the account holder?`);
  say('Customer', 'Sure, it’s the one on Station Road.', { sentiment: 'Neutral' });
  say('AI', `Perfect, thank you. I can see you’ve been with us for ${Math.floor(lead.tenureMonths / 12) || 'less than a'} year${lead.tenureMonths >= 24 ? 's' : ''} on ${lead.currentPlan}. You’re now eligible for ${p.name}${p.category.includes('Business') ? ' at £' + p.monthlyPrice + ' per user per month, excluding VAT' : ' at £' + p.monthlyPrice + ' a month'}. Can I ask how you mostly use your ${p.category.includes('ibre') || p.category.includes('roadband') ? 'broadband at home' : 'phone'}?`, { flag: 'pricing' });
  if (call.outcome === 'Callback requested') {
    say('Customer', 'Honestly, now’s not great — I’m about to go into a meeting. Can you call me back?', { sentiment: 'Neutral', flag: 'objection' });
    say('AI', 'Of course. Would tomorrow between 5 and 7pm work for you?');
    say('Customer', 'Yes, after 5:30 is best.', { sentiment: 'Positive' });
    say('AI', 'Great — I’ve booked a callback for tomorrow after 5:30pm. Thanks for your time, speak soon.');
    say('System', 'Callback scheduled. Lead status set to “Callback requested”.');
    transcriptCache.set(call.id, lines); return lines;
  }
  say('Customer', pick(['Mostly streaming and video calls, and the kids are always gaming.', 'I travel a fair bit for work, so roaming matters.', 'Just the usual — social media, maps, a bit of Netflix.', 'We’ve got about six people on the team using it all day.']), { sentiment: 'Neutral' });
  say('AI', `That’s helpful. Based on that, ${p.name} would suit you well — ${p.benefits.slice(0, 2).join(' and ').toLowerCase()}.`);
  for (const q of call.questions) {
    say('Customer', q, { flag: 'question', sentiment: 'Neutral' });
    say('AI', q.includes('price go up') ? 'Your price will rise each April by a fixed amount set out in your contract — I can send you the exact figure by email.' : q.includes('number') ? 'Yes, you keep your existing number.' : q.includes('termination') ? 'If you leave early there would be an early termination charge — I’ll include the details in the summary email.' : 'Yes, that’s included in the plan.');
  }
  for (const o of call.objections) {
    say('Customer', o === 'Price too high' ? 'It sounds a bit pricier than what I pay now.' : o === 'Still in contract' ? 'Aren’t I still in contract for a few months?' : o === 'Needs to discuss with partner' ? 'I’d need to run it past my partner first.' : `${o}, to be honest.`, { flag: 'objection', sentiment: call.outcome === 'Not interested' ? 'Negative' : 'Neutral' });
    say('AI', o === 'Price too high' ? `Totally understand. With the Together Discount you could save £5 a month, and you’d be getting ${p.data.toLowerCase()} data. Would that make a difference?` : o === 'Still in contract' ? 'You’re within your upgrade window, so there’s no early-exit charge if you move to this plan now.' : 'That makes sense — I can send everything by email so you have it to hand.');
  }
  for (const u of call.unanswered) {
    say('Customer', `Can you tell me the ${u.toLowerCase()}?`, { flag: 'question' });
    say('AI', 'That’s a great question and I don’t want to give you the wrong answer. I’ll make sure a specialist confirms that for you.', { flag: 'unanswered' });
  }
  if (call.outcome === 'Not interested' || call.outcome === 'Opted out') {
    say('Customer', call.outcome === 'Opted out' ? 'Please don’t call me again about offers.' : 'I think I’ll stay as I am for now, thanks.', { sentiment: 'Negative', flag: call.outcome === 'Opted out' ? 'intent' : undefined });
    say('AI', call.outcome === 'Opted out' ? 'Understood — I’ve removed you from sales calls. Sorry to have bothered you, and have a good day.' : 'No problem at all, thanks for your time. If anything changes, you can find all our plans in the My Vodafone app.');
    say('System', call.outcome === 'Opted out' ? 'Opt-out recorded. Number added to do-not-call suppression list.' : 'Call ended. Outcome: not interested.');
  } else {
    say('Customer', call.outcome === 'Interested' ? 'It does sound good. Can you send me the details? I’ll have a think.' : 'Okay, that sounds good actually. What would the next step be?', { sentiment: 'Positive', flag: 'intent' });
    if (call.outcome === 'Transferred to human') {
      say('Customer', 'Could I speak to someone to go through the order?', { flag: 'intent' });
      say('AI', 'Absolutely — I’ll connect you with one of our specialists now and pass on everything we’ve discussed.');
      say('System', 'Warm transfer initiated to Consumer Sales queue. AI handover summary attached.');
    } else {
      say('AI', call.outcome === 'Interested' ? 'Of course. I’ll email you a summary now, and a specialist will follow up in a couple of days — is that okay?' : 'A specialist will call you to confirm everything and complete the order. Would Thursday at 11am work?');
      say('Customer', call.outcome === 'Interested' ? 'Yes, that’s fine.' : 'Thursday at 11 is perfect.', { sentiment: 'Positive' });
      say('AI', `Lovely. Thanks ${first}, have a great day.`);
      say('System', `Qualification score ${call.score}/100. ${call.outcome === 'Qualified' ? 'Lead qualified and queued for human handover.' : 'Lead marked warm; follow-up scheduled.'}`);
    }
  }
  // scale timestamps to actual call duration
  const last = lines[lines.length - 1].t || 1;
  const k = call.duration / (last + 6);
  lines.forEach((l) => { l.t = Math.round(l.t * k); });
  transcriptCache.set(call.id, lines);
  return lines;
}

// ---------- appointments & tasks ----------
export const appointments: Appointment[] = [];
export const tasks: Task[] = [];
let apSeq = 5100;
for (const l of leads.filter((x) => x.assignedRepId && ['Hot', 'Warm', 'Callback requested', 'Converted'].includes(x.status))) {
  const offset = ri(-12, 16);
  const start = daysAhead(offset, ri(9, 17), pick([0, 15, 30, 45]));
  if (start.getDay() === 0) start.setDate(start.getDate() + 1);
  const past = start < NOW;
  appointments.push({
    id: `AP-${apSeq++}`, leadId: l.id, repId: l.assignedRepId!,
    type: l.status === 'Callback requested' ? 'Callback' : weighted([['Sales call', 6], ['Video consultation', 2], ['Store visit', 1], ['Follow-up task', 1]]),
    start: iso(start), durationMin: pick([15, 30, 30, 45]),
    status: past ? weighted([['Completed', 7], ['No-show', 1], ['Cancelled', 1], ['Rescheduled', 1]]) : weighted([['Scheduled', 5], ['Confirmed', 4], ['Rescheduled', 1]]),
    notes: l.aiSummary, source: rand() < 0.7 ? 'AI agent' : 'Sales rep', reminder: true,
  });
  if (l.status !== 'Converted' && rand() < 0.6) {
    tasks.push({
      id: `TK-${apSeq}`, leadId: l.id, repId: l.assignedRepId!,
      title: pick(['Send tailored quote', 'Confirm address eligibility', 'Call back to close', 'Email contract summary', 'Check device stock', 'Review AI handover']),
      due: iso(daysAhead(ri(-4, 6), ri(9, 17))), priority: l.status === 'Hot' ? 'High' : weighted([['Medium', 3], ['Low', 1]]), done: rand() < 0.25,
    });
  }
}

// ---------- compliance ----------
export const consents: ConsentRecord[] = leads.slice(0, 400).map((l, i) => ({
  id: `CN-${pad(9000 + i, 5)}`, leadId: l.id, channel: weighted([['Voice', 6], ['SMS', 2], ['Email', 2]]),
  status: l.dnc ? 'Withdrawn' : l.consent ? (rand() < 0.04 ? 'Expired' : 'Granted') : 'Withdrawn',
  capturedAt: iso(daysAgo(ri(30, 700))), source: pick(['My Vodafone app', 'Retail point of sale', 'Contract signup', 'Web preference centre', 'Customer services']),
}));
export const suppressions: Suppression[] = [
  ...leads.filter((l) => l.dnc).map((l, i) => ({ id: `SP-${pad(300 + i, 4)}`, phone: l.phone, name: l.name, reason: 'Customer opt-out' as const, addedAt: l.lastCallAt ?? iso(daysAgo(3)), addedBy: 'AI agent (automatic)' })),
  ...Array.from({ length: 24 }, (_, i) => ({ id: `SP-${pad(900 + i, 4)}`, phone: `+44 7${ri(100, 999)} ${ri(100, 999)} ${ri(100, 999)}`, name: `${pick(FIRST)} ${pick(LAST)}`, reason: pick(['TPS registered', 'Complaint', 'Vulnerable customer', 'Legal hold', 'Deceased'] as const), addedAt: iso(daysAgo(ri(1, 200))), addedBy: pick(['Owen Price', 'James Okonkwo', 'TPS sync']) })),
];
export const deletionRequests: DeletionRequest[] = Array.from({ length: 9 }, (_, i) => {
  const l = leads[1000 + i * 7];
  const at = daysAgo(ri(0, 26));
  return { id: `DSR-${pad(210 + i, 4)}`, leadId: l.id, name: l.name, requestedAt: iso(at), status: pick(['Received', 'In review', 'Approved', 'Completed', 'Completed'] as const), type: pick(['Erasure', 'Erasure', 'Access', 'Rectification'] as const), dueBy: iso(new Date(at.getTime() + 30 * DAY)) };
});
const ACTIONS: [AuditEntry['category'], string, string][] = [
  ['Auth', 'Signed in', 'Web console (SSO)'], ['Campaign', 'Paused campaign', 'Business Fibre Upgrade'], ['Agent', 'Published agent version', 'Ava v3.2.0'],
  ['Data', 'Imported leads', 'renewals_nov.csv (412 rows)'], ['Export', 'Exported report', 'Weekly performance (PDF)'], ['Compliance', 'Added suppression', '+44 7*** *** 214'],
  ['Settings', 'Updated calling hours', 'Mon–Fri 09:30–19:30'], ['Data', 'Viewed recording', 'CL-731402'], ['Auth', 'Failed sign-in attempt', 'unknown device'],
  ['Compliance', 'Approved erasure request', 'DSR-0213'], ['Campaign', 'Launched campaign', 'SME Business Unlimited'], ['Agent', 'Edited objection handling', 'Leo'],
];
export const auditLog: AuditEntry[] = Array.from({ length: 160 }, (_, i) => {
  const [category, action, target] = pick(ACTIONS);
  return { id: `AU-${pad(88000 - i, 5)}`, at: iso(new Date(NOW.getTime() - i * ri(15, 90) * 60000)), actor: action === 'Failed sign-in attempt' ? 'unknown' : pick(team).name, action, target, ip: `10.${ri(10, 40)}.${ri(0, 255)}.${ri(1, 254)}`, category };
});

// ---------- notifications ----------
const hot = leads.filter((l) => l.status === 'Hot').slice(0, 4);
export const notifications: Notification[] = [
  ...hot.map((l, i) => ({ id: `NT-${i + 1}`, category: 'Leads' as const, priority: 'High' as const, title: 'New hot lead ready for handover', body: `${l.name} scored ${l.score}/100 for ${products.find((p) => p.id === l.productInterest)!.name}.`, at: iso(new Date(NOW.getTime() - (i * 37 + 6) * 60000)), read: i > 1, link: `/qualified?lead=${l.id}` })),
  { id: 'NT-10', category: 'Capacity', priority: 'High', title: 'Daily calling capacity at 86%', body: 'Unlimited Max Renewal Q4 will reach its daily cap of 800 calls in ~1h at the current rate.', at: iso(new Date(NOW.getTime() - 22 * 60000)), read: false, link: '/calling' },
  { id: 'NT-11', category: 'Agents', priority: 'High', title: 'Agent error rate elevated', body: 'Max returned 4 media-stream errors in the last hour. Agent paused automatically.', at: iso(new Date(NOW.getTime() - 95 * 60000)), read: false, link: '/agents/ag-06' },
  { id: 'NT-12', category: 'Campaigns', priority: 'Medium', title: 'Campaign completed', body: 'Flagship Upgrade Autumn finished with 100% of eligible leads attempted.', at: iso(daysAgo(1, 18)), read: true, link: `/campaigns/${campaigns[5].id}` },
  { id: 'NT-13', category: 'Follow-ups', priority: 'Medium', title: '7 follow-ups overdue', body: 'Several warm leads have passed their follow-up deadline without contact.', at: iso(new Date(NOW.getTime() - 3 * 3600000)), read: false, link: '/workspace' },
  { id: 'NT-14', category: 'Appointments', priority: 'Low', title: 'Appointment confirmed', body: 'Customer confirmed a video consultation for tomorrow at 11:00.', at: iso(new Date(NOW.getTime() - 5 * 3600000)), read: true, link: '/appointments' },
  { id: 'NT-15', category: 'Offers', priority: 'Medium', title: 'Promotion expired', body: 'Autumn Upgrade Credit expired. 1 campaign references it — pitches were updated automatically.', at: iso(daysAgo(2, 0, 5)), read: false, link: '/products' },
  { id: 'NT-16', category: 'Security', priority: 'High', title: 'Unusual calling activity detected', body: '38 calls to the same number range in 10 minutes on Winter Fibre Switch. Review recommended.', at: iso(new Date(NOW.getTime() - 50 * 60000)), read: false, link: '/compliance' },
  { id: 'NT-17', category: 'Offers', priority: 'Low', title: 'Product pending approval', body: 'Device Upgrade — Flagship has not been reviewed in 41 days. AI pitching is blocked until approved.', at: iso(daysAgo(1, 9)), read: true, link: '/products' },
  { id: 'NT-18', category: 'Security', priority: 'Medium', title: 'Failed sign-in attempts', body: '3 failed sign-in attempts from an unrecognised device.', at: iso(daysAgo(1, 7, 40)), read: true, link: '/compliance?tab=audit' },
];
