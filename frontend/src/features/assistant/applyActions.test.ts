import { beforeEach, describe, expect, it } from 'vitest';
import { applyAssistantActions } from '@/features/assistant/applyActions';
import { useArchitectureStore } from '@/store/architectureStore';
import type { AssistantAction, GraphNode, NodeDefinition } from '@/types/domain';

const defaultConfig = { cpu: 2, memory: 4, replicas: 2, autoscaling: true, region: 'us-east-1' };

const catalog: NodeDefinition[] = [
  {
    type: 'api_service',
    category: 'compute',
    group: 'Compute',
    label: 'API Service',
    description: '',
    baseLatencyMs: 15,
    perInstanceCapacityRps: 3000,
    unitMonthlyCostUsd: 40,
    defaultConfig,
  },
  {
    type: 'redis_cache',
    category: 'cache',
    group: 'Data Stores',
    label: 'Redis Cache',
    description: '',
    baseLatencyMs: 1,
    perInstanceCapacityRps: 100000,
    unitMonthlyCostUsd: 20,
    defaultConfig,
  },
];

function seedSingleNode(): GraphNode {
  const node: GraphNode = {
    id: 'api-1',
    type: 'api_service',
    label: 'API',
    position: { x: 0, y: 0 },
    config: { ...defaultConfig },
  };
  useArchitectureStore.setState({ nodes: [node], edges: [], selectedNodeId: null });
  return node;
}

describe('applyAssistantActions', () => {
  beforeEach(() => {
    useArchitectureStore.getState().clearCanvas();
  });

  it('adds a node and connects it via a proposed id', () => {
    seedSingleNode();
    const actions: AssistantAction[] = [
      { op: 'addNode', nodeType: 'redis_cache', nodeId: 'cache-1', label: 'Cache' },
      { op: 'addEdge', source: 'api-1', target: 'cache-1' },
    ];

    const { applied, skipped } = applyAssistantActions(actions, catalog);

    expect(applied).toBe(2);
    expect(skipped).toBe(0);

    const state = useArchitectureStore.getState();
    expect(state.nodes).toHaveLength(2);
    const cache = state.nodes.find((n) => n.type === 'redis_cache');
    expect(cache?.label).toBe('Cache');
    // The edge resolved the proposed id to the real generated node id.
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0].source).toBe('api-1');
    expect(state.edges[0].target).toBe(cache?.id);
  });

  it('updates an existing node config', () => {
    seedSingleNode();
    const { applied } = applyAssistantActions(
      [{ op: 'updateConfig', nodeId: 'api-1', config: { replicas: 8 } }],
      catalog,
    );
    expect(applied).toBe(1);
    expect(useArchitectureStore.getState().nodes[0].config.replicas).toBe(8);
  });

  it('skips unknown node types and dangling edges', () => {
    seedSingleNode();
    const actions: AssistantAction[] = [
      { op: 'addNode', nodeType: 'not_real', nodeId: 'x' },
      { op: 'addEdge', source: 'api-1', target: 'ghost' },
    ];
    const { applied, skipped } = applyAssistantActions(actions, catalog);
    expect(applied).toBe(0);
    expect(skipped).toBe(2);
    expect(useArchitectureStore.getState().nodes).toHaveLength(1);
    expect(useArchitectureStore.getState().edges).toHaveLength(0);
  });
});
