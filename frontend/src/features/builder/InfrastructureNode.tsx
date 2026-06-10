import { memo } from 'react';
import { motion } from 'framer-motion';
import { Handle, Position, type NodeProps } from 'reactflow';
import { AlertTriangle } from 'lucide-react';
import { categoryStyle, iconFor } from '@/lib/catalog';
import type { GraphNode, NodeHealth } from '@/types/domain';

export type InfrastructureNodeData = GraphNode & {
  category: string;
  healthStatus?: NodeHealth['status'];
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

function InfrastructureNodeComponent({ data, selected }: NodeProps<InfrastructureNodeData>) {
  const style = categoryStyle(data.category);
  const Icon = iconFor(data.type, data.category);
  const ring = data.healthStatus ? statusRing[data.healthStatus] : 'ring-white/[0.07]';
  const isBottleneck = data.healthStatus === 'bottleneck';

  return (
    <motion.div
      animate={isBottleneck ? bottleneckPulse : { boxShadow: '0 0 0px 0px rgba(0,0,0,0)' }}
      transition={
        isBottleneck
          ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.3 }
      }
      className={`relative min-w-[168px] rounded-xl border border-white/[0.06] bg-surface-panel/95 px-3 py-2.5 ring-1 backdrop-blur transition-colors ${ring} ${
        selected ? '!ring-2 !ring-accent' : ''
      }`}
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
        {data.healthStatus === 'bottleneck' && (
          <AlertTriangle className="ml-auto h-4 w-4 shrink-0 text-danger" />
        )}
      </div>

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
