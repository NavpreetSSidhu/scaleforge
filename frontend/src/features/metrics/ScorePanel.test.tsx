import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScorePanel } from './ScorePanel';
import { useArchitectureStore } from '@/store/architectureStore';
import type { Scores } from '@/types/domain';

const scores: Scores = {
  performance: 91,
  reliability: 84,
  scalability: 89,
  costEfficiency: 72,
  maintainability: 86,
  overallGrade: 'A-',
};

describe('ScorePanel', () => {
  beforeEach(() => {
    useArchitectureStore.setState({ scoreView: 'cards' });
  });

  it('renders every category with its value in cards view', () => {
    render(<ScorePanel scores={scores} />);

    for (const label of [
      'Performance',
      'Reliability',
      'Scalability',
      'Cost Efficiency',
      'Maintainability',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('91')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
  });

  it('renders short axis labels in radar view with the overall score', () => {
    useArchitectureStore.setState({ scoreView: 'radar' });
    render(<ScorePanel scores={scores} />);

    expect(screen.getByText('Perf')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
    expect(screen.getByText('84/100')).toBeInTheDocument();
    expect(screen.getByText('Resilient')).toBeInTheDocument();
  });
});
