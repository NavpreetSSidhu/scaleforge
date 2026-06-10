import { describe, expect, it } from 'vitest';
import { compact, compactUsd } from './format';

describe('compact', () => {
  it('leaves sub-thousand values as rounded integers', () => {
    expect(compact(0)).toBe('0');
    expect(compact(42)).toBe('42');
    expect(compact(999)).toBe('999');
    expect(compact(270.6)).toBe('271');
  });

  it('abbreviates thousands and trims a trailing .0', () => {
    expect(compact(1000)).toBe('1k');
    expect(compact(6300)).toBe('6.3k');
    expect(compact(1500)).toBe('1.5k');
  });

  it('abbreviates millions', () => {
    expect(compact(1_000_000)).toBe('1M');
    expect(compact(2_500_000)).toBe('2.5M');
  });

  it('handles negative values by magnitude', () => {
    expect(compact(-1500)).toBe('-1.5k');
  });

  it('returns 0 for non-finite input', () => {
    expect(compact(Number.NaN)).toBe('0');
    expect(compact(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('compactUsd', () => {
  it('prefixes a dollar sign to the compacted value', () => {
    expect(compactUsd(270)).toBe('$270');
    expect(compactUsd(3300)).toBe('$3.3k');
  });
});
