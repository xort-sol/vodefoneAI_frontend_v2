import { describe, expect, it } from 'vitest';
import { fmtEUR } from './format';

describe('fmtEUR', () => {
  it('formats euro', () => expect(fmtEUR(1250)).toBe('€1,250'));
  it('honours decimals', () => expect(fmtEUR(24.39, 2)).toBe('€24.39'));
});
