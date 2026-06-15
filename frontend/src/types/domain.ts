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

/** A node's state under an injected chaos failure. */
export type NodeImpactStatus = 'dead' | 'overloaded' | 'degraded' | 'healthy';

export interface NodeImpact {
  nodeId: string;
  status: NodeImpactStatus;
}

/** A node whose removal alone causes a full outage. */
export interface Spof {
  nodeId: string;
  label: string;
  impact: string;
}

export interface ChaosScenario {
  killedNodeIds: string[];
  outageRegion?: string;
  spikeMultiplier?: number;
}

export interface ChaosRequest {
  graph: Graph;
  traffic: TrafficProfile;
  provider?: string;
  scenario: ChaosScenario;
}

export interface ChaosResult {
  baseline: SimulationResult;
  degraded: SimulationResult;
  available: boolean;
  /** 0..1 — served / incoming RPS. */
  availability: number;
  servedRps: number;
  failedRps: number;
  /** 0..100, scenario-independent resilience of the architecture as designed. */
  resilienceScore: number;
  spofs: Spof[];
  nodeImpacts: NodeImpact[];
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

// --- Learn module (courses + AI Teacher / Q&A) ---

/**
 * One step of an authored course. Carries the explanation text plus the
 * animation choreography: which nodes/edges are visible by this step (build-up
 * reveal), which node to spotlight (pan/zoom + glow), and an optional callout.
 */
export interface CourseStep {
  id: string;
  title: string;
  /** Markdown explanation shown in the lesson panel. */
  body: string;
  /** Cumulative set of node ids visible once this step is reached. */
  revealNodeIds: string[];
  /** Cumulative set of edge ids visible once this step is reached. */
  revealEdgeIds: string[];
  /** Node id to pan/zoom to and highlight for this step. */
  focusNodeId?: string;
  /** Short callout bubble shown beside the focused node. */
  callout?: string;
}

export type CourseDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type CourseKind = 'system-design' | 'lld';

/** An authored, pre-built course: one design graph revealed step by step. */
export interface Course {
  /** DB id for user-created courses; absent on the static built-ins. */
  id?: string;
  /** True for user-created courses — distinguishes them in the merged catalog. */
  isCustom?: boolean;
  slug: string;
  title: string;
  summary: string;
  difficulty: CourseDifficulty;
  category: string;
  /**
   * Course flavour. 'system-design' (default) courses teach an infra graph and
   * can be loaded onto the builder canvas. 'lld' (low-level design) courses
   * teach a class/data-structure diagram + code, and expose a copyable solution.
   */
  kind?: 'system-design' | 'lld';
  /** The full architecture the course teaches; steps reveal subsets of it. */
  graph: Graph;
  steps: CourseStep[];
  /** Full reference implementation for LLD courses (read & copy). */
  solution?: { language: string; code: string };
}

/** One turn of tutor conversation sent back as context. */
export interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Request to the Teacher persona — elaborates on the current step. */
export interface TutorExplainRequest {
  courseTitle: string;
  stepTitle: string;
  stepBody: string;
  focusComponent?: string;
  question?: string;
  history?: TutorMessage[];
}

/** Request to the separate Q&A agent — freeform questions. */
export interface TutorAskRequest {
  courseTitle?: string;
  question: string;
  history?: TutorMessage[];
}

export interface TutorReply {
  reply: string;
}

export interface CourseProgress {
  courseSlug: string;
  completedSteps: number[];
  completed: boolean;
  updatedAt?: string;
}

/**
 * The editable payload for creating/updating a user course, and the shape the
 * AI generator returns (sans persistence envelope). Mirrors the backend
 * CourseInput / generated draft.
 */
export interface CourseDraft {
  title: string;
  summary: string;
  difficulty: CourseDifficulty;
  category: string;
  kind: CourseKind;
  graph: Graph;
  steps: CourseStep[];
  solution?: { language: string; code: string };
}

/** Request body for AI course generation (POST /courses/generate). */
export interface GenerateCourseRequest {
  prompt: string;
  kind: CourseKind;
  difficulty: CourseDifficulty;
}
