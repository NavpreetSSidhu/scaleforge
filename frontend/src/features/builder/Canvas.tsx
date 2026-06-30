import { useCallback, useEffect, useMemo, type DragEvent } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { MousePointerClick } from 'lucide-react';
import { api } from '@/lib/api';
import { categoryStyle } from '@/lib/catalog';
import { useArchitectureStore } from '@/store/architectureStore';
import { useChaosStore } from '@/store/chaosStore';
import { useLiveSimStore } from '@/store/liveSimStore';
import { regionAccent, regionOf } from '@/lib/regions';
import type { GraphNode } from '@/types/domain';
import InfrastructureNode, { type InfrastructureNodeData } from './InfrastructureNode';
import RegionNode, { type RegionNodeData } from './RegionNode';
import TrafficEdge, { type TrafficEdgeData } from './TrafficEdge';

const nodeTypes = { infrastructure: InfrastructureNode, region: RegionNode };
const edgeTypes = { traffic: TrafficEdge };

// Approximate rendered size of an infrastructure node, used to size region boxes.
const NODE_W = 184;
const NODE_H = 76;

/** Build background container nodes, one per region that holds at least one node. */
function buildRegionNodes(storeNodes: GraphNode[]): Node<RegionNodeData>[] {
  const groups = new Map<string, GraphNode[]>();
  for (const n of storeNodes) {
    const region = regionOf(n.config.region);
    const list = groups.get(region) ?? [];
    list.push(n);
    groups.set(region, list);
  }

  const pad = 38;
  const padTop = 46;
  const result: Node<RegionNodeData>[] = [];
  for (const [region, members] of groups) {
    const minX = Math.min(...members.map((m) => m.position.x));
    const minY = Math.min(...members.map((m) => m.position.y));
    const maxX = Math.max(...members.map((m) => m.position.x + NODE_W));
    const maxY = Math.max(...members.map((m) => m.position.y + NODE_H));
    result.push({
      id: `region:${region}`,
      type: 'region',
      position: { x: minX - pad, y: minY - padTop },
      data: { region, accent: regionAccent(region), count: members.length },
      style: { width: maxX - minX + pad * 2, height: maxY - minY + padTop + pad },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      zIndex: 0,
    });
  }
  return result;
}

