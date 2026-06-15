import { useCallback, useEffect, useMemo, type DragEvent } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlowProvider,
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
import { categoryStyle, lldCategoryFor } from '@/lib/catalog';
import { useCourseEditorStore } from '@/store/courseEditorStore';
import type { NodeConfig } from '@/types/domain';
import EditorNode, { type EditorNodeData } from './EditorNode';

/** Drag payload the palette writes for a draggable component. */
export interface CourseNodeDragPayload {
  type: string;
  label: string;
  config?: NodeConfig;
}

const nodeTypes = { editor: EditorNode };

/** Payload format dragged from the palette onto the canvas. */
export const COURSE_NODE_MIME = 'application/scaleforge-course-node';

const NODE_W = 170;
const NODE_H = 60;

function CanvasInner() {
  const { nodes, edges, selectedNodeId, addNode, moveNode, addEdge, removeEdge, removeNode, selectNode } =
    useCourseEditorStore();
  const { screenToFlowPosition } = useReactFlow();

  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
    staleTime: Infinity,
  });

  const categoryByType = useMemo(() => {
    const map = new Map<string, string>();
    catalog?.forEach((d) => map.set(d.type, d.category));
    return map;
  }, [catalog]);

  const categoryOf = useCallback(
    (type: string) => categoryByType.get(type) ?? lldCategoryFor(type) ?? 'compute',
    [categoryByType],
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<EditorNodeData>([]);

  // Re-sync the React Flow view whenever structure/labels/selection change. A
  // signature keeps this cheap; React Flow owns transient drag positions.
  const syncSig = useMemo(
    () =>
      nodes
        .map((n) => `${n.id}@${n.position.x},${n.position.y}:${n.label}:${categoryOf(n.type)}`)
        .join('|') + `#${selectedNodeId}`,
    [nodes, categoryOf, selectedNodeId],
  );

  useEffect(() => {
    setRfNodes(
      nodes.map((n) => ({
        id: n.id,
        type: 'editor',
        position: n.position,
        selected: n.id === selectedNodeId,
        data: { label: n.label, type: n.type, category: categoryOf(n.type) },
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
          style: { stroke: categoryStyle(categoryOf(targetType)).accent, strokeWidth: 1.5 },
        };
      }),
    [edges, nodes, categoryOf],
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
      const raw = e.dataTransfer.getData(COURSE_NODE_MIME);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as CourseNodeDragPayload;
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
          <MousePointerClick className="h-8 w-8 text-ink-ghost" />
          <p className="text-sm text-ink-faint">Drag components from the left to design your diagram</p>
          <p className="text-xs text-ink-ghost">pull handles to connect · click an edge to delete</p>
        </div>
      )}
    </div>
  );
}

/** Editable design canvas bound to the course editor store. */
export function CourseDesignCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
