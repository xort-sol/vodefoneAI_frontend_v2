// Every Supabase read and write for Live mode. Failures throw; the store turns them into a toast or loadError.
import type { Suppression, TranscriptLine } from '../data/types';
import { campaignStats, toCall, toCampaign, toLead, toMember, toSuppression, toTranscript } from './adapters';
import { supabase } from './client';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const groupBy = (rows: Row[], key: string): Map<unknown, Row[]> => {
  const m = new Map<unknown, Row[]>();
  for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
  return m;
};

/** The signed-in user's profile row, or null when signed out. */
export async function loadMe(): Promise<Row | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return ok(await supabase.from('profiles').select('*').eq('id', data.session.user.id).single());
}

export function onAuthChange(cb: () => void): () => void {
  // Supabase holds its auth lock during this callback, so queries must run after it returns
  const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(cb, 0); });
  return () => data.subscription.unsubscribe();
}

export async function loadAll() {
  const newest = { ascending: false };
  const [leads, notes, campaigns, calls, profiles, suppression] = (await Promise.all([
    supabase.from('leads').select('*').order('created_at', newest),
    supabase.from('lead_notes').select('*').order('created_at', newest),
    supabase.from('campaigns').select('*').order('created_at', newest),
    // Calls with no lead are console tests; they stay out of every number
    supabase.from('calls').select('*, analyses(*)').not('lead_id', 'is', null).order('created_at', newest),
    supabase.from('profiles').select('*').not('role', 'is', null),
    supabase.from('suppression').select('*').order('created_at', newest),
  ])).map(ok) as Row[][];

  const notesByLead = groupBy(notes, 'lead_id');
  const leadsByCampaign = groupBy(leads, 'campaign_id');
  const campaignRows = new Map(campaigns.map((c) => [c.id, c]));
  const nameOf = new Map(profiles.map((p) => [p.id, toMember(p).name]));
  const leadNameByPhone = new Map(leads.map((l) => [l.phone, l.name]));
  const callList = calls.map((c) => toCall(c, campaignRows.get(c.campaign_id)));

  return {
    leads: leads.map((l) => toLead(l, notesByLead.get(l.id) ?? [])),
    calls: callList,
    campaigns: campaigns.map((c) => ({
      ...toCampaign(c, { totalLeads: leadsByCampaign.get(c.id)?.length ?? 0, ...campaignStats(callList.filter((x) => x.campaignId === String(c.id))) }),
      createdBy: nameOf.get(c.created_by) ?? '',
    })),
    team: profiles.map(toMember),
    suppressions: suppression.map((s) => toSuppression(s, leadNameByPhone.get(s.phone) ?? '')),
  };
}

export async function saveLead(id: string, patch: Row): Promise<void> {
  ok(await supabase.from('leads').update(patch).eq('id', id));
}
export async function saveLeads(ids: string[], patch: Row): Promise<void> {
  ok(await supabase.from('leads').update(patch).in('id', ids));
}
export async function insertLead(row: Row): Promise<string> {
  return String(ok<Row>(await supabase.from('leads').insert(row).select('id').single()).id);
}
export async function insertLeads(rows: Row[]): Promise<void> {
  ok(await supabase.from('leads').insert(rows));
}
export async function addNote(leadId: string, author: string, text: string): Promise<void> {
  ok(await supabase.from('lead_notes').insert({ lead_id: leadId, author, text }));
}
export async function insertCampaign(row: Row): Promise<string> {
  return String(ok<Row>(await supabase.from('campaigns').insert(row).select('id').single()).id);
}
export async function saveCampaign(id: string, patch: Row): Promise<void> {
  ok(await supabase.from('campaigns').update(patch).eq('id', id));
}
export async function insertSuppression(s: Omit<Suppression, 'id'>): Promise<void> {
  // Salespeople cannot read this table, so they can hit a number that is already listed; that is not a failure
  ok(await supabase.from('suppression').upsert({ phone: s.phone, reason: s.reason, source: 'manual' }, { onConflict: 'phone', ignoreDuplicates: true }));
}
export async function deleteSuppression(phone: string): Promise<void> {
  ok(await supabase.from('suppression').delete().eq('phone', phone));
}
export async function loadTranscript(callId: string): Promise<TranscriptLine[]> {
  return toTranscript(ok(await supabase.from('transcripts').select('*').eq('call_id', callId).order('position')));
}
