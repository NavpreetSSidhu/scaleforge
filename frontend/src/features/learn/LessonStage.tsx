import { useMemo } from 'react';
import ReactFlow, { Background, BackgroundVariant } from 'reactflow';
import 'reactflow/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Course } from '@/types/domain';
import LessonNode from './LessonNode';
import { useStepAnimation } from './useStepAnimation';

const nodeTypes = { lesson: LessonNode };

/**
 * The animated, read-only React Flow stage for a lesson. Reveals nodes/edges and
 * spotlights the focused component for the current step. Must render inside a
 * ReactFlowProvider (LessonPlayer provides one).
 */
export function LessonStage({ course, stepIndex }: { course: Course; stepIndex: number }) {
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

  const { nodes, edges } = useStepAnimation(course, stepIndex, categoryByType);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      minZoom={0.2}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      className="bg-base"
    >
      <Background variant={BackgroundVariant.Dots} color="#232936" gap={22} size={1.5} />
    </ReactFlow>
  );
}
