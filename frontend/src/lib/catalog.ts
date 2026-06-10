import {
  Bell,
  Binary,
  Boxes,
  Brain,
  BrainCircuit,
  Cloud,
  Container,
  Cpu,
  Database,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Leaf,
  LineChart,
  Lock,
  Megaphone,
  Network,
  Radio,
  Route,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { NodeDefinition } from '@/types/domain';

/**
 * Presentation metadata for a semantic category: the accent colour used for
 * node borders/glyphs and the tint used for soft backgrounds. Kept in the
 * frontend so the backend stays purely about simulation semantics.
 */
export interface CategoryStyle {
  accent: string; // hex
  label: string;
}

export const categoryStyles: Record<string, CategoryStyle> = {
  edge: { accent: '#4aa3ff', label: 'Edge' },
  compute: { accent: '#2fd39e', label: 'Compute' },
  database: { accent: '#7c74ff', label: 'Data' },
  cache: { accent: '#f47bd0', label: 'Cache' },
  storage: { accent: '#aeb2bd', label: 'Storage' },
  messaging: { accent: '#f5b14b', label: 'Messaging' },
  security: { accent: '#ff8f6b', label: 'Security' },
  observability: { accent: '#8fd14f', label: 'Observability' },
};

export function categoryStyle(category: string): CategoryStyle {
  return categoryStyles[category] ?? { accent: '#aeb2bd', label: category };
}

/** Per-type icon. Falls back to a category icon, then a generic box. */
const typeIcons: Record<string, LucideIcon> = {
  dns: Route,
  cdn_edge: Globe,
  load_balancer: Network,
  api_gateway: Workflow,
  websocket_gateway: Webhook,
  api_service: Server,
  microservice: Boxes,
  grpc_service: Binary,
  auth_service: KeyRound,
  payment_service: ShieldCheck,
  search_service: Search,
  worker_pool: Cpu,
  serverless_fn: Zap,
  container_orchestrator: Container,
  inference_service: BrainCircuit,
  llm_provider: Sparkles,
  notification_service: Bell,
  sql_primary: Database,
  read_replica: GitBranch,
  document_db: Leaf,
  vector_db: Brain,
  timeseries_db: LineChart,
  redis_cache: Layers,
  object_storage: HardDrive,
  olap_store: Database,
  message_queue: Radio,
  event_stream: Radio,
  pubsub: Megaphone,
  waf: ShieldAlert,
  secrets_manager: Lock,
  monitoring: Gauge,
};

const categoryIcons: Record<string, LucideIcon> = {
  edge: Cloud,
  compute: Server,
  database: Database,
  cache: Layers,
  storage: HardDrive,
  messaging: Radio,
  security: ShieldAlert,
  observability: Gauge,
};

export function iconFor(type: string, category: string): LucideIcon {
  return typeIcons[type] ?? categoryIcons[category] ?? Boxes;
}

/** Sidebar group ordering, matching the product design. */
export const groupOrder = [
  'Edge & Network',
  'Compute',
  'Data Stores',
  'Messaging',
  'Security',
  'Observability',
];

export function groupCatalog(nodes: NodeDefinition[]): [string, NodeDefinition[]][] {
  const grouped = new Map<string, NodeDefinition[]>();
  for (const node of nodes) {
    const list = grouped.get(node.group) ?? [];
    list.push(node);
    grouped.set(node.group, list);
  }
  return [...grouped.entries()].sort(
    (a, b) => groupOrder.indexOf(a[0]) - groupOrder.indexOf(b[0]),
  );
}
