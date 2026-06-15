import { create } from 'zustand';
import type {
  Course,
  CourseDifficulty,
  CourseDraft,
  CourseKind,
  CourseStep,
  GraphEdge,
  GraphNode,
  NodeConfig,
} from '@/types/domain';

/** A neutral config for abstract LLD nodes / a starting point for infra nodes. */
const neutralConfig: NodeConfig = {
  cpu: 1,
  memory: 1,
  replicas: 1,
  autoscaling: false,
  region: 'us-east-1',
};

interface CourseEditorState {
  // Draft document
  editingId: string | null;
  title: string;
  summary: string;
  difficulty: CourseDifficulty;
  category: string;
  kind: CourseKind;
  nodes: GraphNode[];
  edges: GraphEdge[];
  steps: CourseStep[];
  solution: { language: string; code: string } | null;
  // Editor UI
  selectedStepIndex: number;
  selectedNodeId: string | null;

  // Lifecycle
  reset: () => void;
  loadFromCourse: (course: Course) => void;
  loadFromDraft: (draft: CourseDraft) => void;

  // Metadata
  setMeta: (patch: Partial<Pick<CourseEditorState, 'title' | 'summary' | 'category' | 'difficulty'>>) => void;
  setKind: (kind: CourseKind) => void;
  setSolution: (patch: Partial<{ language: string; code: string }>) => void;

  // Graph
  addNode: (input: { type: string; label: string; config?: NodeConfig }, position?: { x: number; y: number }) => void;
  moveNode: (id: string, position: { x: number; y: number }) => void;
  updateNodeLabel: (id: string, label: string) => void;
  removeNode: (id: string) => void;
  addEdge: (source: string, target: string) => void;
  removeEdge: (id: string) => void;
  selectNode: (id: string | null) => void;

  // Steps
  setSelectedStep: (index: number) => void;
  addStep: () => void;
  removeStep: (index: number) => void;
  updateStep: (index: number, patch: Partial<CourseStep>) => void;
  toggleReveal: (index: number, kind: 'node' | 'edge', id: string) => void;
  setFocus: (index: number, nodeId: string) => void;

  // Derived
  toDraft: () => CourseDraft;
  toPreviewCourse: () => Course;
}

let seq = 0;
const nextNodeId = (type: string) => `${type}-${Date.now().toString(36)}-${seq++}`;
const nextStepId = () => `step-${Date.now().toString(36)}-${seq++}`;

const emptyState = {
  editingId: null as string | null,
  title: '',
  summary: '',
  difficulty: 'Beginner' as CourseDifficulty,
  category: '',
  kind: 'system-design' as CourseKind,
  nodes: [] as GraphNode[],
  edges: [] as GraphEdge[],
  steps: [
    {
      id: nextStepId(),
      title: 'Step 1',
      body: '',
      revealNodeIds: [],
      revealEdgeIds: [],
    },
  ] as CourseStep[],
  solution: null as { language: string; code: string } | null,
  selectedStepIndex: 0,
  selectedNodeId: null as string | null,
};

/**
 * Working state for the course editor — a fully editable draft Course kept
 * separate from the builder's architectureStore so authoring never disturbs the
 * user's real canvas. Steps reference graph nodes/edges by id (cumulative
 * reveal), exactly like the built-in courses, so the live preview and the real
 * player render identically.
 */
