import { describe, expect, it } from 'vitest';
import { gradeMeta, overallScore } from './score';
import type { Scores } from '@/types/domain';

const scores = (overrides: Partial<Scores> = {}): Scores => ({
  performance: 90,
  reliability: 80,
  scalability: 85,
  costEfficiency: 70,
  maintainability: 85,
  overallGrade: 'A-',
  ...overrides,
});

describe('overallScore', () => {
  it('averages the five categories and rounds', () => {
    // (90 + 80 + 85 + 70 + 85) / 5 = 82
    expect(overallScore(scores())).toBe(82);
  });

  it('rounds to the nearest integer', () => {
    // (91 + 91 + 91 + 91 + 90) / 5 = 90.8 -> 91
    expect(
      overallScore(
        scores({
          performance: 91,
          reliability: 91,
          scalability: 91,
          costEfficiency: 91,
          maintainability: 90,
        }),
      ),
    ).toBe(91);
  });
});

describe('gradeMeta', () => {
  it('maps each letter to a colour and qualitative label', () => {
    expect(gradeMeta('A-')).toEqual({ color: '#2fd39e', label: 'Resilient' });
    expect(gradeMeta('B+')).toEqual({ color: '#8fd14f', label: 'Solid' });
    expect(gradeMeta('C')).toEqual({ color: '#f5b14b', label: 'Risky' });
    expect(gradeMeta('D').label).toBe('Fragile');
    expect(gradeMeta('F').label).toBe('Fragile');
  });

  it('is case-insensitive on the leading letter', () => {
    expect(gradeMeta('a').label).toBe('Resilient');
  });
});
