import type { GraphNode, NodeConfig } from '@/types/domain';

/** Compact node constructor for authoring course design graphs. */
export const node = (
  id: string,
  type: string,
  label: string,
  x: number,
  y: number,
  config: NodeConfig,
): GraphNode => ({ id, type, label, position: { x, y }, config });

/** Compact node config with sensible defaults for a single region. */
export const cfg = (
  cpu: number,
  memory: number,
  replicas: number,
  autoscaling: boolean,
  region = 'us-east-1',
): NodeConfig => ({ cpu, memory, replicas, autoscaling, region });
