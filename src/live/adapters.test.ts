import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mock } = vi.hoisted(() => {
  const state = { role: null as string | null };
  const mock = {
    state,
    auth: {
      signInWithPassword: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: state.role }, error: null }) }) }) })),
  };
  return { mock };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mock }));

import {
  toRole, toLeadStatus, leadStatusPatch, toLead, leadInsertRow, toCampaign, campaignStatusToDb, toCall, toTranscript, toMember, stripTags,
} from './adapters';
import { signInLive, supabase } from './client';
import { products } from '../data/seed';

describe('toRole', () => {
  it.each([
    ['admin', 'Administrator'], ['sales_manager', 'Sales Manager'], ['salesperson', 'Sales Representative'], ['analyst', 'Analyst'],
  ])('%s -> %s', (db, v2) => expect(toRole(db)).toBe(v2));
});

describe('toLeadStatus', () => {
  it.each([
    ['new', 10, 'New'], ['dialling', 10, 'Contacted'], ['retry', 10, 'Contacted'], ['callback', 10, 'Callback requested'],
    ['interested', 85, 'Hot'], ['interested', 84, 'Warm'], ['closed', 10, 'Not interested'],
    ['exhausted', 10, 'Unreachable'], ['do_not_call', 10, 'Do not call'],
  ])('%s at score %i -> %s', (status, score, want) => expect(toLeadStatus({ status, sales_status: null, score })).toBe(want));
  it('a salesperson decision wins over dialler state', () =>
    expect(toLeadStatus({ status: 'retry', sales_status: 'Converted', score: 10 })).toBe('Converted'));
});

describe('leadStatusPatch', () => {
  it.each([['New', null], ['Converted', 'Converted'], ['Hot', 'Hot']] as const)('%s -> %s', (s, want) =>
    expect(leadStatusPatch(s)).toEqual({ sales_status: want }));
  it('a queue action never touches sales_status', () => expect(leadStatusPatch('Queued')).toEqual({}));
});

describe('callable', () => {
  const ready = { id: 1, status: 'new', sales_status: null, consent: true, archived: false, created_at: 'x' };
  it.each(['new', 'retry', 'callback'])('dialler status %s can ring', (status) => expect(toLead({ ...ready, status }, []).callable).toBe(true));
  it.each([
    [{ sales_status: 'Hot' }], [{ assigned_to: 'rep-1' }], [{ consent: false }], [{ archived: true }], [{ status: 'interested' }], [{ status: 'exhausted' }],
    [{ status: 'closed' }], [{ status: 'do_not_call' }], [{ status: 'dialling' }],
  ])('%j cannot ring', (o) => expect(toLead({ ...ready, ...o }, []).callable).toBe(false));
});

describe('campaign status', () => {
  it.each([
    ['draft', 'Draft'], ['approved', 'Scheduled'], ['running', 'Active'], ['paused', 'Paused'], ['done', 'Completed'],
  ])('db %s -> %s', (db, v2) => {
    const c = toCampaign({ id: 7, name: 'n', status: db, created_at: '2026-01-01T00:00:00Z' }, {});
    expect(c.status).toBe(v2);
    expect(c.costPerMinute).toBe(0.22);
  });
  it.each([['Draft', 'draft'], ['Scheduled', 'approved'], ['Active', 'running'], ['Paused', 'paused'], ['Completed', 'done'], ['Stopped', 'done']] as const)(
    'v2 %s -> %s', (v2, db) => expect(campaignStatusToDb(v2)).toBe(db));
});

describe('toCall', () => {
  const base = { id: 3, lead_id: 9, campaign_id: 4, created_at: '2026-01-02T10:00:00Z', duration_s: 120, notes: null, analyses: null };
  const camp = { product_ref: 'p-x', agent_ref: 'ag-9' };
  it.each([
    ['interested', 85, 'Qualified'], ['interested', 84, 'Interested'], ['callback', 0, 'Callback requested'],
    ['not_interested', 0, 'Not interested'], ['do_not_call', 0, 'Opted out'], ['no_answer', 0, 'No answer'],
    ['voicemail', 0, 'Voicemail'], ['no_response', 0, 'No answer'], ['unreachable', 0, 'Failed'], ['hung_up', 0, 'Not interested'],
  ])('%s at score %i -> %s', (outcome, score, want) =>
    expect(toCall({ ...base, outcome, analyses: { score } }, camp).outcome).toBe(want));
  it.each([['no_answer', false], ['voicemail', false], ['unreachable', false], ['no_response', false], ['interested', true], ['hung_up', true]])(
    '%s connected=%s', (outcome, want) => expect(toCall({ ...base, outcome }, camp).connected).toBe(want));
  it('derives fixed fields from the row and its campaign', () => {
    const c = toCall({ ...base, outcome: 'interested' }, camp);
    expect(c).toMatchObject({
      id: '3', leadId: '9', campaignId: '4', agentId: 'ag-9', productId: 'p-x', startedAt: base.created_at,
      duration: 120, recording: 'Not recorded', simulated: false,
    });
    expect(c.cost).toBeCloseTo(0.44);
  });
  it('duration defaults to 0', () => expect(toCall({ ...base, outcome: 'hung_up', duration_s: null }, camp).duration).toBe(0));
  it('uses real qualification scores when present', () => {
    const q = { need: 20, budget: 10, timeline: 5, authority: 15 };
    expect(toCall({ ...base, outcome: 'interested', analyses: { score: 50, qualification: q } }, camp).qualification).toEqual(q);
    expect(toCall({ ...base, outcome: 'interested' }, camp).qualification).toBeUndefined();
  });
});

