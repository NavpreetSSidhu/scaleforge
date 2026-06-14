import { memo } from 'react';
import { motion } from 'framer-motion';
import { Handle, Position, type NodeProps } from 'reactflow';
import { categoryStyle, iconFor } from '@/lib/catalog';
import type { GraphNode } from '@/types/domain';

export type LessonNodeData = GraphNode & {
  category: string;
  /** This node is the spotlight target for the current step. */
  focused: boolean;
  /** A spotlight is active on another node, so this one is dimmed back. */
  dimmed: boolean;
  /** Callout text to show beside the node (focused node only). */
  callout?: string;
};

/**
 * Read-only node for the lesson stage. Fades + scales in when first revealed
 * (build-up reveal), glows when it is the spotlight target, and dims when the
 * spotlight is on a sibling. A focused node also shows its callout bubble.
 */
function LessonNodeComponent({ data }: NodeProps<LessonNodeData>) {
  const style = categoryStyle(data.category);
  const Icon = iconFor(data.type, data.category);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{
        opacity: data.dimmed ? 0.35 : 1,
        scale: data.focused ? 1.04 : 1,
        boxShadow: data.focused
          ? `0 0 26px -2px ${style.accent}aa`
          : '0 0 0px 0px rgba(0,0,0,0)',
      }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`relative min-w-[172px] rounded-xl border bg-surface-panel/95 px-3 py-2.5 backdrop-blur ${
        data.focused ? 'border-accent/60 ring-1 ring-accent/50' : 'border-white/[0.06]'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />

      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${style.accent}1f`, color: style.accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{data.label}</div>
          <div className="font-mono text-[11px] text-ink-faint">{style.label}</div>
        </div>
      </div>

      <span
        className="absolute inset-x-3 -bottom-px h-px rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, ${style.accent}, transparent)` }}
      />

      {data.focused && data.callout && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="absolute left-full top-1/2 z-10 ml-3 w-52 -translate-y-1/2 rounded-lg border border-accent/30 bg-surface px-3 py-2 text-xs leading-snug text-ink-muted shadow-panel"
        >
          {data.callout}
        </motion.div>
      )}

      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </motion.div>
  );
}

export default memo(LessonNodeComponent);
