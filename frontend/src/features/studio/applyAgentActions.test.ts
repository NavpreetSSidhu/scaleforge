import { beforeEach, describe, expect, it } from 'vitest';
import { applyAgentActions } from '@/features/studio/applyAgentActions';
import { useStudioStore } from '@/store/studioStore';
import type { AgentChatAction, AgentNodeKind } from '@/types/agentflow';

const baseKind = {
  group: 'x',
  description: '',
  baseLatencyMs: 0,
  latencyJitter: 0,
  meanTokensIn: 0,
  meanTokensOut: 0,
  costPer1kTokensUsd: 0,
  fixedCostUsd: 0,
};

const catalog: AgentNodeKind[] = [
  { ...baseKind, type: 'retriever', label: 'Vector Retriever', defaultConfig: { indexType: 'hnsw', topK: 5, dim: 768 } },
  { ...baseKind, type: 'tool', label: 'Tool', defaultConfig: { toolName: 'search_web' } },
];

/** Reset to the seeded default RAG workflow (in, ret, gen, out). */
function reset() {
  useStudioStore.setState(useStudioStore.getInitialState(), true);
}

describe('applyAgentActions', () => {
  beforeEach(reset);

  it('adds a node and connects it via a proposed id', () => {
    const actions: AgentChatAction[] = [
      { op: 'addNode', nodeType: 'tool', nodeId: 'esc', label: 'Escalate' },
      { op: 'addEdge', source: 'gen', target: 'esc' },
    ];

    const { applied, skipped } = applyAgentActions(actions, catalog);

    expect(applied).toBe(2);
    expect(skipped).toBe(0);

    const state = useStudioStore.getState();
    const tool = state.nodes.find((n) => n.type === 'tool');
    expect(tool?.label).toBe('Escalate');
    // The edge resolved the proposed id to the real generated node id.
    const edge = state.edges.find((e) => e.source === 'gen' && e.target === tool?.id);
    expect(edge).toBeTruthy();
  });

  it('merges catalog defaults with the proposed config on addNode', () => {
    applyAgentActions([{ op: 'addNode', nodeType: 'retriever', nodeId: 'r', config: { topK: 12 } }], catalog);
    const added = useStudioStore.getState().nodes.find((n) => n.type === 'retriever' && n.config.topK === 12);
    expect(added).toBeTruthy();
    // Untouched default fields come from the catalog.
    expect(added?.config.indexType).toBe('hnsw');
  });

  it('updates config and renames via setLabel on existing nodes', () => {
    const out = applyAgentActions(
      [
        { op: 'updateConfig', nodeId: 'gen', config: { temperature: 0.9 } },
        { op: 'setLabel', nodeId: 'gen', label: 'Generator' },
      ],
      catalog,
    );
    expect(out.applied).toBe(2);
    const gen = useStudioStore.getState().nodes.find((n) => n.id === 'gen');
    expect(gen?.config.temperature).toBe(0.9);
    expect(gen?.label).toBe('Generator');
  });

  it('skips unknown node types and dangling references', () => {
    const before = useStudioStore.getState().nodes.length;
    const actions: AgentChatAction[] = [
      { op: 'addNode', nodeType: 'sorcery', nodeId: 'x' },
      { op: 'addEdge', source: 'gen', target: 'ghost' },
      { op: 'updateConfig', nodeId: 'ghost', config: { topK: 3 } },
    ];
    const { applied, skipped } = applyAgentActions(actions, catalog);
    expect(applied).toBe(0);
    expect(skipped).toBe(3);
    expect(useStudioStore.getState().nodes).toHaveLength(before);
  });
});
