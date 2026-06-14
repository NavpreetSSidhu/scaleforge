import { useEffect, useMemo } from 'react';
import { useReactFlow, type Edge, type Node } from 'reactflow';
import { categoryStyle } from '@/lib/catalog';
import type { Course } from '@/types/domain';
import type { LessonNodeData } from './LessonNode';

// Approximate rendered node size, used to center the spotlight camera.
const NODE_W = 180;
const NODE_H = 62;

/**
 * Computes the React Flow nodes/edges for the current lesson step (build-up
 * reveal) and drives the camera (spotlight pan/zoom). Must be called inside a
 * ReactFlowProvider.
 */
export function useStepAnimation(
  course: Course,
  stepIndex: number,
  categoryByType: Map<string, string>,
) {
  const { setCenter, fitView } = useReactFlow();
  const step = course.steps[stepIndex];

  const reveal = useMemo(() => new Set(step?.revealNodeIds ?? []), [step]);
  const revealEdges = useMemo(() => new Set(step?.revealEdgeIds ?? []), [step]);
  const focusId = step?.focusNodeId;

  const nodes = useMemo<Node<LessonNodeData>[]>(
    () =>
      course.graph.nodes
        .filter((n) => reveal.has(n.id))
        .map((n) => ({
          id: n.id,
          type: 'lesson',
          position: n.position,
          draggable: false,
          connectable: false,
          selectable: false,
          data: {
            ...n,
            category: categoryByType.get(n.type) ?? 'compute',
            focused: focusId === n.id,
            dimmed: !!focusId && focusId !== n.id,
            callout: focusId === n.id ? step?.callout : undefined,
          },
        })),
    [course.graph.nodes, reveal, focusId, step, categoryByType],
  );

  const edges = useMemo<Edge[]>(
    () =>
      course.graph.edges
        .filter((e) => revealEdges.has(e.id))
        .map((e) => {
          const targetType = course.graph.nodes.find((n) => n.id === e.target)?.type ?? '';
          const accent = categoryStyle(categoryByType.get(targetType) ?? 'compute').accent;
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            animated: true,
            style: { stroke: accent, strokeWidth: 1.5, opacity: 0.7 },
          };
        }),
    [course.graph.edges, course.graph.nodes, revealEdges, categoryByType],
  );

  // Drive the camera after the new nodes have a frame to mount.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const focus = focusId && course.graph.nodes.find((n) => n.id === focusId);
      if (focus) {
        setCenter(focus.position.x + NODE_W / 2, focus.position.y + NODE_H / 2, {
          zoom: 1.15,
          duration: 650,
        });
      } else {
        fitView({ duration: 650, padding: 0.25 });
      }
    }, 60);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, focusId]);

  return { nodes, edges };
}
