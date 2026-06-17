import { beforeEach, describe, expect, it } from 'vitest';
import { useStudioStore } from './studioStore';

function reset() {
  // Reload the default RAG graph by re-loading a fresh one.
  useStudioStore.setState(useStudioStore.getInitialState(), true);
}

describe('studioStore', () => {
  beforeEach(reset);

  it('seeds a default RAG workflow', () => {
    const s = useStudioStore.getState();
    expect(s.nodes).toHaveLength(4);
    expect(s.nodes.map((n) => n.type)).toEqual(['input', 'retriever', 'llm', 'output']);
    expect(s.edges).toHaveLength(3);
  });

  it('adds a node and selects it', () => {
    useStudioStore.getState().addNode({ type: 'tool', label: 'Search' }, { x: 10, y: 20 });
    const s = useStudioStore.getState();
    expect(s.nodes).toHaveLength(5);
    const added = s.nodes[s.nodes.length - 1];
    expect(added.type).toBe('tool');
    expect(s.selectedNodeId).toBe(added.id);
  });

  it('removing a node prunes its edges', () => {
    useStudioStore.getState().removeNode('ret');
    const s = useStudioStore.getState();
    expect(s.nodes.find((n) => n.id === 'ret')).toBeUndefined();
    // e1 (in->ret) and e2 (ret->gen) should be gone; e3 (gen->out) remains.
    expect(s.edges.map((e) => e.id).sort()).toEqual(['e3']);
  });

  it('does not add duplicate or self edges', () => {
    const before = useStudioStore.getState().edges.length;
    useStudioStore.getState().addEdge('in', 'ret'); // duplicate
    useStudioStore.getState().addEdge('gen', 'gen'); // self
    expect(useStudioStore.getState().edges).toHaveLength(before);
    useStudioStore.getState().addEdge('in', 'gen'); // new
    expect(useStudioStore.getState().edges).toHaveLength(before + 1);
  });

  it('updates node config immutably', () => {
    useStudioStore.getState().updateNodeConfig('gen', { temperature: 0.9 });
    expect(useStudioStore.getState().nodes.find((n) => n.id === 'gen')?.config.temperature).toBe(0.9);
  });

  it('tracks run status and clears it', () => {
    useStudioStore.getState().setNodeStatus('gen', 'running');
    expect(useStudioStore.getState().runStatus.gen).toBe('running');
    useStudioStore.getState().clearRunStatus();
    expect(useStudioStore.getState().runStatus).toEqual({});
  });

  it('loads a workflow, replacing the graph', () => {
    useStudioStore.getState().load({
      id: 'wf1',
      name: 'Loaded',
      graph: { nodes: [{ id: 'a', type: 'input', label: 'A', position: { x: 0, y: 0 }, config: {} }], edges: [] },
    });
    const s = useStudioStore.getState();
    expect(s.workflowId).toBe('wf1');
    expect(s.name).toBe('Loaded');
    expect(s.nodes).toHaveLength(1);
  });
});
