import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake PostgREST builder: records every chained call and resolves to the rows queued for its table.
const { fake } = vi.hoisted(() => {
  const fake = {
    tables: {} as Record<string, unknown>, errors: {} as Record<string, string>,
    log: [] as { table: string; calls: [string, unknown[]][] }[],
    session: { user: { id: 'u1' } } as unknown,
    from(table: string) {
      const entry = { table, calls: [] as [string, unknown[]][] }; fake.log.push(entry);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'not', 'order', 'single']) q[m] = (...a: unknown[]) => { entry.calls.push([m, a]); return q; };
      q.then = (res: (v: unknown) => void) => res({ data: fake.tables[table] ?? [], error: fake.errors[table] ? { message: fake.errors[table] } : null });
      return q;
    },
    auth: { getSession: async () => ({ data: { session: fake.session } }) },
  };
  return { fake };
});
vi.mock('./client', () => ({ supabase: fake }));

import { deleteSuppression, insertLead, insertSuppression, loadAll, loadMe, loadTranscript, saveLead, saveLeads } from './repo';

const call = (table: string, method: string) => fake.log.find((l) => l.table === table)?.calls.find(([m]) => m === method)?.[1];

beforeEach(() => { fake.tables = {}; fake.errors = {}; fake.log = []; fake.session = { user: { id: 'u1' } }; });

describe('loadAll', () => {
  it('reads only calls with a lead, and builds campaign stats from them', async () => {
    fake.tables = {
      leads: [{ id: 1, status: 'new', campaign_id: 5, phone: '+3531' }, { id: 2, status: 'new', campaign_id: 5 }],
      lead_notes: [{ id: 8, lead_id: 1, author: 'A', text: 'hi', created_at: 'x' }],
      campaigns: [{ id: 5, name: 'C', status: 'running', agent_ref: 'ag-02', created_by: 'u1' }],
      calls: [{ id: 3, lead_id: 1, campaign_id: 5, outcome: 'interested', duration_s: 120, analyses: { score: 90 } }],
      profiles: [{ id: 'u1', full_name: 'Mary', role: 'admin' }],
      suppression: [{ phone: '+3531', reason: 'Complaint', source: 'call', created_at: 'x' }],
    };
    const d = await loadAll();
    expect(call('calls', 'not')).toEqual(['lead_id', 'is', null]);
    expect(d.leads[0].notes[0].text).toBe('hi');
    expect(d.calls[0]).toMatchObject({ agentId: 'ag-02', outcome: 'Qualified' });
    expect(d.campaigns[0]).toMatchObject({ totalLeads: 2, attempted: 1, connected: 1, qualified: 1, minutes: 2, createdBy: 'Mary' });
    expect(d.team[0].role).toBe('Administrator');
    expect(d.suppressions[0]).toMatchObject({ id: '+3531', phone: '+3531', name: '', reason: 'Complaint' });
  });
  it('throws when any table fails', async () => {
    fake.errors = { calls: 'boom' };
    await expect(loadAll()).rejects.toThrow('boom');
  });
});

it('loadMe is null when signed out and reads the signed-in profile otherwise', async () => {
  fake.tables = { profiles: { id: 'u1', role: 'analyst' } };
  await expect(loadMe()).resolves.toEqual({ id: 'u1', role: 'analyst' });
  expect(call('profiles', 'eq')).toEqual(['id', 'u1']);
  fake.session = null;
  await expect(loadMe()).resolves.toBeNull();
});

it('writes reach the right rows and throw on refusal', async () => {
  await saveLead('1', { name: 'x' });
  expect(call('leads', 'update')).toEqual([{ name: 'x' }]);
  expect(call('leads', 'eq')).toEqual(['id', '1']);
  await saveLeads(['1', '2'], { archived: true });
  expect(fake.log[1].calls).toContainEqual(['in', ['id', ['1', '2']]]);
  fake.errors = { leads: 'permission denied' };
  await expect(saveLead('1', { status: 'new' })).rejects.toThrow('permission denied');
});

it('insertLead returns the new id as a string', async () => {
  fake.tables = { leads: { id: 42 } };
  await expect(insertLead({ name: 'x' })).resolves.toBe('42');
});

it('web suppressions are source manual, and an existing number is left alone', async () => {
  await insertSuppression({ phone: '+3531', name: 'A', reason: 'Complaint', addedAt: 'x', addedBy: 'y' });
  expect(call('suppression', 'upsert')).toEqual([{ phone: '+3531', reason: 'Complaint', source: 'manual' }, { onConflict: 'phone', ignoreDuplicates: true }]);
  await deleteSuppression('+3531');
  expect(fake.log[1].calls).toContainEqual(['eq', ['phone', '+3531']]);
});

it('loadTranscript orders by position and strips stage directions', async () => {
  fake.tables = { transcripts: [{ role: 'agent', text: '[warm] Hello', t_seconds: 2 }] };
  await expect(loadTranscript('7')).resolves.toEqual([{ t: 2, speaker: 'AI', text: 'Hello' }]);
  expect(call('transcripts', 'order')).toEqual(['position']);
});
