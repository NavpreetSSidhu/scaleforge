import { useCallback, useEffect, useMemo, type DragEvent } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Workflow as WorkflowIcon } from 'lucide-react';
import { nodeStyle } from '@/lib/agentflow';
import { useStudioStore } from '@/store/studioStore';
import type { AgentNodeConfig } from '@/types/agentflow';
import AgentNode, { type AgentNodeData } from './AgentNode';

export const AGENT_NODE_MIME = 'application/scaleforge-agent-node';

export interface AgentNodeDragPayload {
  type: string;
  label: string;
  config?: AgentNodeConfig;
}

const nodeTypes = { agent: AgentNode };
const NODE_W = 160;
const NODE_H = 56;

function CanvasInner() {
  const {
    nodes,
    edges,
    selectedNodeId,
    runStatus,
    addNode,
    moveNode,
    addEdge,
    removeEdge,
    removeNode,
    selectNode,
  } = useStudioStore();
  const { screenToFlowPosition } = useReactFlow();

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<AgentNodeData>([]);

  const syncSig = useMemo(
    () =>
      nodes
        .map((n) => `${n.id}@${n.position.x},${n.position.y}:${n.label}:${n.type}:${runStatus[n.id] ?? ''}`)
        .join('|') + `#${selectedNodeId}`,
    [nodes, selectedNodeId, runStatus],
  );

  useEffect(() => {
    setRfNodes(
      nodes.map((n) => ({
        id: n.id,
        type: 'agent',
        position: n.position,
        selected: n.id === selectedNodeId,
        data: { label: n.label, type: n.type, status: runStatus[n.id] },
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSig]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const targetType = nodes.find((n) => n.id === e.target)?.type ?? '';
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: nodeStyle(targetType).accent },
          style: { stroke: nodeStyle(targetType).accent, strokeWidth: 1.5 },
          labelStyle: { fill: '#9aa4b2', fontSize: 11 },
        };
      }),
    [edges, nodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => changes.forEach((c) => c.type === 'remove' && removeEdge(c.id)),
    [removeEdge],
  );
  const onConnect = useCallback(
    (c: Connection) => c.source && c.target && addEdge(c.source, c.target),
    [addEdge],
  );
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => moveNode(node.id, node.position),
    [moveNode],
  );
  const onNodesDelete = useCallback(
    (deleted: Node[]) => deleted.forEach((n) => removeNode(n.id)),
    [removeNode],
  );
  const onSelectionChange = useCallback(
    ({ nodes: sel }: { nodes: Node[] }) => selectNode(sel[0]?.id ?? null),
    [selectNode],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData(AGENT_NODE_MIME);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as AgentNodeDragPayload;
        const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addNode(
          { type: payload.type, label: payload.label, config: payload.config },
          { x: point.x - NODE_W / 2, y: point.y - NODE_H / 2 },
        );
      } catch {
        /* ignore malformed drops */
      }
    },
    [screenToFlowPosition, addNode],
  );

  return (
    <div className="relative h-full w-full overflow-hidden" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
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
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <WorkflowIcon className="h-8 w-8 text-ink-ghost" />
          <p className="text-sm text-ink-faint">Drag steps from the left to design your agent</p>
          <p className="text-xs text-ink-ghost">pull handles to connect · click an edge to delete</p>
        </div>
      )}
    </div>
  );
}

/** Editable agentic-workflow canvas bound to the studio store. */
export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
