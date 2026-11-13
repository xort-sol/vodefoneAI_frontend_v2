import { describe, expect, it } from 'vitest';
import { CRITERIA, CLASS_LABEL, HOT, WARM, DEVELOPING, classify, isPriority } from './scoring';

describe('classify', () => {
  it.each([
    [0, 'low'], [39, 'low'], [40, 'developing'], [59, 'developing'], [60, 'warm'], [79, 'warm'], [80, 'hot'], [100, 'hot'],
  ] as const)('%i -> %s', (score, want) => expect(classify(score)).toBe(want));
  it('thresholds match the backend matrix', () => expect([HOT, WARM, DEVELOPING]).toEqual([80, 60, 40]));
  it('labels every class', () => expect(CLASS_LABEL).toEqual({ hot: 'Hot', warm: 'Warm', developing: 'Developing', low: 'Low' }));
});

describe('isPriority', () => {
  it.each([
    ['Hot', 10, true], ['Warm', 80, true], ['Warm', 79, false],
    ['Do not call', 95, false], ['Not interested', 95, false], ['Converted', 95, false],
  ] as const)('%s at %i -> %s', (status, score, want) => expect(isPriority({ status, score })).toBe(want));
});

describe('criteria', () => {
  it('are the 11 backend keys, worth 100 in all', () => {
    expect(CRITERIA.map((c) => c.key)).toEqual([
      'decision_maker', 'employees_5', 'bb_spend_50', 'bb_contract_6m', 'bb_issues', 'mobiles_5', 'mob_spend_150',
      'm365_need', 'multiple_suppliers', 'considering_change', 'next_step',
    ]);
    expect(CRITERIA.reduce((s, c) => s + c.max, 0)).toBe(100);
    expect(CRITERIA.every((c) => c.label.length > 0)).toBe(true);
  });
});

// Every page that buckets a score reads the shared numbers, never its own literal
const SOURCES = import.meta.glob<string>('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
describe('pages use the shared thresholds', () => {
  const FILES = [
    'live/adapters.ts', 'pages/conversations/state.ts', 'components/ui.tsx', 'pages/Workspace.tsx', 'pages/Qualified.tsx',
    'pages/LeadProfile.tsx', 'pages/CampaignDetail.tsx', 'store/store.tsx', 'pages/agents/model.ts', 'data/seed.ts',
  ];
  it.each(FILES)('%s has no literal score threshold', (f) => {
    const src = SOURCES[`../${f}`];
    expect(src).toBeTruthy();
    expect(src).not.toMatch(/(score|value) >= \d/);
    expect(src).not.toMatch(/(hot|warm)Threshold: \d/);
    expect(src).not.toMatch(/≥ 85/);
  });
});
