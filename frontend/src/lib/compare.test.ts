import { describe, expect, it } from 'vitest';
import { isWinner, metricRows, providerScenarios, winTally } from '@/lib/compare';
import type {
  Comparison,
  Graph,
  PricingProvider,
  SimulationResult,
  TrafficProfile,
} from '@/types/domain';

const graph: Graph = {
  nodes: [{ id: 'a', type: 'api_service', label: 'API', position: { x: 0, y: 0 }, config: { cpu: 2, memory: 4, replicas: 2, autoscaling: true } }],
  edges: [],
};
const traffic: TrafficProfile = {
  dailyActiveUsers: 1000,
  monthlyActiveUsers: 3000,
  concurrentUsers: 500,
  requestsPerUserMin: 2,
  peakTrafficMultiplier: 1,
};

const providers: PricingProvider[] = [
  { id: 'aws', label: 'AWS', defaultRegion: 'us-east-1', categoryMultipliers: {}, regions: [], services: {} },
  { id: 'gcp', label: 'Google Cloud', defaultRegion: 'us-central1', categoryMultipliers: {}, regions: [], services: {} },
];

function result(over: Partial<SimulationResult>): SimulationResult {
  return {
    id: 'x',
    estimatedRps: 0,
    incomingRps: 0,
    estimatedLatencyMs: 0,
    systemCapacityRps: 0,
    monthlyCostUsd: 0,
    nodeHealth: [],
    scores: {
      performance: 0,
      reliability: 0,
      scalability: 0,
      costEfficiency: 0,
      maintainability: 0,
      overallGrade: 'C',
    },
    recommendations: [],
    createdAt: '',
    ...over,
  };
}

describe('providerScenarios', () => {
  it('builds one scenario per provider sharing the same graph/traffic', () => {
    const scenarios = providerScenarios(graph, traffic, providers);
    expect(scenarios).toHaveLength(2);
    expect(scenarios.map((s) => s.provider)).toEqual(['aws', 'gcp']);
    expect(scenarios[0].label).toBe('AWS');
    expect(scenarios[0].graph).toBe(graph);
    expect(scenarios[1].traffic).toBe(traffic);
  });
});

describe('isWinner / winTally', () => {
  const cmp: Comparison = {
    scenarios: [
      { label: 'AWS', provider: 'aws', result: result({ monthlyCostUsd: 200 }) },
      { label: 'GCP', provider: 'gcp', result: result({ monthlyCostUsd: 180 }) },
    ],
    winners: { cost: 1, latency: 0, capacity: 0, overall: 1 },
  };

  it('reports the winning scenario per metric', () => {
    expect(isWinner(cmp, 'cost', 1)).toBe(true);
    expect(isWinner(cmp, 'cost', 0)).toBe(false);
    expect(isWinner(cmp, 'latency', 0)).toBe(true);
  });

  it('tallies wins per scenario index across all metric rows', () => {
    const tally = winTally(cmp);
    expect(tally).toHaveLength(2);
    // cost+overall -> index 1 (2 wins); latency+capacity -> index 0 (2 wins).
    expect(tally[0]).toBe(2);
    expect(tally[1]).toBe(2);
    // metrics not present in winners contribute to neither.
    const total = tally.reduce((a, b) => a + b, 0);
    const present = metricRows.filter((r) => cmp.winners[r.key] != null).length;
    expect(total).toBe(present);
  });
});
