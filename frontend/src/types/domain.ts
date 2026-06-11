export interface NodeConfig {
  cpu: number;
  memory: number;
  replicas: number;
  autoscaling: boolean;
  region?: string;
  /** Language/runtime for compute components (e.g. "go", "rust"). */
  runtime?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  position: Position;
  config: NodeConfig;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TrafficProfile {
  dailyActiveUsers: number;
  monthlyActiveUsers: number;
  concurrentUsers: number;
  requestsPerUserMin: number;
  peakTrafficMultiplier: number;
}

export interface NodeDefinition {
  type: string;
  category: string;
  group: string;
  label: string;
  description: string;
  baseLatencyMs: number;
  perInstanceCapacityRps: number;
  unitMonthlyCostUsd: number;
  defaultConfig: NodeConfig;
}

export interface Bottleneck {
  nodeId: string;
  nodeType: string;
  label: string;
  capacity: number;
  incoming: number;
}

export interface NodeHealth {
  nodeId: string;
  nodeType: string;
  label: string;
  capacity: number;
  status: 'healthy' | 'bottleneck' | 'warning';
}

export interface Scores {
  performance: number;
  reliability: number;
  scalability: number;
  costEfficiency: number;
  maintainability: number;
  overallGrade: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** lucide icon name (PascalCase mapped on the client). */
  icon: string;
  hint: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface PricingRegion {
  id: string;
  label: string;
  multiplier: number;
}

export interface PricingProvider {
  id: string;
  label: string;
  defaultRegion: string;
  categoryMultipliers: Record<string, number>;
  regions: PricingRegion[];
  /** Catalog component type -> this provider's managed-service name. */
  services: Record<string, string>;
}

export interface SimulationResult {
  id: string;
  architectureId?: string;
  /** Cloud provider these costs were priced against (e.g. "aws"). */
  provider?: string;
  estimatedRps: number;
  incomingRps: number;
  estimatedLatencyMs: number;
  systemCapacityRps: number;
  monthlyCostUsd: number;
  bottleneck?: Bottleneck;
  nodeHealth: NodeHealth[];
  scores: Scores;
  recommendations: string[];
  createdAt: string;
  /** Achievements unlocked by this run (for the celebration toast). */
  newAchievements?: Achievement[];
}

export interface SimulateRequest {
  architectureId?: string;
  name?: string;
  /** Cloud provider to price against; defaults to AWS server-side when omitted. */
  provider?: string;
  graph: Graph;
  traffic: TrafficProfile;
}

export interface CompareScenario {
  label: string;
  provider?: string;
  graph: Graph;
  traffic: TrafficProfile;
}

export interface CompareRequest {
  scenarios: CompareScenario[];
}

export interface ScenarioResult {
  label: string;
  provider?: string;
  result: SimulationResult;
}

/** Metric keys reported in Comparison.winners (mapped to a winning scenario index). */
export type CompareMetric =
  | 'cost'
  | 'latency'
  | 'capacity'
  | 'performance'
  | 'reliability'
  | 'scalability'
  | 'costEfficiency'
  | 'maintainability'
  | 'overall';

export interface Comparison {
  scenarios: ScenarioResult[];
  winners: Partial<Record<CompareMetric, number>>;
}

export interface Architecture {
  id: string;
  userId: string;
  name: string;
  graph: Graph;
  traffic: TrafficProfile;
  createdAt: string;
  updatedAt: string;
}

/** A language/runtime and its performance multipliers, relative to Go (= 1.0). */
export interface Runtime {
  id: string;
  label: string;
  throughputFactor: number;
  latencyFactor: number;
  memoryFactor: number;
}

export interface RuntimeCatalog {
  runtimes: Runtime[];
  defaultRuntimeId: string;
  provenance: string;
}

// --- AI assistant ---

export type AssistantOp =
  | 'addNode'
  | 'removeNode'
  | 'addEdge'
  | 'removeEdge'
  | 'updateConfig';

/** One proposed graph mutation from the assistant, previewed before it applies. */
export interface AssistantAction {
  op: AssistantOp;
  nodeType?: string;
  nodeId?: string;
  label?: string;
  source?: string;
  target?: string;
  config?: Partial<NodeConfig>;
  rationale?: string;
}

export interface AssistantResponse {
  reply: string;
  actions: AssistantAction[];
}

/** One turn of assistant conversation sent back as context. */
export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantRequest {
  message: string;
  graph: Graph;
  traffic: TrafficProfile;
  provider?: string;
  result?: SimulationResult | null;
  history?: AssistantMessage[];
}
