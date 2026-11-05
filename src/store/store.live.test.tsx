// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Call, Campaign, Lead } from '../data/types';

const h = vi.hoisted(() => ({ mode: 'live' as 'live' | 'demo' }));
vi.mock('../live/client', () => ({ getMode: () => h.mode, isLiveConfigured: () => true, setMode: vi.fn(), signInLive: vi.fn(), supabase: {} }));
vi.mock('../live/repo', () => ({
  loadMe: vi.fn(), loadAll: vi.fn(), onAuthChange: vi.fn(), saveLead: vi.fn(), saveLeads: vi.fn(), insertLead: vi.fn(), insertLeads: vi.fn(),
  addNote: vi.fn(), insertCampaign: vi.fn(), saveCampaign: vi.fn(), insertSuppression: vi.fn(), deleteSuppression: vi.fn(), loadTranscript: vi.fn(),
}));

import * as repo from '../live/repo';
import { AppProvider, useApp } from './store';
import { campaignStats } from '../live/adapters';
import { dailySeries } from '../lib/metrics';
import * as seed from '../data/seed';

const r = vi.mocked(repo);
const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;
const lead = (o: Partial<Lead> = {}) => ({ ...seed.leads[0], id: '1', name: 'Real Lead', campaignId: null, ...o }) as Lead;
const call = (o: Partial<Call> = {}) => ({ ...seed.calls[0], id: '7', leadId: '1', simulated: false, ...o }) as Call;
const profile = { id: 'u1', email: 'm@x.ie', full_name: 'Mary Manager', role: 'sales_manager', created_at: '2026-01-01T00:00:00Z' };
const data = (o = {}) => ({ leads: [lead()], calls: [call()], campaigns: [] as Campaign[], team: [], suppressions: [], ...o });

