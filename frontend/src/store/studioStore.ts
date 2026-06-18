import { create } from 'zustand';
import type { AgentEdge, AgentGraph, AgentNode, AgentNodeConfig, RunEvent } from '@/types/agentflow';

let seq = 0;
/** Short unique id for new nodes/edges (stable within a session). */
export function genId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/** A starter RAG agent so the canvas is never empty on first open. */
function defaultGraph(): AgentGraph {
  const nodes: AgentNode[] = [
    { id: 'in', type: 'input', label: 'User Query', position: { x: 40, y: 160 }, config: {} },
    {
      id: 'ret',
      type: 'retriever',
      label: 'Knowledge Base',
      position: { x: 280, y: 160 },
      config: { indexType: 'hnsw', quantization: 'none', topK: 5, dim: 768, corpusSize: 50000 },
    },
    {
      id: 'gen',
      type: 'llm',
      label: 'Answer',
      position: { x: 540, y: 160 },
      config: {
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        maxTokens: 1024,
        prompt: 'You are a helpful assistant. Answer the question using the provided context.',
      },
    },
    { id: 'out', type: 'output', label: 'Reply', position: { x: 800, y: 160 }, config: {} },
  ];
  const edges: AgentEdge[] = [
    { id: 'e1', source: 'in', target: 'ret' },
    { id: 'e2', source: 'ret', target: 'gen' },
    { id: 'e3', source: 'gen', target: 'out' },
  ];
  return { nodes, edges };
}

interface StudioState {
  workflowId: string | null;
  name: string;
  description: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
  selectedNodeId: string | null;
  /** Query fed to the live dry-run. */
  input: string;
  /** Per-node status during a live run, used by the canvas glow. */
  runStatus: Record<string, 'running' | 'done' | 'error'>;
  /** Live-run state, driven by the top-level Run button (see [[useStudioRun]])
   *  and surfaced in the run-output strip below the canvas. */
  running: boolean;
  runEvents: RunEvent[];
  runFinal: string;
  runError: string;

  setNodeStatus: (id: string, status: 'running' | 'done' | 'error') => void;
  clearRunStatus: () => void;
  /** Reset run output and mark a run as started. */
  beginRun: () => void;
  pushRunEvent: (ev: RunEvent) => void;
  setRunFinal: (output: string) => void;
  setRunError: (error: string) => void;
  setRunning: (running: boolean) => void;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setInput: (input: string) => void;
  selectNode: (id: string | null) => void;

  addNode: (kind: { type: string; label: string; config?: AgentNodeConfig }, pos: { x: number; y: number }) => void;
  moveNode: (id: string, pos: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  updateNodeConfig: (id: string, patch: Partial<AgentNodeConfig>) => void;
  setNodeLabel: (id: string, label: string) => void;
  addEdge: (source: string, target: string) => void;
  removeEdge: (id: string) => void;

  graph: () => AgentGraph;
  /** Replace the whole workflow (loading a saved/generated one). */
  load: (wf: { id?: string; name: string; description?: string; graph: AgentGraph }) => void;
  reset: () => void;
}

/**
 * Editable agentic-workflow graph for Agent Studio. Kept entirely separate from
 * the infrastructure architectureStore (like chaosStore / courseEditorStore) so
 * the two builders never interfere.
 */
export const useStudioStore = create<StudioState>((set, get) => ({
  workflowId: null,
  name: 'RAG Agent',
  description: 'Retrieval-augmented answering over a knowledge base.',
  ...defaultGraph(),
  selectedNodeId: null,
  input: 'How does adding a cache improve a system?',
  runStatus: {},
  running: false,
  runEvents: [],
  runFinal: '',
  runError: '',

  setNodeStatus: (id, status) => set((s) => ({ runStatus: { ...s.runStatus, [id]: status } })),
  clearRunStatus: () => set({ runStatus: {} }),
  beginRun: () => set({ running: true, runEvents: [], runFinal: '', runError: '', runStatus: {} }),
  pushRunEvent: (ev) => set((s) => ({ runEvents: [...s.runEvents, ev] })),
  setRunFinal: (runFinal) => set({ runFinal }),
  setRunError: (runError) => set({ runError }),
  setRunning: (running) => set({ running }),
  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),
  setInput: (input) => set({ input }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),

  addNode: (kind, pos) =>
    set((s) => {
      const id = genId('n');
      const node: AgentNode = {
        id,
        type: kind.type,
        label: kind.label,
        position: pos,
        config: { ...(kind.config ?? {}) },
      };
      return { nodes: [...s.nodes, node], selectedNodeId: id };
    }),

  moveNode: (id, position) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)) })),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    })),

  updateNodeConfig: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, ...patch } } : n)),
    })),

  setNodeLabel: (id, label) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, label } : n)) })),

  addEdge: (source, target) =>
    set((s) => {
      if (source === target) return s;
      if (s.edges.some((e) => e.source === source && e.target === target)) return s;
      return { edges: [...s.edges, { id: genId('e'), source, target }] };
    }),

  removeEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

  graph: () => ({ nodes: get().nodes, edges: get().edges }),

  load: (wf) =>
    set({
      workflowId: wf.id ?? null,
      name: wf.name,
      description: wf.description ?? '',
      nodes: wf.graph.nodes,
      edges: wf.graph.edges,
      selectedNodeId: null,
    }),

  reset: () =>
    set({
      workflowId: null,
      name: 'Untitled Workflow',
      description: '',
      nodes: [],
      edges: [],
      selectedNodeId: null,
    }),
}));
