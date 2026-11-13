import { describe, expect, it, vi } from 'vitest';

vi.mock('../../live/client', () => ({ getMode: () => 'live' }));

import { qualBreakdown, qualStatus } from './state';
import type { Call } from '../../data/types';

const call = (o: Partial<Call>) => ({ id: 'c1', outcome: 'Interested', score: 0, ...o }) as Call;

describe('qualStatus', () => {
  it.each([[39, 'Not qualified'], [40, 'Nurture'], [59, 'Nurture'], [60, 'Warm'], [90, 'Warm']] as const)('score %i -> %s', (score, want) =>
    expect(qualStatus(call({ score }))).toBe(want));
  it.each([['hot', 'Qualified'], ['warm', 'Warm'], ['developing', 'Nurture'], ['low', 'Not qualified']] as const)(
    'stored %s -> %s, whatever the score', (classification, want) => expect(qualStatus(call({ score: 50, classification }))).toBe(want));
});

describe('qualBreakdown', () => {
  it('lists the 11 matrix criteria with their points', () => {
    const b = qualBreakdown(call({ qualification: { decision_maker: 10, employees_5: 0, next_step: 10 } }));
    expect(b).toHaveLength(11);
    expect(b[0]).toMatchObject({ key: 'Decision maker', value: 10, max: 10 });
    expect(b[1]).toMatchObject({ value: 0, max: 5 });
    expect(b.map((x) => x.key)).not.toContain('Need');
  });
  it('an old 4-key row keeps its old breakdown out of 25', () => {
    const b = qualBreakdown(call({ qualification: { need: 20, budget: 10, timeline: 5, authority: 15 } }));
    expect(b.map((x) => [x.key, x.value, x.max])).toEqual([['Need', 20, 25], ['Budget', 10, 25], ['Timeline', 5, 25], ['Authority', 15, 25]]);
  });
  it('no qualification in Live shows nothing', () => expect(qualBreakdown(call({}))).toEqual([]));
});
