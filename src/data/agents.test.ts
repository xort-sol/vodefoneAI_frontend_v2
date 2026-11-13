import { describe, expect, it } from 'vitest';
import { agents, campaigns } from './seed';

describe('agents', () => {
  it('offers only Ava and Emily, with the ids the backend maps to voices', () => {
    expect(agents.map((a) => [a.id, a.name])).toEqual([['ag-01', 'Ava'], ['ag-02', 'Emily']]);
  });
  it('every seeded campaign uses one of them', () => {
    const ids = new Set(agents.map((a) => a.id));
    expect(campaigns.every((c) => ids.has(c.agentId))).toBe(true);
  });
});
