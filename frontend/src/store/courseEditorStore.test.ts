import { beforeEach, describe, expect, it } from 'vitest';
import { useCourseEditorStore } from './courseEditorStore';

const s = () => useCourseEditorStore.getState();

describe('courseEditorStore', () => {
  beforeEach(() => s().reset());

  it('adds nodes and a connecting edge', () => {
    s().addNode({ type: 'api_service', label: 'API' });
    s().addNode({ type: 'redis_cache', label: 'Cache' });
    const [a, b] = s().nodes;
    s().addEdge(a.id, b.id);
    expect(s().nodes).toHaveLength(2);
    expect(s().edges).toHaveLength(1);
    expect(s().edges[0]).toMatchObject({ source: a.id, target: b.id });
  });

  it('new steps inherit the previous reveal set (cumulative build-up)', () => {
    s().addNode({ type: 'api_service', label: 'API' });
    const id = s().nodes[0].id;
    s().toggleReveal(0, 'node', id);
    s().addStep();
    expect(s().steps[1].revealNodeIds).toContain(id);
  });

  it('focusing a node reveals it and toggles off on re-select', () => {
    s().addNode({ type: 'api_service', label: 'API' });
    const id = s().nodes[0].id;
    s().setFocus(0, id);
    expect(s().steps[0].focusNodeId).toBe(id);
    expect(s().steps[0].revealNodeIds).toContain(id);
    s().setFocus(0, id);
    expect(s().steps[0].focusNodeId).toBeUndefined();
  });

  it('removing a node purges it from every step reveal/focus set', () => {
    s().addNode({ type: 'api_service', label: 'API' });
    s().addNode({ type: 'redis_cache', label: 'Cache' });
    const [a, b] = s().nodes;
    s().addEdge(a.id, b.id);
    const edgeId = s().edges[0].id;
    s().toggleReveal(0, 'node', a.id);
    s().toggleReveal(0, 'node', b.id);
    s().toggleReveal(0, 'edge', edgeId);
    s().setFocus(0, a.id);

    s().removeNode(a.id);

    const step = s().steps[0];
    expect(step.revealNodeIds).not.toContain(a.id);
    expect(step.revealEdgeIds).not.toContain(edgeId); // dead edge dropped too
    expect(step.focusNodeId).toBeUndefined();
    expect(s().edges).toHaveLength(0);
  });

  it('toDraft assembles a graph + steps payload and omits empty LLD solution', () => {
    s().setMeta({ title: '  My Course  ', category: 'X' });
    s().addNode({ type: 'api_service', label: 'API' });
    const draft = s().toDraft();
    expect(draft.title).toBe('My Course');
    expect(draft.graph.nodes).toHaveLength(1);
    expect(draft.solution).toBeUndefined();
  });
});
