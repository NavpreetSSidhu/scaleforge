import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { nodeStyle } from '@/lib/agentflow';

export interface AgentNodeData {
  label: string;
  type: string;
  /** Live status during a dry-run (drives the glow). */
  status?: 'running' | 'done' | 'error';
}

/** A workflow step rendered on the canvas — accent + icon by type, with source/
 *  target handles for wiring and a status glow during live runs. */
function AgentNodeView({ data, selected }: { data: AgentNodeData; selected?: boolean }) {
  const { accent, icon: Icon } = nodeStyle(data.type);
  const ring =
    data.status === 'running'
      ? 'ring-2 ring-amber-300 shadow-[0_0_18px_-2px_rgba(245,177,76,0.6)]'
      : data.status === 'done'
        ? 'ring-2 ring-accent/70'
        : data.status === 'error'
          ? 'ring-2 ring-danger'
          : selected
            ? 'ring-2 ring-white/30'
            : 'ring-1 ring-white/[0.08]';

  return (
    <div
      className={`flex min-w-[150px] items-center gap-2.5 rounded-xl bg-surface-panel px-3 py-2.5 shadow-panel transition ${ring}`}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-white/30" />
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${accent}22`, color: accent }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-ink">{data.label}</div>
        <div className="text-[10px] uppercase tracking-wide text-ink-ghost">{data.type}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-white/30" />
    </div>
  );
}

export default memo(AgentNodeView);
