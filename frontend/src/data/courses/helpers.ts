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

/**
 * Wrap a snippet in a Python markdown code fence for an LLD lesson body. Built
 * with plain string concatenation so the embedded code stays fence-free.
 */
export const py = (code: string): string => '\n\n```python\n' + code.trim() + '\n```\n';

/** A neutral config for abstract LLD diagram nodes (compute numbers are unused). */
export const lld = (): NodeConfig => cfg(1, 1, 1, false);
