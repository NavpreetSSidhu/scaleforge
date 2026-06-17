// Types mirroring the Go `internal/agentflow` package (and its sim/vector/export/
// runtime sub-packages). Kept separate from domain.ts because the agentic
// workflow graph is a distinct shape from the infrastructure graph.

export interface AgentNodeConfig {
  // llm / router
  model?: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  // retriever
  indexType?: 'flat' | 'ivf' | 'hnsw';
  quantization?: 'none' | 'scalar' | 'product';
  topK?: number;
  dim?: number;
  corpusSize?: number;
  // tool
  toolName?: string;
  toolSchema?: string;
  // router
  condition?: string;
  // loop
  maxIterations?: number;
}

export interface AgentNodeKind {
  type: string;
  label: string;
  group: string;
  description: string;
  baseLatencyMs: number;
  latencyJitter: number;
  meanTokensIn: number;
  meanTokensOut: number;
  costPer1kTokensUsd: number;
  fixedCostUsd: number;
  defaultConfig: AgentNodeConfig;
}

export interface AgentNode {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  config: AgentNodeConfig;
}

export interface AgentEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface AgentGraph {
  nodes: AgentNode[];
  edges: AgentEdge[];
}

export interface Workflow {
  id: string;
  userId: string;
  slug: string;
  name: string;
  description: string;
  graph: AgentGraph;
  createdAt: string;
  updatedAt: string;
}

export interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
}

export interface SimNodeStat {
  nodeId: string;
  type: string;
  label: string;
  meanLatencyMs: number;
  meanTokensIn: number;
  meanTokensOut: number;
  meanCostUsd: number;
  share: number;
}

export interface SimResult {
  trials: number;
  latencyMs: Percentiles;
  costUsd: Percentiles;
  meanTokensIn: number;
  meanTokensOut: number;
  perNode: SimNodeStat[];
  criticalPath: string[];
  bottleneck: string;
}

export interface VectorVariant {
  name: string;
  indexType: string;
  quantization: string;
  recallAtK: number;
  queryP50Ms: number;
  queryP95Ms: number;
  memoryBytes: number;
  memoryMB: number;
  buildMs: number;
}

export interface VectorBenchResult {
  corpusSize: number;
  dim: number;
  k: number;
  queries: number;
  variants: VectorVariant[];
}

export type ExportTarget = 'langgraph' | 'langchain' | 'go' | 'portable';

export interface ExportFile {
  name: string;
  language: string;
  content: string;
}

export interface ExportBundle {
  files: ExportFile[];
}

export type RunEventType = 'node_start' | 'node_finish' | 'route' | 'error' | 'done';

export interface RunEvent {
  type: RunEventType;
  nodeId?: string;
  nodeType?: string;
  label?: string;
  output?: string;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  branch?: string;
  error?: string;
}
