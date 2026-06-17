import { useMemo, type DragEvent } from 'react';
import { nodeStyle } from '@/lib/agentflow';
import { useStudioStore } from '@/store/studioStore';
import type { AgentNodeKind } from '@/types/agentflow';
import { useAgentflowCatalog } from './useAgentflow';
import { AGENT_NODE_MIME, type AgentNodeDragPayload } from './WorkflowCanvas';

/** Left rail: draggable workflow steps grouped by role. Drag onto the canvas, or
 *  click to drop one near the centre. */
export function WorkflowPalette() {
  const { data: kinds } = useAgentflowCatalog();
  const addNode = useStudioStore((s) => s.addNode);

  const groups = useMemo(() => {
    const map = new Map<string, AgentNodeKind[]>();
    (kinds ?? []).forEach((k) => {
      const arr = map.get(k.group) ?? [];
      arr.push(k);
      map.set(k.group, arr);
    });
    return [...map.entries()];
  }, [kinds]);

  const onDragStart = (e: DragEvent, k: AgentNodeKind) => {
    const payload: AgentNodeDragPayload = { type: k.type, label: k.label, config: k.defaultConfig };
    e.dataTransfer.setData(AGENT_NODE_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/[0.06] bg-surface/60">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Agent Steps</h2>
        <p className="text-xs text-ink-faint">Drag onto the canvas</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map(([group, items]) => (
          <div key={group} className="mb-4">
            <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-ghost">
              {group}
            </h3>
            <div className="flex flex-col gap-1.5">
              {items.map((k) => {
                const { accent, icon: Icon } = nodeStyle(k.type);
                return (
                  <button
                    key={k.type}
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(e, k)}
                    onClick={() => addNode({ type: k.type, label: k.label, config: k.defaultConfig }, { x: 320, y: 180 })}
                    title={k.description}
                    className="group flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-surface-panel/60 px-2.5 py-2 text-left transition hover:border-white/[0.12] hover:bg-surface-hover"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${accent}22`, color: accent }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{k.label}</span>
                      <span className="block truncate text-[11px] text-ink-ghost">{k.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
