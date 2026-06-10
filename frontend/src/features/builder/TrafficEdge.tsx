import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from 'reactflow';

export interface TrafficEdgeData {
  accent: string;
  /** Simulation has run — packets flow. */
  active: boolean;
  /** This edge feeds a saturated (bottleneck) node — packets turn red and pile up. */
  overloaded: boolean;
}

/**
 * A flowing-traffic edge: the static path plus small packets animating from
 * source to target via SVG `animateMotion`. Colour and density react to the
 * simulation — green/blue when healthy, red and sluggish when feeding a
 * bottleneck. Falls back to a quiet dashed line before any simulation.
 */
function TrafficEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<TrafficEdgeData>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const accent = data?.accent ?? '#2fd39e';
  const active = data?.active ?? false;
  const overloaded = data?.overloaded ?? false;
  const color = overloaded ? '#ff6058' : accent;

  // Overloaded edges crawl; healthy edges flow briskly.
  const durSec = overloaded ? 2.6 : 1.4;
  const packets = active ? (overloaded ? 2 : 3) : 0;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: active ? 2 : 1.5,
          opacity: active ? 0.85 : 0.45,
          strokeDasharray: active ? undefined : '5 5',
        }}
      />
      {Array.from({ length: packets }).map((_, i) => (
        <circle key={i} r={overloaded ? 3.6 : 3} fill={color} opacity={0.95}>
          <animateMotion
            dur={`${durSec}s`}
            repeatCount="indefinite"
            path={path}
            begin={`${(i * durSec) / packets}s`}
          />
        </circle>
      ))}
    </>
  );
}

export default memo(TrafficEdgeComponent);
