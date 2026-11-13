import type { Classification } from '../lib/scoring';

// Shared domain model. Shapes mirror what a future backend (CRM / telephony / voice AI) would return.

export type LeadStatus =
  | 'New' | 'Queued' | 'Contacted' | 'Hot' | 'Warm' | 'Cold'
  | 'Not interested' | 'Unreachable' | 'Callback requested' | 'Converted' | 'Do not call';

export type CustomerType = 'Consumer' | 'Business' | 'SME' | 'Enterprise';
export type Sentiment = 'Positive' | 'Neutral' | 'Negative';
export type CallOutcome =
  | 'Qualified' | 'Interested' | 'Callback requested' | 'Not interested' | 'No answer'
  | 'Voicemail' | 'Busy' | 'Failed' | 'Opted out' | 'Transferred to human';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  customerType: CustomerType;
  currentPlan: string;
  tenureMonths: number;
  productInterest: string; // product id
  source: 'CRM export' | 'Web form' | 'Retail store' | 'Contract renewal' | 'Partner referral' | 'CSV import';
  campaignId: string | null;
  status: LeadStatus;
  score: number; // 0-100
  sentiment: Sentiment;
  lastCallAt: string | null;
  attempts: number;
  assignedRepId: string | null;
  nextFollowUp: string | null;
  tags: string[];
  consent: boolean;
  dnc: boolean;
  createdAt: string;
  archived?: boolean;
  notes: { id: string; author: string; at: string; text: string }[];
  aiSummary: string;
  callable?: boolean; // Live only: the dialler would actually ring this lead
}

export interface Campaign {
  id: string;
  name: string;
  productId: string;
  offerId: string | null;
  agentId: string;
  status: 'Active' | 'Paused' | 'Scheduled' | 'Completed' | 'Draft' | 'Stopped';
  startDate: string;
  endDate: string;
  totalLeads: number;
  attempted: number;
  connected: number;
  warm: number;
  qualified: number;
  minutes: number;
  costPerMinute: number;
  segment: string;
  schedule: { days: string[]; start: string; end: string; timezone: string };
  retry: { maxAttempts: number; intervalHours: number };
  concurrency: number;
  dailyCap: number;
  qualification: { minScore: number; requireBudget: boolean; requireDecisionMaker: boolean; requireTimeline: boolean };
  createdBy: string;
  description: string;
}

export interface Agent {
  id: string;
  name: string;
  initials: string;
  color: string;
  voice: string;
  language: string;
  accent: string;
  personality: string;
  status: 'Live' | 'Draft' | 'Paused' | 'Testing';
  version: string;
  totalCalls: number;
  avgDuration: number; // seconds
  qualificationRate: number; // %
  sentimentScore: number; // 0-100
  escalationRate: number; // %
  instructions: string;
  greeting: string;
  speakingRate: number;
  temperature: number;
  updatedAt: string;
  versions: { version: string; at: string; author: string; note: string; status: 'Published' | 'Archived' | 'Draft' }[];
  objections: { trigger: string; response: string }[];
  escalation: { rule: string; enabled: boolean }[];
}

export interface TranscriptLine {
  t: number; // seconds offset
  speaker: 'AI' | 'Customer' | 'System';
  text: string;
  segmentId?: string; // Live calls: the LiveKit segment this line shows
  sentiment?: Sentiment;
  flag?: 'objection' | 'question' | 'intent' | 'pricing' | 'unanswered';
}

export interface Call {
  id: string;
  leadId: string;
  campaignId: string;
  agentId: string;
  startedAt: string;
  duration: number; // seconds
  outcome: CallOutcome;
  connected: boolean;
  sentiment: Sentiment;
  intent: number; // 0-100 buying intent
  score: number;
  productId: string;
  cost: number;
  recording: 'Available' | 'Processing' | 'Not recorded' | 'Expired';
  summary: string;
  objections: string[];
  questions: string[];
  unanswered: string[];
  failureReason?: string;
  // Live only: the 11 matrix criteria in points, or on older calls need/budget/timeline/authority out of 25
  qualification?: Record<string, number>;
  simulated: boolean;
  // Live only, from the call and its analysis
  reason?: string; nextStep?: string; interestedServices?: string; callbackTime?: string;
  discovery?: Record<string, Fact>; classification?: Classification; followUp?: FollowUp;
}

