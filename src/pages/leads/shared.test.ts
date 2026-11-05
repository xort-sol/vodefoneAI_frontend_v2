import { describe, expect, it } from 'vitest';
import { normaliseIrishPhone } from './shared';

describe('normaliseIrishPhone', () => {
  it.each([
    ['087 123 4567', '+353871234567'],
    ['00353871234567', '+353871234567'],
    ['+353 87 123 4567', '+353871234567'],
    ['(01) 437 8407', '+35314378407'],
  ])('normalises %s', (raw, out) => expect(normaliseIrishPhone(raw)).toBe(out));
  it('rejects junk', () => expect(normaliseIrishPhone('12')).toBeNull());
  it('rejects UK numbers', () => expect(normaliseIrishPhone('+44 7700 900123')).toBeNull());
});
