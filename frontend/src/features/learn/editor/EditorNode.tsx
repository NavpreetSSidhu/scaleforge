import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { categoryStyle, iconFor } from '@/lib/catalog';

export interface EditorNodeData {
  label: string;
  type: string;
  category: string;
}

/**
 * Editable canvas node for the course designer. Unlike the read-only LessonNode
 * it exposes connect handles and a selection ring, but borrows the same
 * icon/accent treatment so the design looks identical to what the player shows.
 */
function EditorNodeComponent({ data, selected }: NodeProps<EditorNodeData>) {
  const style = categoryStyle(data.category);
  const Icon = iconFor(data.type, data.category);

  return (
    <div
      className={`relative min-w-[170px] rounded-xl border bg-surface-panel/95 px-3 py-2.5 backdrop-blur transition ${
        selected ? 'border-accent/70 ring-1 ring-accent/50' : 'border-white/[0.06]'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-0 !bg-accent/70" />

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

      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-0 !bg-accent/70" />
    </div>
  );
}

export default memo(EditorNodeComponent);
