import { create } from 'zustand';
import type {
  Architecture,
  GraphEdge,
  GraphNode,
  NodeConfig,
  NodeDefinition,
  SimulationResult,
  TrafficProfile,
} from '@/types/domain';
import { demoGraph, demoTraffic } from '@/data/demoScenario';

export type ScoreView = 'cards' | 'gauges' | 'radar';
export type AppView = 'dashboard' | 'builder' | 'mobile' | 'compare';

export const DEFAULT_REGION = 'us-east-1';
export const DEFAULT_PROVIDER = 'aws';

interface ArchitectureState {
  // Document
  id: string | null;
  name: string;
  environment: string;
  provider: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  traffic: TrafficProfile;
  regions: string[];
  // UI
  view: AppView;
  selectedNodeId: string | null;
  scoreView: ScoreView;
  libraryOpen: boolean;
  inspectorOpen: boolean;
  libraryCollapsed: boolean;
  inspectorCollapsed: boolean;
  focusMode: boolean;
  reportOpen: boolean;
  simulationResult: SimulationResult | null;
  dirty: boolean;
  // Document actions
  setName: (name: string) => void;
  setEnvironment: (environment: string) => void;
  setProvider: (provider: string) => void;
  setNodes: (nodes: GraphNode[]) => void;
  setEdges: (edges: GraphEdge[]) => void;
  addNode: (def: NodeDefinition, position?: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  addEdge: (source: string, target: string) => void;
  removeEdge: (edgeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  updateNodeConfig: (nodeId: string, config: Partial<NodeConfig>) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;
  setTraffic: (traffic: Partial<TrafficProfile>) => void;
  setNodeRegion: (nodeId: string, region: string) => void;
  addRegion: (region: string) => void;
  clearCanvas: () => void;
  loadDemo: () => void;
  loadArchitecture: (arch: Architecture) => void;
  newArchitecture: () => void;
  markSaved: (id: string) => void;
  // UI actions
  setView: (view: AppView) => void;
  setScoreView: (view: ScoreView) => void;
  setLibraryOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setReportOpen: (open: boolean) => void;
  toggleLibraryCollapsed: () => void;
  toggleInspectorCollapsed: () => void;
  toggleFocusMode: () => void;
  setSimulationResult: (result: SimulationResult | null) => void;
  // Derived
  toGraph: () => { nodes: GraphNode[]; edges: GraphEdge[] };
}

const defaultTraffic: TrafficProfile = {
  dailyActiveUsers: 50000,
  monthlyActiveUsers: 150000,
  concurrentUsers: 5000,
  requestsPerUserMin: 2,
  peakTrafficMultiplier: 1.5,
};

let nodeSeq = 0;
const nextId = (type: string) => `${type}-${Date.now().toString(36)}-${nodeSeq++}`;

/** Persist a handful of layout preferences across reloads. */
const LAYOUT_KEY = 'scaleforge:layout';
type LayoutPrefs = {
  libraryCollapsed: boolean;
  inspectorCollapsed: boolean;
  focusMode: boolean;
  provider: string;
};
const defaultLayout: LayoutPrefs = {
  libraryCollapsed: false,
  inspectorCollapsed: false,
  focusMode: false,
  provider: DEFAULT_PROVIDER,
};

function loadLayout(): LayoutPrefs {
  if (typeof window === 'undefined') return defaultLayout;
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    return raw ? { ...defaultLayout, ...JSON.parse(raw) } : defaultLayout;
  } catch {
    return defaultLayout;
  }
}

function saveLayout(prefs: LayoutPrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

const initialLayout = loadLayout();

const prefsFrom = (s: {
  libraryCollapsed: boolean;
  inspectorCollapsed: boolean;
  focusMode: boolean;
  provider: string;
}): LayoutPrefs => ({
  libraryCollapsed: s.libraryCollapsed,
  inspectorCollapsed: s.inspectorCollapsed,
  focusMode: s.focusMode,
  provider: s.provider,
});

/** Distinct regions present on the nodes, always including the default + any extras. */
function deriveRegions(nodes: GraphNode[], extra: string[] = []): string[] {
  const set = new Set<string>([DEFAULT_REGION, ...extra]);
  for (const n of nodes) {
    if (n.config.region) set.add(n.config.region);
  }
  return [...set];
}

export const useArchitectureStore = create<ArchitectureState>((set, get) => ({
  id: null,
  name: 'Untitled Architecture',
  environment: 'Production',
  provider: initialLayout.provider,
  nodes: [],
  edges: [],
  traffic: defaultTraffic,
  regions: [DEFAULT_REGION],
  view: 'builder',
  selectedNodeId: null,
  scoreView: 'cards',
  libraryOpen: false,
  inspectorOpen: false,
  libraryCollapsed: initialLayout.libraryCollapsed,
  inspectorCollapsed: initialLayout.inspectorCollapsed,
  focusMode: initialLayout.focusMode,
  reportOpen: false,
  simulationResult: null,
  dirty: false,

  setName: (name) => set({ name, dirty: true }),
  setEnvironment: (environment) => set({ environment }),
  setProvider: (provider) =>
    set((state) => {
      saveLayout({ ...prefsFrom(state), provider });
      return { provider };
    }),
  setNodes: (nodes) =>
    set((state) => ({ nodes, regions: deriveRegions(nodes, state.regions), dirty: true })),
  setEdges: (edges) => set({ edges, dirty: true }),

  addNode: (def, position) =>
    set((state) => {
      const count = state.nodes.length;
      const node: GraphNode = {
        id: nextId(def.type),
        type: def.type,
        label: def.label,
        position:
          position ?? { x: 120 + (count % 4) * 200, y: 80 + Math.floor(count / 4) * 150 },
        config: { ...def.defaultConfig },
      };
      const nodes = [...state.nodes, node];
      return {
        nodes,
        regions: deriveRegions(nodes, state.regions),
        selectedNodeId: node.id,
        dirty: true,
      };
    }),

  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      dirty: true,
    })),

  addEdge: (source, target) =>
    set((state) => {
      if (source === target) return state;
      const exists = state.edges.some((e) => e.source === source && e.target === target);
      if (exists) return state;
      return {
        edges: [...state.edges, { id: `e-${source}-${target}-${nodeSeq++}`, source, target }],
        dirty: true,
      };
    }),

  removeEdge: (edgeId) =>
    set((state) => ({ edges: state.edges.filter((e) => e.id !== edgeId), dirty: true })),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  updateNodeConfig: (nodeId, config) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, config: { ...node.config, ...config } } : node,
      ),
      dirty: true,
    })),

  updateNodeLabel: (nodeId, label) =>
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, label } : node)),
      dirty: true,
    })),

  setTraffic: (traffic) =>
    set((state) => ({ traffic: { ...state.traffic, ...traffic }, dirty: true })),

  setNodeRegion: (nodeId, region) =>
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === nodeId ? { ...node, config: { ...node.config, region } } : node,
      );
      return { nodes, regions: deriveRegions(nodes, state.regions), dirty: true };
    }),

  addRegion: (region) =>
    set((state) => {
      const name = region.trim();
      if (!name || state.regions.includes(name)) return state;
      return { regions: [...state.regions, name] };
    }),

  clearCanvas: () =>
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      simulationResult: null,
      regions: [DEFAULT_REGION],
      dirty: true,
    }),

  loadDemo: () => {
    const nodes = demoGraph.nodes.map((n) => ({ ...n, config: { ...n.config } }));
    set({
      id: null,
      name: 'Blended Reference Architecture',
      nodes,
      edges: demoGraph.edges.map((e) => ({ ...e })),
      traffic: { ...demoTraffic },
      regions: deriveRegions(nodes),
      selectedNodeId: null,
      simulationResult: null,
      dirty: false,
    });
  },

  loadArchitecture: (arch) => {
    const nodes = arch.graph.nodes.map((n) => ({ ...n, config: { ...n.config } }));
    set({
      id: arch.id,
      name: arch.name,
      nodes,
      edges: arch.graph.edges.map((e) => ({ ...e })),
      traffic: { ...arch.traffic },
      regions: deriveRegions(nodes),
      selectedNodeId: null,
      simulationResult: null,
      view: 'builder',
      dirty: false,
    });
  },

  newArchitecture: () =>
    set({
      id: null,
      name: 'Untitled Architecture',
      nodes: [],
      edges: [],
      traffic: defaultTraffic,
      regions: [DEFAULT_REGION],
      selectedNodeId: null,
      simulationResult: null,
      view: 'builder',
      dirty: false,
    }),

  markSaved: (id) => set({ id, dirty: false }),

  setView: (view) => set({ view }),
  setScoreView: (scoreView) => set({ scoreView }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setReportOpen: (reportOpen) => set({ reportOpen }),

  toggleLibraryCollapsed: () =>
    set((state) => {
      const libraryCollapsed = !state.libraryCollapsed;
      saveLayout({ ...prefsFrom(state), libraryCollapsed });
      return { libraryCollapsed };
    }),

  toggleInspectorCollapsed: () =>
    set((state) => {
      const inspectorCollapsed = !state.inspectorCollapsed;
      saveLayout({ ...prefsFrom(state), inspectorCollapsed });
      return { inspectorCollapsed };
    }),

  toggleFocusMode: () =>
    set((state) => {
      const focusMode = !state.focusMode;
      saveLayout({ ...prefsFrom(state), focusMode });
      return { focusMode };
    }),

  setSimulationResult: (simulationResult) => set({ simulationResult }),

  toGraph: () => ({ nodes: get().nodes, edges: get().edges }),
}));
