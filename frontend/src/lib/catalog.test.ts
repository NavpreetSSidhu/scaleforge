import { describe, expect, it } from 'vitest';
import { Boxes, Database, Server } from 'lucide-react';
import { categoryStyle, groupCatalog, iconFor } from './catalog';
import type { NodeDefinition } from '@/types/domain';

const def = (type: string, category: string, group: string): NodeDefinition => ({
  type,
  category,
  group,
  label: type,
  description: '',
  baseLatencyMs: 1,
  perInstanceCapacityRps: 100,
  unitMonthlyCostUsd: 10,
  defaultConfig: { cpu: 1, memory: 1, replicas: 1, autoscaling: false },
});

describe('categoryStyle', () => {
  it('returns the configured style for a known category', () => {
    expect(categoryStyle('compute')).toEqual({ accent: '#2fd39e', label: 'Compute' });
  });

  it('falls back to a neutral style for unknown categories', () => {
    expect(categoryStyle('mystery')).toEqual({ accent: '#aeb2bd', label: 'mystery' });
  });
});

describe('iconFor', () => {
  it('prefers the per-type icon', () => {
    expect(iconFor('sql_primary', 'database')).toBe(Database);
  });

  it('falls back to the category icon when the type is unknown', () => {
    expect(iconFor('unknown_type', 'compute')).toBe(Server);
  });

  it('falls back to a generic box when neither is known', () => {
    expect(iconFor('unknown_type', 'unknown_category')).toBe(Boxes);
  });
});

describe('groupCatalog', () => {
  it('groups definitions by their group and orders them per the design', () => {
    const grouped = groupCatalog([
      def('monitoring', 'observability', 'Observability'),
      def('api_service', 'compute', 'Compute'),
      def('cdn_edge', 'edge', 'Edge & Network'),
      def('worker_pool', 'compute', 'Compute'),
    ]);

    expect(grouped.map(([group]) => group)).toEqual([
      'Edge & Network',
      'Compute',
      'Observability',
    ]);
    // Compute collects both of its members.
    expect(grouped.find(([g]) => g === 'Compute')?.[1]).toHaveLength(2);
  });
});
