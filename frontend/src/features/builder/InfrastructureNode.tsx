import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Handle, Position, type NodeProps } from 'reactflow';
import { AlertTriangle, PowerOff } from 'lucide-react';
import { categoryStyle, iconFor } from '@/lib/catalog';
import type { GraphNode, NodeHealth } from '@/types/domain';

export type InfrastructureNodeData = GraphNode & {
  category: string;
  healthStatus?: NodeHealth['status'];
  /** 0..1+ load ratio (incoming / capacity); drives a graduated glow. */
  utilization?: number;
  /** Requests waiting in this station's queue (Live Mode); shown as a badge. */
  queueDepth?: number;
  /** Killed in Chaos mode (or inside a downed region) — rendered offline. */
  dead?: boolean;
};

// Ring colour per status. Static glow lives here; the bottleneck's pulsing glow
// is driven by Framer Motion below so it reads as "alive / under pressure".
const statusRing: Record<NonNullable<InfrastructureNodeData['healthStatus']>, string> = {
  healthy: 'ring-accent/50 shadow-[0_0_18px_-2px_rgba(47,211,158,0.4)]',
  warning: 'ring-amber/60 shadow-[0_0_18px_-2px_rgba(245,177,75,0.45)]',
  bottleneck: 'ring-danger/70',
};

const bottleneckPulse = {
  boxShadow: [
    '0 0 0px 0px rgba(255,96,88,0.0)',
    '0 0 22px 2px rgba(255,96,88,0.55)',
    '0 0 0px 0px rgba(255,96,88,0.0)',
  ],
};

// A graduated glow keyed to utilization, so a node visibly "warms up" as it
// fills toward capacity even before it becomes the single bottleneck.
function loadGlow(util: number | undefined): string {
  if (util == null) return '';
  if (util >= 1) return 'shadow-[0_0_20px_-2px_rgba(255,96,88,0.5)]';
  if (util >= 0.75) return 'shadow-[0_0_18px_-2px_rgba(245,177,75,0.45)]';
  if (util >= 0.4) return 'shadow-[0_0_16px_-3px_rgba(143,209,79,0.4)]';
  return '';
}

function InfrastructureNodeComponent({ data, selected }: NodeProps<InfrastructureNodeData>) {
  const reduceMotion = useReducedMotion();
  const style = categoryStyle(data.category);
  const Icon = iconFor(data.type, data.category);
  const dead = data.dead === true;
  const ring = dead
    ? 'ring-white/[0.04]'
    : data.healthStatus
      ? statusRing[data.healthStatus]
      : 'ring-white/[0.07]';
  const isBottleneck = !dead && data.healthStatus === 'bottleneck';

  return (
    <motion.div
      animate={
        isBottleneck && !reduceMotion
          ? bottleneckPulse
          : { boxShadow: '0 0 0px 0px rgba(0,0,0,0)' }
      }
      transition={
        isBottleneck && !reduceMotion
          ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.3 }
      }
      className={`relative min-w-[168px] rounded-xl border bg-surface-panel/95 px-3 py-2.5 ring-1 backdrop-blur transition-colors ${
        dead
          ? 'border-danger/40 opacity-50 grayscale'
          : `border-white/[0.06] ${loadGlow(data.utilization)}`
      } ${ring} ${selected ? '!ring-2 !ring-accent' : ''}`}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${style.accent}1f`, color: style.accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{data.label}</div>
          <div className="font-mono text-[11px] text-ink-faint">
            {data.config.replicas}× · {data.config.cpu}vCPU
          </div>
        </div>
        {dead ? (
          <PowerOff className="ml-auto h-4 w-4 shrink-0 text-danger" />
        ) : (
          data.healthStatus === 'bottleneck' && (
            <AlertTriangle className="ml-auto h-4 w-4 shrink-0 text-danger" />
          )
        )}
      </div>

      {/* Live Mode queue-depth badge — requests waiting at this station. */}
      {!dead && data.queueDepth != null && data.queueDepth > 0 && (
        <span
          className="absolute -right-2 -top-2 flex min-w-[1.25rem] items-center justify-center rounded-full border border-amber/50 bg-base px-1 py-0.5 font-mono text-[10px] font-semibold text-amber"
          title={`${data.queueDepth} requests queued`}
        >
          {data.queueDepth > 999 ? '999+' : data.queueDepth}
        </span>
      )}

      {/* category accent bar */}
      <span
        className="absolute inset-x-3 -bottom-px h-px rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, ${style.accent}, transparent)` }}
      />

      <Handle type="source" position={Position.Bottom} />
    </motion.div>
  );
}

export default memo(InfrastructureNodeComponent);
