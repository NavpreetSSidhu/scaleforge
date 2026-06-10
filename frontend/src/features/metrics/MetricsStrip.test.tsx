import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricsStrip } from './MetricsStrip';
import { useArchitectureStore } from '@/store/architectureStore';
import type { SimulationResult } from '@/types/domain';

const result = (overrides: Partial<SimulationResult> = {}): SimulationResult => ({
  id: 'sim-1',
  estimatedRps: 1500,
  incomingRps: 2500,
  estimatedLatencyMs: 31,
  systemCapacityRps: 1500,
  monthlyCostUsd: 210,
  bottleneck: {
    nodeId: 'sql',
    nodeType: 'sql_primary',
    label: 'SQL Primary',
    capacity: 1500,
    incoming: 2500,
  },
  nodeHealth: [],
  scores: {
    performance: 91,
    reliability: 84,
    scalability: 89,
    costEfficiency: 72,
    maintainability: 86,
    overallGrade: 'A-',
  },
  recommendations: [],
  createdAt: '2026-06-09T00:00:00Z',
  ...overrides,
});

describe('MetricsStrip', () => {
  beforeEach(() => {
    useArchitectureStore.setState({
      simulationResult: null,
      traffic: {
        dailyActiveUsers: 50000,
        monthlyActiveUsers: 150000,
        concurrentUsers: 5000,
        requestsPerUserMin: 2,
        peakTrafficMultiplier: 1.5,
      },
    });
  });

  it('shows placeholder dashes for simulation metrics before a run', () => {
    render(<MetricsStrip />);
    // Concurrent users always renders from traffic; the rest are em dashes.
    expect(screen.getByText('5k users')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('renders simulated throughput, latency, cost and grade after a run', () => {
    useArchitectureStore.setState({ simulationResult: result() });
    render(<MetricsStrip />);

    expect(screen.getByText('1.5k rps')).toBeInTheDocument();
    expect(screen.getByText('31 ms')).toBeInTheDocument();
    expect(screen.getByText('$210 /mo')).toBeInTheDocument();
    expect(screen.getByText('A-')).toBeInTheDocument();
    expect(screen.getByText('84/100')).toBeInTheDocument(); // mean of the five scores
  });

  it('surfaces a critical alert when the bottleneck is overloaded', () => {
    useArchitectureStore.setState({ simulationResult: result() });
    render(<MetricsStrip />);

    expect(screen.getByText('1 critical')).toBeInTheDocument();
    expect(screen.getByText('· SQL Primary')).toBeInTheDocument();
  });

  it('hides the critical alert when capacity covers incoming traffic', () => {
    useArchitectureStore.setState({
      simulationResult: result({
        bottleneck: {
          nodeId: 'sql',
          nodeType: 'sql_primary',
          label: 'SQL Primary',
          capacity: 5000,
          incoming: 2500,
        },
      }),
    });
    render(<MetricsStrip />);

    expect(screen.queryByText('1 critical')).not.toBeInTheDocument();
  });
});
