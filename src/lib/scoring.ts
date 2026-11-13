// The one source for score thresholds and management's 100-point matrix; mirrors the backend's src/analysis/score.py.
export const HOT = 80;
export const WARM = 60;
export const DEVELOPING = 40;

export type Classification = 'hot' | 'warm' | 'developing' | 'low';
export const classify = (score: number): Classification =>
  score >= HOT ? 'hot' : score >= WARM ? 'warm' : score >= DEVELOPING ? 'developing' : 'low';
export const CLASS_LABEL: Record<Classification, string> = { hot: 'Hot', warm: 'Warm', developing: 'Developing', low: 'Low' };

export const CRITERIA = [
  { key: 'decision_maker', label: 'Decision maker', max: 10 },
  { key: 'employees_5', label: '5+ employees', max: 5 },
  { key: 'bb_spend_50', label: 'Broadband spend €50+', max: 10 },
  { key: 'bb_contract_6m', label: 'Broadband contract ends within 6 months', max: 10 },
  { key: 'bb_issues', label: 'Broadband issues', max: 10 },
  { key: 'mobiles_5', label: '5+ mobiles', max: 10 },
  { key: 'mob_spend_150', label: 'Mobile spend €150+', max: 10 },
  { key: 'm365_need', label: 'Microsoft 365 need', max: 5 },
  { key: 'multiple_suppliers', label: 'Multiple suppliers', max: 10 },
  { key: 'considering_change', label: 'Considering a change', max: 10 },
  { key: 'next_step', label: 'Next step agreed', max: 10 },
] as const;

/** Statuses a score must never override: the customer said no, opted out, or already bought. */
export const CLOSED_STATUSES = ['Converted', 'Not interested', 'Do not call'];
export const isPriority = (l: { status: string; score: number }) =>
  !CLOSED_STATUSES.includes(l.status) && (l.status === 'Hot' || l.score >= HOT);

/** A matrix breakdown, as opposed to the old need/budget/timeline/authority one older calls stored. */
export const isMatrix = (q: Record<string, number> | undefined): q is Record<string, number> =>
  !!q && CRITERIA.some((c) => c.key in q);
