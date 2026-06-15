import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from 'reactflow';
import { useReducedMotion } from 'framer-motion';

export interface TrafficEdgeData {
  accent: string;
  /** Simulation has run — packets flow. */
  active: boolean;
  /** This edge feeds a saturated (bottleneck) node — packets turn red and pile up. */
  overloaded: boolean;
  /** 0..1+ load on the target node; scales packet density + speed. */
  load?: number;
  /** Either endpoint is dead (killed / region outage) — the link goes quiet. */
  dead?: boolean;
}

/**
 * A flowing-traffic edge: the static path plus small packets animating from
 * source to target via SVG `animateMotion`. Colour, density and speed react to
 * the simulation — brisk green/blue when healthy, denser-and-red when feeding a
 * bottleneck, and silent when an endpoint is dead. Falls back to a quiet dashed
 * line before any simulation, and to a static line under `prefers-reduced-motion`.
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
  const reduceMotion = useReducedMotion();
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const accent = data?.accent ?? '#2fd39e';
  const dead = data?.dead ?? false;
  const active = (data?.active ?? false) && !dead;
  const overloaded = (data?.overloaded ?? false) && !dead;
  const load = data?.load ?? 0;
  const color = dead ? '#3a4150' : overloaded ? '#ff6058' : accent;

  // Overloaded edges crawl; busier edges carry more packets. Density tracks load
  // so a near-idle path shows a trickle and a hot path streams.
  const durSec = overloaded ? 2.6 : 1.4;
  const baseDensity = overloaded ? 2 : 1 + Math.round(Math.min(1, load) * 3); // 1..4
  const packets = active && !reduceMotion ? baseDensity : 0;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: active ? 2 : 1.5,
          opacity: dead ? 0.25 : active ? 0.85 : 0.45,
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
