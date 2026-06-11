import { describe, expect, it } from 'vitest';
import { isWinner, metricRows, providerScenarios, runtimeScenarios, winTally } from '@/lib/compare';
import type {
  Comparison,
  Graph,
  PricingProvider,
  Runtime,
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

describe('runtimeScenarios', () => {
  const mixedGraph: Graph = {
    nodes: [
      { id: 'api', type: 'api_service', label: 'API', position: { x: 0, y: 0 }, config: { cpu: 2, memory: 4, replicas: 2, autoscaling: true } },
      { id: 'db', type: 'sql_primary', label: 'DB', position: { x: 0, y: 0 }, config: { cpu: 4, memory: 8, replicas: 1, autoscaling: false } },
    ],
    edges: [{ id: 'e', source: 'api', target: 'db' }],
  };
  const runtimes: Runtime[] = [
    { id: 'go', label: 'Go', throughputFactor: 1, latencyFactor: 1, memoryFactor: 1 },
    { id: 'rust', label: 'Rust', throughputFactor: 1.75, latencyFactor: 0.8, memoryFactor: 0.55 },
  ];
  const computeTypes = new Set(['api_service']);

  it('builds one scenario per runtime, stamping only compute nodes', () => {
    const scenarios = runtimeScenarios(mixedGraph, traffic, 'aws', runtimes, computeTypes);
    expect(scenarios.map((s) => s.label)).toEqual(['Go', 'Rust']);
    expect(scenarios.every((s) => s.provider === 'aws')).toBe(true);

    const rust = scenarios[1];
    const api = rust.graph.nodes.find((n) => n.id === 'api');
    const db = rust.graph.nodes.find((n) => n.id === 'db');
    expect(api?.config.runtime).toBe('rust'); // compute node stamped
    expect(db?.config.runtime).toBeUndefined(); // managed node left untouched
  });

  it('does not mutate the source graph', () => {
    runtimeScenarios(mixedGraph, traffic, 'aws', runtimes, computeTypes);
    expect(mixedGraph.nodes[0].config.runtime).toBeUndefined();
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