describe('text helpers', () => {
  it('hides delivery tags', () => expect(stripTags('[warmly] Hi [curious] there?')).toBe('Hi there?'));
  it('turns seconds into transcript speakers', () =>
    expect(toTranscript([{ position: 0, role: 'agent', text: '[warmly] Hi', t_seconds: 3 }])).toEqual([{ t: 3, speaker: 'AI', text: 'Hi' }]));
  it('maps customers', () =>
    expect(toTranscript([{ position: 1, role: 'customer', text: 'Hello', t_seconds: null }])[0]).toMatchObject({ speaker: 'Customer', t: 0 }));
});

describe('toLead / toMember', () => {
  it('falls back to the first seed product when product_ref is null', () => {
    const l = toLead({ id: 1, name: 'A', phone: '1', status: 'new', created_at: '2026-01-01T00:00:00Z', product_ref: null, score: null }, [
      { id: 5, lead_id: 1, author: 'Sam', text: 'hi', created_at: '2026-01-02T00:00:00Z' },
    ]);
    expect(l.productInterest).toBe(products[0].id);
    expect(l.status).toBe('New');
    expect(l.notes).toEqual([{ id: '5', author: 'Sam', at: '2026-01-02T00:00:00Z', text: 'hi' }]);
  });
  it('maps a profile to a member', () =>
    expect(toMember({ id: 'u1', email: 'a@b.ie', full_name: 'Ann Byrne', role: 'analyst', created_at: '2026-01-01T00:00:00Z' }))
      .toMatchObject({ id: 'u1', name: 'Ann Byrne', initials: 'AB', role: 'Analyst' }));
});

describe('final review fixes', () => {
  it('a member has a nominal capacity, so Auto-assign can pick them', () => {
    expect(toMember({ id: 'u1', role: 'salesperson', created_at: 'x' }).capacity).toBe(25);
  });
  it('a lead reads its sentiment the way a call does', () => {
    expect(toLead({ id: 1, status: 'new', sentiment: 'positive' }, []).sentiment).toBe('Positive');
    expect(toLead({ id: 1, status: 'new', sentiment: null }, []).sentiment).toBe('Neutral');
  });
  it('the analysis and the agreed words reach the call, and stay absent when empty', () => {
    const call = toCall({
      id: 1, lead_id: 2, campaign_id: 3, outcome: 'callback', created_at: 'x', interested_services: 'Broadband, Mobile', callback_time: 'Tuesday after 3',
      analyses: { reason: 'Contract ends in May', next_step: 'Ring on Tuesday' },
    });
    expect(call).toMatchObject({ reason: 'Contract ends in May', nextStep: 'Ring on Tuesday', interestedServices: 'Broadband, Mobile', callbackTime: 'Tuesday after 3' });
    const bare = toCall({ id: 1, lead_id: 2, campaign_id: 3, outcome: 'hung_up', created_at: 'x', interested_services: '', analyses: null });
    expect([bare.reason, bare.nextStep, bare.interestedServices, bare.callbackTime]).toEqual([undefined, undefined, undefined, undefined]);
  });
  it('the Unknown placeholder never becomes a stored plan', () => {
    const l = { phone: '+353871234567', source: 'CSV import', name: 'A' } as Parameters<typeof leadInsertRow>[0];
    expect(leadInsertRow({ ...l, currentPlan: 'Unknown' })).not.toHaveProperty('current_plan');
    expect(leadInsertRow({ ...l, currentPlan: '' })).not.toHaveProperty('current_plan');
    expect(leadInsertRow({ ...l, currentPlan: 'Red' })).toMatchObject({ current_plan: 'Red' });
  });
});

describe('signInLive', () => {
  beforeEach(() => { mock.auth.signOut.mockClear(); });
  it('a user with no role is signed out with a clear message', async () => {
    mock.state.role = null;
    expect(await signInLive('a@b.ie', 'password1')).toEqual({ error: 'Your account has no role yet. Ask an administrator to assign one.' });
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
  it('returns the v2 role', async () => {
    mock.state.role = 'sales_manager';
    expect(await signInLive('a@b.ie', 'password1')).toEqual({ role: 'Sales Manager' });
  });
  it('returns auth errors', async () => {
    mock.auth.signInWithPassword.mockResolvedValueOnce({ data: { user: null as never }, error: { message: 'Invalid login credentials' } as never });
    expect(await signInLive('a@b.ie', 'x')).toEqual({ error: 'Invalid login credentials' });
  });
});
