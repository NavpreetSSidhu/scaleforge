import type { Scores } from '@/types/domain';

/** Mean of the five category scores, rounded — an overall 0–100 figure. */
export function overallScore(scores: Scores): number {
  const values = [
    scores.performance,
    scores.reliability,
    scores.scalability,
    scores.costEfficiency,
    scores.maintainability,
  ];
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export interface GradeMeta {
  color: string;
  label: string;
}

/** Colour + qualitative label for a letter grade. */
export function gradeMeta(grade: string): GradeMeta {
  const letter = grade.charAt(0).toUpperCase();
  switch (letter) {
    case 'A':
      return { color: '#2fd39e', label: 'Resilient' };
    case 'B':
      return { color: '#8fd14f', label: 'Solid' };
    case 'C':
      return { color: '#f5b14b', label: 'Risky' };
    default:
      return { color: '#ff6058', label: 'Fragile' };
  }
}