export const useCourseEditorStore = create<CourseEditorState>((set, get) => ({
  ...emptyState,

  reset: () =>
    set({
      ...emptyState,
      steps: [
        { id: nextStepId(), title: 'Step 1', body: '', revealNodeIds: [], revealEdgeIds: [] },
      ],
    }),

  loadFromCourse: (course) =>
    set({
      editingId: course.id ?? null,
      title: course.title,
      summary: course.summary,
      difficulty: course.difficulty,
      category: course.category,
      kind: course.kind ?? 'system-design',
      nodes: course.graph.nodes.map((n) => ({ ...n, config: { ...n.config } })),
      edges: course.graph.edges.map((e) => ({ ...e })),
      steps: course.steps.map((s) => ({
        ...s,
        revealNodeIds: [...s.revealNodeIds],
        revealEdgeIds: [...s.revealEdgeIds],
      })),
      solution: course.solution ? { ...course.solution } : null,
      selectedStepIndex: 0,
      selectedNodeId: null,
    }),

  loadFromDraft: (draft) =>
    set({
      editingId: null,
      title: draft.title,
      summary: draft.summary,
      difficulty: draft.difficulty,
      category: draft.category,
      kind: draft.kind,
      nodes: draft.graph.nodes.map((n) => ({ ...n, config: { ...n.config } })),
      edges: draft.graph.edges.map((e) => ({ ...e })),
      steps: draft.steps.map((s) => ({
        ...s,
        revealNodeIds: [...s.revealNodeIds],
        revealEdgeIds: [...s.revealEdgeIds],
      })),
      solution: draft.solution ? { ...draft.solution } : null,
      selectedStepIndex: 0,
      selectedNodeId: null,
    }),

  setMeta: (patch) => set(patch),
  setKind: (kind) => set({ kind }),
  setSolution: (patch) =>
    set((s) => ({ solution: { language: 'python', code: '', ...s.solution, ...patch } })),

  addNode: (input, position) =>
    set((state) => {
      const count = state.nodes.length;
      const node: GraphNode = {
        id: nextNodeId(input.type),
        type: input.type,
        label: input.label,
        position: position ?? { x: 80 + (count % 3) * 240, y: 60 + Math.floor(count / 3) * 170 },
        config: input.config ? { ...input.config } : { ...neutralConfig },
      };
      return { nodes: [...state.nodes, node], selectedNodeId: node.id };
    }),

  moveNode: (id, position) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
    })),

  updateNodeLabel: (id, label) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, label } : n)),
    })),

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      // Drop the removed node (and its now-dead edges) from every step's reveal sets.
      steps: state.steps.map((step) => ({
        ...step,
        revealNodeIds: step.revealNodeIds.filter((n) => n !== id),
        revealEdgeIds: step.revealEdgeIds.filter((eid) => {
          const edge = state.edges.find((e) => e.id === eid);
          return edge ? edge.source !== id && edge.target !== id : false;
        }),
        focusNodeId: step.focusNodeId === id ? undefined : step.focusNodeId,
      })),
    })),

  addEdge: (source, target) =>
    set((state) => {
      if (source === target) return state;
      if (state.edges.some((e) => e.source === source && e.target === target)) return state;
      return { edges: [...state.edges, { id: `e-${source}-${target}-${seq++}`, source, target }] };
    }),

  removeEdge: (id) =>
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
      steps: state.steps.map((step) => ({
        ...step,
        revealEdgeIds: step.revealEdgeIds.filter((eid) => eid !== id),
      })),
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  setSelectedStep: (index) => set({ selectedStepIndex: index }),

  addStep: () =>
    set((state) => {
      const steps = [
        ...state.steps,
        {
          id: nextStepId(),
          title: `Step ${state.steps.length + 1}`,
          body: '',
          // New steps inherit the previous step's reveal set (cumulative build-up).
          revealNodeIds: [...(state.steps[state.steps.length - 1]?.revealNodeIds ?? [])],
          revealEdgeIds: [...(state.steps[state.steps.length - 1]?.revealEdgeIds ?? [])],
        },
      ];
      return { steps, selectedStepIndex: steps.length - 1 };
    }),

  removeStep: (index) =>
    set((state) => {
      if (state.steps.length <= 1) return state;
      const steps = state.steps.filter((_, i) => i !== index);
      return {
        steps,
        selectedStepIndex: Math.max(0, Math.min(state.selectedStepIndex, steps.length - 1)),
      };
    }),

  updateStep: (index, patch) =>
    set((state) => ({
      steps: state.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    })),

  toggleReveal: (index, kind, id) =>
    set((state) => ({
      steps: state.steps.map((s, i) => {
        if (i !== index) return s;
        const key = kind === 'node' ? 'revealNodeIds' : 'revealEdgeIds';
        const list = s[key];
        const has = list.includes(id);
        const next = has ? list.filter((x) => x !== id) : [...list, id];
        // Un-revealing the focused node clears the focus.
        const focusNodeId =
          kind === 'node' && has && s.focusNodeId === id ? undefined : s.focusNodeId;
        return { ...s, [key]: next, focusNodeId };
      }),
    })),

  setFocus: (index, nodeId) =>
    set((state) => ({
      steps: state.steps.map((s, i) => {
        if (i !== index) return s;
        // Toggle off if re-selecting the same focus; ensure the node is revealed.
        const focusNodeId = s.focusNodeId === nodeId ? undefined : nodeId;
        const revealNodeIds =
          focusNodeId && !s.revealNodeIds.includes(nodeId)
            ? [...s.revealNodeIds, nodeId]
            : s.revealNodeIds;
        return { ...s, focusNodeId, revealNodeIds };
      }),
    })),

  toDraft: () => {
    const s = get();
    return {
      title: s.title.trim(),
      summary: s.summary.trim(),
      difficulty: s.difficulty,
      category: s.category.trim(),
      kind: s.kind,
      graph: { nodes: s.nodes, edges: s.edges },
      steps: s.steps,
      solution: s.kind === 'lld' && s.solution && s.solution.code.trim() ? s.solution : undefined,
    };
  },

  toPreviewCourse: () => {
    const s = get();
    return {
      slug: 'preview',
      title: s.title || 'Untitled course',
      summary: s.summary,
      difficulty: s.difficulty,
      category: s.category,
      kind: s.kind,
      graph: { nodes: s.nodes, edges: s.edges },
      steps: s.steps,
      solution: s.solution ?? undefined,
    };
  },
}));
