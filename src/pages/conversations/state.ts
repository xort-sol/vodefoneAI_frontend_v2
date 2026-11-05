// Local (front-end only) QA annotation state for conversations.
// Kept at module level so it survives navigation between conversations in a session.
// Backend integration point: POST /conversations/:id/annotations
import { useEffect, useState } from 'react';
import type { Call } from '../../data/types';
import type { Tone } from '../../components/ui';

export interface Annotation {
  tags: string[];
  qa: number; // 0 = not scored, 1–5
  flagged: boolean;
  notes: { id: string; author: string; at: string; text: string }[];
  kb: string[]; // unanswered questions sent to knowledge base
  escalated?: string; // rep id
}
const empty = (): Annotation => ({ tags: [], qa: 0, flagged: false, notes: [], kb: [] });
const store = new Map<string, Annotation>();
const subs = new Set<() => void>();

export function getAnnotation(id: string) { return store.get(id) ?? empty(); }
export function allAnnotations() { return store; }
export function setAnnotation(id: string, patch: Partial<Annotation>) {
  store.set(id, { ...getAnnotation(id), ...patch });
  subs.forEach((f) => f());
}
export function useAnnotation(id: string): [Annotation, (p: Partial<Annotation>) => void] {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return [getAnnotation(id), (p) => setAnnotation(id, p)];
}

// Ordered list of the conversations last shown in a list view (for prev/next navigation).
let navList: string[] = [];
export const setNavList = (ids: string[]) => { navList = ids; };
export const getNavList = () => navList;

export const PRESET_TAGS = ['Great objection handling', 'Compliance issue', 'Clear disclosure', 'Missed upsell', 'Pricing error', 'Excellent rapport', 'Talked over customer', 'Coaching example'];
export const TAG_TONE = (t: string): Tone => /compliance|error|over/i.test(t) ? 'red' : /missed/i.test(t) ? 'amber' : /great|excellent|clear/i.test(t) ? 'green' : 'blue';

export function hash(s: string) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function hashFrac(s: string) { return (hash(s) % 10000) / 10000; }

export type QualStatus = 'Qualified' | 'Warm' | 'Nurture' | 'Not qualified';
export function qualStatus(c: Call): QualStatus {
  if (c.outcome === 'Qualified' || c.outcome === 'Transferred to human') return 'Qualified';
  if (c.score >= 55) return 'Warm';
  if (c.score >= 35) return 'Nurture';
  return 'Not qualified';
}
export const QUAL_TONE: Record<QualStatus, Tone> = { Qualified: 'green', Warm: 'amber', Nurture: 'purple', 'Not qualified': 'neutral' };

/** Deterministic need / budget / timeline / authority split of the qualification score (each out of 25). */
export function qualBreakdown(c: Call) {
  const keys = ['Need', 'Budget', 'Timeline', 'Authority'] as const;
  const w = keys.map((k) => 0.7 + hashFrac(c.id + k) * 0.6);
  const sw = w.reduce((a, b) => a + b, 0);
  let parts = w.map((x) => Math.min(25, Math.round((c.score * x) / sw)));
  const diff = c.score - parts.reduce((a, b) => a + b, 0);
  if (diff !== 0) { const i = parts.findIndex((p) => p + diff >= 0 && p + diff <= 25); if (i >= 0) parts = parts.map((p, j) => (j === i ? p + diff : p)); }
  const hints: Record<string, [string, string]> = {
    Need: ['Clear usage need identified', 'Weak or unconfirmed need'],
    Budget: ['Price accepted / budget confirmed', 'Budget not confirmed'],
    Timeline: ['Wants to move within 30 days', 'No timeline given'],
    Authority: ['Account holder / decision maker', 'Needs approval from others'],
  };
  return keys.map((k, i) => ({ key: k, value: parts[i], hint: parts[i] >= 15 ? hints[k][0] : hints[k][1] }));
}