async function start() {
  const hook = renderHook(() => useApp(), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return hook;
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.mode = 'live';
  localStorage.clear();
  r.loadMe.mockResolvedValue(profile);
  r.loadAll.mockResolvedValue(data());
  r.onAuthChange.mockReturnValue(() => {});
  for (const f of [r.saveLead, r.saveLeads, r.insertLeads, r.addNote, r.saveCampaign, r.insertSuppression, r.deleteSuppression]) f.mockResolvedValue(undefined);
  r.insertLead.mockResolvedValue('42');
  r.insertCampaign.mockResolvedValue('9');
  r.loadTranscript.mockResolvedValue([{ t: 1, speaker: 'AI', text: 'Hello' }]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('live mode', () => {
  it('starts empty and runs no simulation', async () => {
    r.loadAll.mockReturnValue(new Promise(() => {}));
    const { result } = await start();
    const c = result.current;
    expect(c.mode).toBe('live');
    for (const list of [c.leads, c.calls, c.campaigns, c.team, c.appointments, c.tasks, c.notifications, c.consents, c.deletionRequests, c.auditLog, c.suppressions]) expect(list).toEqual([]);
    expect(c.agents).toBe(seed.agents); expect(c.products).toBe(seed.products); expect(c.offers).toBe(seed.offers);
    await tick(20000);
    expect(result.current.live).toEqual([]);
  });

  it('loads real rows and refreshes every 5 seconds', async () => {
    const { result } = await start();
    expect(result.current.leads.map((l) => l.name)).toEqual(['Real Lead']);
    r.loadAll.mockResolvedValue(data({ leads: [lead({ name: 'Renamed' })] }));
    await tick(5000);
    expect(result.current.leads[0].name).toBe('Renamed');
  });

  it('role and me come from the signed-in profile, never the seed or stored role', async () => {
    localStorage.setItem('vf-role', 'Super Admin');
    const { result } = await start();
    expect(result.current.role).toBe('Sales Manager');
    expect(result.current.me).toMatchObject({ id: 'u1', name: 'Mary Manager', role: 'Sales Manager' });
    expect(result.current.can('leads.delete')).toBe(false);
    act(() => result.current.setRole('Super Admin'));
    expect(result.current.role).toBe('Sales Manager');
    expect(localStorage.getItem('vf-role')).toBe('Super Admin');
  });

  it('has no privileges before the profile arrives, and tells a user with no role', async () => {
    r.loadMe.mockResolvedValue({ ...profile, role: null });
    const { result } = await start();
    expect(result.current.role).toBe('Analyst');
    expect(result.current.loadError).toMatch(/no role/i);
    expect(r.loadAll).not.toHaveBeenCalled();
  });

  it('loads after sign-in and clears the data after sign-out', async () => {
    r.loadMe.mockResolvedValue(null);
    const { result } = await start();
    expect(r.loadAll).not.toHaveBeenCalled();
    const onChange = r.onAuthChange.mock.calls[0][0];
    r.loadMe.mockResolvedValue(profile);
    await act(async () => { onChange(); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.leads).toHaveLength(1);
    r.loadMe.mockResolvedValue(null);
    await act(async () => { onChange(); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.leads).toEqual([]);
    expect(result.current.role).toBe('Analyst');
  });

  it('updateLead writes through and maps status', async () => {
    const { result } = await start();
    act(() => result.current.updateLead('1', { status: 'Converted' }));
    expect(r.saveLead).toHaveBeenCalledWith('1', { sales_status: 'Converted' });
    expect(result.current.leads[0].status).toBe('Converted');
  });

  it('never writes columns the web may not change', async () => {
    const { result } = await start();
    act(() => result.current.updateLead('1', { score: 99, lastCallAt: 'x', attempts: 3, dnc: true, phone: '1', source: 'CSV import', aiSummary: 'x', notes: [] }));
    expect(r.saveLead).not.toHaveBeenCalled();
    act(() => result.current.updateLeads(['1', '2'], { assignedRepId: 'u2', campaignId: null, status: 'Queued', score: 1 }));
    expect(r.saveLeads).toHaveBeenCalledWith(['1', '2'], { assigned_to: 'u2', campaign_id: null, sales_status: null });
  });

  it('a failed write shows an error toast and reloads', async () => {
    const { result } = await start();
    r.saveLead.mockRejectedValue(new Error('denied'));
    r.loadAll.mockClear();
    await act(async () => { result.current.updateLead('1', { name: 'Nope' }); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.toasts.slice(-1)[0]).toMatchObject({ kind: 'error', desc: 'denied' });
    expect(r.loadAll).toHaveBeenCalledTimes(1);
    expect(result.current.leads[0].name).toBe('Real Lead');
  });

  it('a load started before a write cannot overwrite it', async () => {
    const { result } = await start();
    let finish = (_: ReturnType<typeof data>) => {};
    r.loadAll.mockReturnValueOnce(new Promise((res) => { finish = res; }));
    await tick(5000);
    await act(async () => { result.current.updateLead('1', { name: 'Edited' }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { finish(data()); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.leads[0].name).toBe('Edited');
  });

  it('a failed load sets loadError, keeps the shell usable and clears on recovery', async () => {
    r.loadAll.mockRejectedValue(new Error('offline'));
    const { result } = await start();
    expect(result.current.loadError).toMatch(/offline/);
    expect(result.current.me.id).toBe('u1');
    expect(result.current.leads).toEqual([]);
    r.loadAll.mockResolvedValue(data());
    await tick(5000);
    expect(result.current.loadError).toBeNull();
  });

  it('transcriptFor fetches once and caches', async () => {
    const { result } = await start();
    const c = result.current.calls[0];
    expect(result.current.transcriptFor(c)).toEqual([]);
    expect(result.current.transcriptFor(c)).toEqual([]);
    await tick(0);
    expect(result.current.transcriptFor(c)).toEqual([{ t: 1, speaker: 'AI', text: 'Hello' }]);
    expect(r.loadTranscript).toHaveBeenCalledTimes(1);
    expect(r.loadTranscript).toHaveBeenCalledWith('7');
  });

  it('a failed transcript load is retried, not cached as empty', async () => {
    const { result } = await start();
    r.loadTranscript.mockRejectedValueOnce(new Error('x'));
    result.current.transcriptFor(result.current.calls[0]);
    await tick(0);
    result.current.transcriptFor(result.current.calls[0]);
    expect(r.loadTranscript).toHaveBeenCalledTimes(2);
  });

  it('addLead and addCampaign return the saved record, or null when the insert fails', async () => {
    const { result } = await start();
    const { id: _l, ...newLead } = lead({ status: 'Queued', currentPlan: 'Red', source: 'Web form' });
    let saved: Lead | null = null;
    await act(async () => { saved = await result.current.addLead(newLead); });
    expect(saved).toMatchObject({ id: '42', name: 'Real Lead' });
    expect(r.insertLead.mock.calls[0][0]).toMatchObject({ name: 'Real Lead', sales_status: null, source: 'Web form', current_plan: 'Red' });
    expect(result.current.leads[0].id).toBe('42');

    const { id: _c, ...newCamp } = { ...seed.campaigns[0], status: 'Active' as const, schedule: { days: ['Mon'], start: '09:30', end: '18:00', timezone: 'Europe/Dublin' } };
    let camp: Campaign | null = null;
    await act(async () => { camp = await result.current.addCampaign(newCamp); });
    expect(camp).toMatchObject({ id: '9' });
    expect(r.insertCampaign.mock.calls[0][0]).toMatchObject({
      status: 'running', product_ref: newCamp.productId, agent_ref: newCamp.agentId, offer_ref: newCamp.offerId, days: ['Mon'],
      calling_hours_start: '09:30', calling_hours_end: '18:00', max_attempts: newCamp.retry.maxAttempts, retry_hours: newCamp.retry.intervalHours,
      concurrency: newCamp.concurrency, daily_cap: newCamp.dailyCap, min_score: newCamp.qualification.minScore, created_by: 'u1',
    });

    r.insertLead.mockRejectedValue(new Error('nope'));
    await act(async () => { saved = await result.current.addLead(newLead); });
    expect(saved).toBeNull();
    expect(result.current.toasts.slice(-1)[0]?.kind).toBe('error');
  });

  it('updateCampaign maps status and drops computed fields', async () => {
    const { result } = await start();
    act(() => result.current.updateCampaign('3', { status: 'Stopped', attempted: 5 }));
    expect(r.saveCampaign).toHaveBeenCalledWith('3', { status: 'done' });
  });

  it('notes, archive and suppression write through; audit and delete do nothing', async () => {
    const { result } = await start();
    act(() => result.current.addNote('1', 'Rang back'));
    expect(r.addNote).toHaveBeenCalledWith('1', 'Mary Manager', 'Rang back');
    expect(result.current.leads[0].notes[0].text).toBe('Rang back');
    act(() => result.current.archiveLeads(['1']));
    expect(r.saveLeads).toHaveBeenCalledWith(['1'], { archived: true });
    const s = { phone: '+353871234567', name: 'A', reason: 'Complaint' as const, addedAt: 'x', addedBy: 'y' };
    act(() => result.current.addSuppression(s));
    expect(r.insertSuppression).toHaveBeenCalledWith(s);
    act(() => result.current.removeSuppression(s.phone));
    expect(r.deleteSuppression).toHaveBeenCalledWith(s.phone);
    expect(result.current.suppressions).toEqual([]);
    act(() => result.current.audit('x', 'y', 'Data'));
    expect(result.current.auditLog).toEqual([]);
    act(() => result.current.deleteLeads(['1']));
    expect(result.current.leads).toHaveLength(1);
  });

  it('live charts use only real calls', () => {
    const from = new Date(seed.NOW.getTime() - 200 * seed.DAY); const to = new Date(seed.NOW.getTime() - 150 * seed.DAY);
    expect(dailySeries([], from, to).reduce((n, d) => n + d.calls, 0)).toBe(0);
    h.mode = 'demo';
    expect(dailySeries([], from, to).reduce((n, d) => n + d.calls, 0)).toBeGreaterThan(0);
  });

  it('campaign totals come from its calls', () => {
    expect(campaignStats([
      call({ leadId: '1', connected: true, outcome: 'Qualified', duration: 90 }),
      call({ leadId: '1', connected: false, outcome: 'No answer', duration: 0 }),
      call({ leadId: '2', connected: true, outcome: 'Interested', duration: 60 }),
      call({ leadId: '3', connected: true, outcome: 'Not interested', duration: 30 }),
    ])).toEqual({ attempted: 3, connected: 3, warm: 1, qualified: 1, minutes: 3 });
  });
});

describe('demo mode', () => {
  beforeEach(() => { h.mode = 'demo'; });

  it('is unchanged: seed data, simulation, stored role, no repo calls', async () => {
    localStorage.setItem('vf-role', 'Sales Manager');
    const { result } = await start();
    expect(result.current.mode).toBe('demo');
    expect(result.current.leads.length).toBeGreaterThan(100);
    expect(result.current.team).toBe(seed.team);
    expect(result.current.role).toBe('Sales Manager');
    expect(result.current.live.length).toBeGreaterThan(0);
    expect(result.current.loadError).toBeNull();
    act(() => { result.current.updateLead(result.current.leads[0].id, { name: 'Demo Edit' }); });
    expect(result.current.leads[0].name).toBe('Demo Edit');
    act(() => result.current.setRole('Analyst'));
    expect(localStorage.getItem('vf-role')).toBe('Analyst');
    await tick(3000);
    for (const f of [r.loadMe, r.loadAll, r.onAuthChange, r.saveLead]) expect(f).not.toHaveBeenCalled();
  });

  it('addLead still creates a local lead', async () => {
    const { result } = await start();
    const { id: _id, ...l } = lead();
    let saved: Lead | null = null;
    await act(async () => { saved = await result.current.addLead(l); });
    expect(saved!.id).toMatch(/^LD-/);
    expect(result.current.leads[0].id).toBe(saved!.id);
  });
});
