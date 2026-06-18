import { useStudioStore } from '@/store/studioStore';
import type { AgentChatAction, AgentNodeKind } from '@/types/agentflow';

export interface ApplyOutcome {
  applied: number;
  skipped: number;
}

/**
 * Apply a batch of Agent Studio assistant actions to the workflow graph — the
 * agentflow analog of [[applyAssistantActions]].
 *
 * The assistant references nodes it creates by a *proposed* id; the store
 * generates real ids on addNode (and sets selectedNodeId), so we capture each new
 * id and remap proposed ids to real ones, letting edges in the same batch connect
 * to freshly-added nodes. addNodes run first so later edges/config can resolve
 * them. New nodes are laid out to the right of the current graph so they don't
 * land on top of existing steps.
 */
export function applyAgentActions(
  actions: AgentChatAction[],
  catalog: AgentNodeKind[],
): ApplyOutcome {
  const store = useStudioStore.getState();
  const idMap = new Map<string, string>(); // proposed id -> real id
  const resolve = (id?: string) => (id && idMap.get(id)) || id || '';

  let applied = 0;
  let skipped = 0;

  // Place new nodes just right of the current rightmost node, stacked vertically.
  const rightX =
    store.nodes.reduce((max, n) => Math.max(max, n.position.x), 0) + 220;
  let placed = 0;
  const nextPosition = () => ({ x: rightX, y: 80 + placed++ * 120 });

  // Pass 1: create nodes so edges/config can reference them.
  for (const a of actions) {
    if (a.op !== 'addNode') continue;
    const def = catalog.find((d) => d.type === a.nodeType);
    if (!def) {
      skipped++;
      continue;
    }
    store.addNode(
      {
        type: def.type,
        label: a.label || def.label,
        config: { ...def.defaultConfig, ...(a.config ?? {}) },
      },
      nextPosition(),
    );
    const realId = useStudioStore.getState().selectedNodeId;
    if (!realId) {
      skipped++;
      continue;
    }
    if (a.nodeId) idMap.set(a.nodeId, realId);
    applied++;
  }

  // Pass 2: edges, config/label updates, and removals against the current graph.
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
      case 'setLabel': {
        const id = resolve(a.nodeId);
        if (a.label && nodeExists(id)) {
          store.setNodeLabel(id, a.label);
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
        const edge = useStudioStore
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
  return useStudioStore.getState().nodes.some((n) => n.id === id);
}
