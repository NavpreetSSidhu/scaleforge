export interface NodeConfig {
  cpu: number;
  memory: number;
  replicas: number;
  autoscaling: boolean;
  region?: string;
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

export interface SimulationResult {
  id: string;
  architectureId?: string;
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
  graph: Graph;
  traffic: TrafficProfile;
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