/** One discovery fact as the backend stores it; `value` is set only when known. */
export interface Fact { status: 'known' | 'unknown' | 'declined' | 'n/a'; value: unknown }
export interface FollowUp {
  reason?: 'callback' | 'renewal' | 'field_visit' | 'email'; contract_end?: string; visit_address?: string; contact_name?: string;
  attendees?: string; email?: string; products?: string; transfer?: 'done' | 'failed';
}

export interface Product {
  id: string;
  name: string;
  category: 'Mobile' | 'SIM Only' | 'Broadband' | 'Fibre' | 'Business Mobile' | 'Business Broadband' | 'Device';
  description: string;
  monthlyPrice: number;
  upfront: number;
  contractMonths: number;
  data: string;
  speed?: string;
  benefits: string[];
  eligibility: string;
  availability: 'Available' | 'Limited' | 'Retired';
  approved: boolean;
  lastReviewed: string;
}

export interface Offer {
  id: string;
  name: string;
  productIds: string[];
  discount: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Scheduled' | 'Expired' | 'Draft';
  code: string;
}

export type Role = 'Super Admin' | 'Administrator' | 'Sales Manager' | 'Sales Representative' | 'Supervisor' | 'Analyst';

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  team: 'Consumer Sales' | 'Business Sales' | 'Retention' | 'Operations' | 'Insights';
  products: string[];
  status: 'Available' | 'Busy' | 'Away' | 'Offline';
  capacity: number;
  conversions: number;
  revenue: number;
  responseHrs: number;
  joined: string;
  lastActive: string;
}

export interface Appointment {
  id: string;
  leadId: string;
  repId: string;
  type: 'Sales call' | 'Callback' | 'Store visit' | 'Video consultation' | 'Follow-up task';
  start: string;
  durationMin: number;
  status: 'Scheduled' | 'Confirmed' | 'Completed' | 'Rescheduled' | 'Cancelled' | 'No-show';
  notes: string;
  source: 'AI agent' | 'Sales rep' | 'Customer';
  reminder: boolean;
}

export interface Task {
  id: string;
  leadId: string;
  repId: string;
  title: string;
  due: string;
  priority: 'High' | 'Medium' | 'Low';
  done: boolean;
}

export interface Notification {
  id: string;
  category: 'Leads' | 'Campaigns' | 'Agents' | 'Capacity' | 'Follow-ups' | 'Appointments' | 'Offers' | 'Security';
  priority: 'High' | 'Medium' | 'Low';
  title: string;
  body: string;
  at: string;
  read: boolean;
  link: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  category: 'Auth' | 'Data' | 'Campaign' | 'Agent' | 'Compliance' | 'Settings' | 'Export';
}

export interface ConsentRecord {
  id: string;
  leadId: string;
  channel: 'Voice' | 'SMS' | 'Email';
  status: 'Granted' | 'Withdrawn' | 'Expired';
  capturedAt: string;
  source: string;
}

export interface Suppression {
  id: string;
  phone: string;
  name: string;
  reason: 'Customer opt-out' | 'National Directory Database' | 'Complaint' | 'Vulnerable customer' | 'Legal hold' | 'Deceased';
  addedAt: string;
  addedBy: string;
}

export interface DeletionRequest {
  id: string;
  leadId: string;
  name: string;
  requestedAt: string;
  status: 'Received' | 'In review' | 'Approved' | 'Completed' | 'Rejected';
  type: 'Erasure' | 'Access' | 'Rectification';
  dueBy: string;
}