export function Canvas() {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    setNodes,
    addNode,
    addEdge,
    removeEdge,
    removeNode,
    selectNode,
    loadDemo,
    simulationResult,
  } = useArchitectureStore();

  const { screenToFlowPosition } = useReactFlow();

  const { mode: chaosMode, result: chaosResult, toggleKill } = useChaosStore();
  const liveMode = useLiveSimStore((s) => s.mode);
  const liveTick = useLiveSimStore((s) => s.latest);

  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
  });

  const categoryByType = useMemo(() => {
    const map = new Map<string, string>();
    catalog?.forEach((d) => map.set(d.type, d.category));
    return map;
  }, [catalog]);

  // Per-node view state (health ring, load glow, dead flag). In Chaos mode this
  // comes from the degraded chaos result; otherwise from the normal simulation.
  // Computed once here and read by both the node sync and the edge memo.
  const nodeView = useMemo(() => {
    type View = {
      status: InfrastructureNodeData['healthStatus'];
      utilization?: number;
      dead?: boolean;
      queueDepth?: number;
    };
    const map = new Map<string, View>();

    // Live Mode wins when active: derive each node's state from the latest
    // streamed discrete-event tick (queue depth + busy-server utilization).
    if (liveMode && liveTick) {
      for (const st of liveTick.stations) {
        const status: View['status'] =
          st.tripped || st.utilization >= 1
            ? 'bottleneck'
            : st.utilization >= 0.75
              ? 'warning'
              : 'healthy';
        map.set(st.nodeId, { status, utilization: st.utilization, queueDepth: st.queueLen });
      }
      return map;
    }

    if (chaosMode && chaosResult) {
      const incoming = chaosResult.degraded.incomingRps;
      const capacity = new Map(chaosResult.degraded.nodeHealth.map((h) => [h.nodeId, h.capacity]));
      for (const impact of chaosResult.nodeImpacts) {
        const cap = capacity.get(impact.nodeId);
        map.set(impact.nodeId, {
          dead: impact.status === 'dead',
          status:
            impact.status === 'overloaded'
              ? 'bottleneck'
              : impact.status === 'degraded'
                ? 'warning'
                : impact.status === 'healthy'
                  ? 'healthy'
                  : undefined,
          utilization: cap && cap > 0 ? incoming / cap : undefined,
        });
      }
      return map;
    }

    if (simulationResult) {
      const incoming = simulationResult.incomingRps;
      simulationResult.nodeHealth.forEach((h) =>
        map.set(h.nodeId, {
          status: h.status,
          utilization: h.capacity > 0 ? incoming / h.capacity : undefined,
        }),
      );
    }
    return map;
  }, [liveMode, liveTick, chaosMode, chaosResult, simulationResult]);

  // React Flow owns node view-state (incl. measured dimensions); the store is the
  // source of truth for structure/config. We sync store -> view here.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<
    InfrastructureNodeData | RegionNodeData
  >([]);

  // A signature of everything the view needs to reflect; re-sync only when it changes.
  const syncSig = useMemo(
    () =>
      storeNodes
        .map((n) => {
          const v = nodeView.get(n.id);
          return `${n.id}@${n.position.x},${n.position.y}:${n.label}:${n.config.cpu}/${n.config.replicas}:${
            v?.status ?? ''
          }:${v?.utilization?.toFixed(2) ?? ''}:${v?.queueDepth ?? ''}:${v?.dead ? 'x' : ''}:${
            categoryByType.get(n.type) ?? ''
          }:${regionOf(n.config.region)}`;
        })
        .join('|'),
    [storeNodes, nodeView, categoryByType],
  );

  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((p) => [p.id, p]));
      const infra = storeNodes.map<Node<InfrastructureNodeData>>((sn) => {
        const existing = prevById.get(sn.id);
        return {
          id: sn.id,
          type: 'infrastructure',
          position: sn.position,
          // preserve measured dimensions + selection so nodes stay visible
          ...(existing?.width ? { width: existing.width, height: existing.height } : {}),
          selected: existing?.selected ?? false,
          zIndex: 1,
          data: {
            ...sn,
            category: categoryByType.get(sn.type) ?? 'compute',
            healthStatus: nodeView.get(sn.id)?.status,
            utilization: nodeView.get(sn.id)?.utilization,
            queueDepth: nodeView.get(sn.id)?.queueDepth,
            dead: nodeView.get(sn.id)?.dead,
          },
        };
      });
      // Region containers render behind the infra nodes.
      return [...buildRegionNodes(storeNodes), ...infra];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSig]);

  const active = liveMode ? !!liveTick : chaosMode ? !!chaosResult : !!simulationResult;
  const flowEdges: Edge<TrafficEdgeData>[] = useMemo(
    () =>
      storeEdges.map((edge) => {
        const targetCat = categoryByType.get(
          storeNodes.find((n) => n.id === edge.target)?.type ?? '',
        );
        const accent = targetCat ? categoryStyle(targetCat).accent : '#2fd39e';
        const targetView = nodeView.get(edge.target);
        const overloaded = targetView?.status === 'bottleneck';
        const dead = nodeView.get(edge.source)?.dead === true || targetView?.dead === true;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'traffic',
          data: { accent, active, overloaded, load: targetView?.utilization, dead },
        };
      }),
    [storeEdges, storeNodes, categoryByType, nodeView, active],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      changes.forEach((c) => c.type === 'remove' && removeEdge(c.id));
    },
    [removeEdge],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) addEdge(c.source, c.target);
    },
    [addEdge],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      setNodes(
        storeNodes.map((sn) => (sn.id === node.id ? { ...sn, position: node.position } : sn)),
      );
    },
    [setNodes, storeNodes],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => deleted.forEach((n) => removeNode(n.id)),
    [removeNode],
  );

  const onSelectionChange = useCallback(
    ({ nodes }: { nodes: Node[] }) => selectNode(nodes[0]?.id ?? null),
    [selectNode],
  );

  // In Chaos mode a node click toggles a kill instead of just selecting it.
  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (chaosMode && node.type === 'infrastructure') toggleKill(node.id);
    },
    [chaosMode, toggleKill],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Drop a component dragged from the library at the cursor's canvas position.
  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/scaleforge-node');
      const def = catalog?.find((d) => d.type === type);
      if (!def) return;
      const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(def, { x: point.x - NODE_W / 2, y: point.y - NODE_H / 2 });
    },
    [catalog, screenToFlowPosition, addNode],
  );

  return (
    <div className="relative h-full w-full overflow-hidden" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={rfNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onNodeClick={onNodeClick}
        onSelectionChange={onSelectionChange}
        onEdgeClick={(_, edge) => removeEdge(edge.id)}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
        className="bg-base"
      >
        <Background variant={BackgroundVariant.Dots} color="#232936" gap={22} size={1.5} />
        <Controls
          className="overflow-hidden rounded-lg border border-white/[0.06] !shadow-panel"
          showInteractive={false}
        />
        <MiniMap
          className="!bottom-3 !right-3 overflow-hidden !rounded-lg border border-white/[0.06] !bg-surface-panel"
          maskColor="rgba(8,9,12,0.82)"
          nodeColor={(n) => {
            const d = n.data as Partial<InfrastructureNodeData & RegionNodeData>;
            if (d?.accent) return d.accent;
            return categoryStyle(d?.category ?? 'compute').accent;
          }}
          pannable
          zoomable
        />
      </ReactFlow>

      {storeNodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <MousePointerClick className="h-8 w-8 text-ink-ghost" />
          <p className="text-sm text-ink-faint">
            Add components from the library to start designing
          </p>
          <p className="text-xs text-ink-ghost">drag a component in (or double-click) · pull handles to connect</p>
          <button type="button" onClick={loadDemo} className="btn-ghost mt-1">
            Load demo architecture
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.06] bg-surface-panel/80 px-3 py-1 text-[11px] text-ink-faint backdrop-blur">
        drag or double-click to add · pull to connect · click an edge to delete
      </div>
    </div>
  );
}
