import type {
  CompareMetric,
  CompareScenario,
  Comparison,
  Graph,
  PricingProvider,
  Runtime,
  SimulationResult,
  TrafficProfile,
} from '@/types/domain';
import { compact, compactUsd } from '@/lib/format';

export interface MetricRow {
  key: CompareMetric;
  label: string;
  /** Whether a lower value is better (affects the explanatory arrow only). */
  lowerIsBetter: boolean;
  format: (r: SimulationResult) => string;
}

/** The metric rows rendered in the comparison matrix, top to bottom. */
export const metricRows: MetricRow[] = [
  { key: 'cost', label: 'Monthly cost', lowerIsBetter: true, format: (r) => compactUsd(r.monthlyCostUsd) },
  {
    key: 'latency',
    label: 'Latency (p50)',
    lowerIsBetter: true,
    format: (r) => `${Math.round(r.estimatedLatencyMs)}ms`,
  },
  {
    key: 'capacity',
    label: 'System capacity',
    lowerIsBetter: false,
    format: (r) => `${compact(r.systemCapacityRps)} rps`,
  },
  { key: 'performance', label: 'Performance', lowerIsBetter: false, format: (r) => String(r.scores.performance) },
  { key: 'reliability', label: 'Reliability', lowerIsBetter: false, format: (r) => String(r.scores.reliability) },
  { key: 'scalability', label: 'Scalability', lowerIsBetter: false, format: (r) => String(r.scores.scalability) },
  {
    key: 'costEfficiency',
    label: 'Cost efficiency',
    lowerIsBetter: false,
    format: (r) => String(r.scores.costEfficiency),
  },
  {
    key: 'maintainability',
    label: 'Maintainability',
    lowerIsBetter: false,
    format: (r) => String(r.scores.maintainability),
  },
  { key: 'overall', label: 'Overall grade', lowerIsBetter: false, format: (r) => r.scores.overallGrade },
];

/** True when `index` is the winning scenario for the given metric. */
export function isWinner(cmp: Comparison, key: CompareMetric, index: number): boolean {
  return cmp.winners[key] === index;
}

/**
 * Count how many metric rows each scenario wins. Index aligns with
 * cmp.scenarios; used to crown an overall "best" column.
 */
export function winTally(cmp: Comparison): number[] {
  const tally = cmp.scenarios.map(() => 0);
  for (const row of metricRows) {
    const idx = cmp.winners[row.key];
    if (idx != null && idx >= 0 && idx < tally.length) tally[idx] += 1;
  }
  return tally;
}

/** Build one comparison scenario per cloud provider from a single architecture. */
export function providerScenarios(
  graph: Graph,
  traffic: TrafficProfile,
  providers: PricingProvider[],
): CompareScenario[] {
  return providers.map((p) => ({ label: p.label, provider: p.id, graph, traffic }));
}

/**
 * Build one comparison scenario per language/runtime from a single architecture.
 * Only compute-category nodes (the code the user writes) get the runtime stamped;
 * managed components are left untouched, so the runtime is the only variable. The
 * cloud provider and traffic stay fixed across scenarios.
 */
export function runtimeScenarios(
  graph: Graph,
  traffic: TrafficProfile,
  provider: string,
  runtimes: Runtime[],
  computeTypes: Set<string>,
): CompareScenario[] {
  return runtimes.map((rt) => ({
    label: rt.label,
    provider,
    graph: {
      nodes: graph.nodes.map((n) =>
        computeTypes.has(n.type) ? { ...n, config: { ...n.config, runtime: rt.id } } : n,
      ),
      edges: graph.edges,
    },
    traffic,
  }));
}
