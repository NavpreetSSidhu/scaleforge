import { useArchitectureStore } from '@/store/architectureStore';
import type { AssistantAction, NodeDefinition } from '@/types/domain';

export interface ApplyOutcome {
  applied: number;
  skipped: number;
}

/**
 * Apply a batch of assistant actions to the architecture graph.
 *
 * The assistant references nodes it creates by a *proposed* id (e.g. "cache-1");
 * the store generates real ids on addNode, so we capture each new id (addNode
 * sets selectedNodeId) and remap proposed ids to real ones, letting edges in the
 * same batch connect to freshly-added nodes. Actions are applied in two passes —
 * all addNodes first — so later edges/config can resolve those nodes.
 */
export function applyAssistantActions(
  actions: AssistantAction[],
  catalog: NodeDefinition[],
): ApplyOutcome {
  const store = useArchitectureStore.getState();
  const idMap = new Map<string, string>(); // proposed id -> real id
  const resolve = (id?: string) => (id && idMap.get(id)) || id || '';

  let applied = 0;
  let skipped = 0;

  // Pass 1: create nodes so edges/config can reference them.
  for (const a of actions) {
    if (a.op !== 'addNode') continue;
    const def = catalog.find((d) => d.type === a.nodeType);
    if (!def) {
      skipped++;
      continue;
    }
    store.addNode(def);
    const realId = useArchitectureStore.getState().selectedNodeId;
    if (!realId) {
      skipped++;
      continue;
    }
    if (a.nodeId) idMap.set(a.nodeId, realId);
    if (a.label) store.updateNodeLabel(realId, a.label);
    if (a.config) store.updateNodeConfig(realId, a.config);
    applied++;
  }

  // Pass 2: edges, config updates, and removals against the now-current graph.
  for (const a of actions) {
    switch (a.op) {
      case 'addNode':
        break; // handled in pass 1
      case 'updateConfig': {
        const id = resolve(a.nodeId);
        if (a.config && nodeExists(id)) {
          store.updateNodeConfig(id, a.config);
          applied++;
        } else {
          skipped++;
        }
        break;
      }
      case 'removeNode': {
        const id = resolve(a.nodeId);
        if (nodeExists(id)) {
          store.removeNode(id);
          applied++;
        } else {
          skipped++;
        }
        break;
      }
      case 'addEdge': {
        const source = resolve(a.source);
        const target = resolve(a.target);
        if (nodeExists(source) && nodeExists(target)) {
          store.addEdge(source, target);
          applied++;
        } else {
          skipped++;
        }
        break;
      }
      case 'removeEdge': {
        const source = resolve(a.source);
        const target = resolve(a.target);
        const edge = useArchitectureStore
          .getState()
          .edges.find((e) => e.source === source && e.target === target);
        if (edge) {
          store.removeEdge(edge.id);
          applied++;
        } else {
          skipped++;
        }
        break;
      }
      default:
        skipped++;
    }
  }

  return { applied, skipped };
}

function nodeExists(id: string): boolean {
  if (!id) return false;
  return useArchitectureStore.getState().nodes.some((n) => n.id === id);
}
