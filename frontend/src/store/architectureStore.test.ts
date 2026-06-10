import { beforeEach, describe, expect, it } from 'vitest';
import { useArchitectureStore } from './architectureStore';
import type { GraphNode } from '@/types/domain';

const sampleNode = (id: string): GraphNode => ({
  id,
  type: 'go_service',
  label: 'Go API',
  position: { x: 0, y: 0 },
  config: { cpu: 2, memory: 4, replicas: 1, autoscaling: false },
});

describe('architectureStore', () => {
  beforeEach(() => {
    useArchitectureStore.setState({
      name: 'Untitled Architecture',
      nodes: [],
      edges: [],
      selectedNodeId: null,
      simulationResult: null,
    });
  });

  it('adds and exposes nodes through toGraph', () => {
    const { setNodes, setEdges, toGraph } = useArchitectureStore.getState();
    setNodes([sampleNode('a')]);
    setEdges([{ id: 'e1', source: 'a', target: 'b' }]);

    const graph = toGraph();
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes[0].id).toBe('a');
  });

  it('merges partial node config updates without dropping other fields', () => {
    useArchitectureStore.getState().setNodes([sampleNode('a')]);

    useArchitectureStore.getState().updateNodeConfig('a', { replicas: 5 });

    const node = useArchitectureStore.getState().nodes[0];
    expect(node.config.replicas).toBe(5);
    expect(node.config.cpu).toBe(2); // unchanged
    expect(node.config.memory).toBe(4); // unchanged
  });

  it('updates a node label by id only', () => {
    useArchitectureStore.getState().setNodes([sampleNode('a'), sampleNode('b')]);

    useArchitectureStore.getState().updateNodeLabel('b', 'Renamed');

    const nodes = useArchitectureStore.getState().nodes;
    expect(nodes.find((n) => n.id === 'b')?.label).toBe('Renamed');
    expect(nodes.find((n) => n.id === 'a')?.label).toBe('Go API');
  });

  it('merges partial traffic updates', () => {
    useArchitectureStore.getState().setTraffic({ concurrentUsers: 9000 });

    const traffic = useArchitectureStore.getState().traffic;
    expect(traffic.concurrentUsers).toBe(9000);
    expect(traffic.requestsPerUserMin).toBe(2); // default preserved
  });

  it('loads the blended reference demo architecture and resets dirty state', () => {
    useArchitectureStore.getState().loadDemo();

    const state = useArchitectureStore.getState();
    expect(state.name).toBe('Blended Reference Architecture');
    expect(state.nodes).toHaveLength(9);
    expect(state.edges).toHaveLength(8);
    expect(state.nodes.some((n) => n.type === 'sql_primary')).toBe(true);
    expect(state.traffic.concurrentUsers).toBe(5000);
    expect(state.dirty).toBe(false);
  });
});
