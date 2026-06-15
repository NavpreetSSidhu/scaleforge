import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { categoryStyle, groupCatalog, iconFor, lldCategoryFor } from '@/lib/catalog';
import { useCourseEditorStore } from '@/store/courseEditorStore';
import type { NodeConfig, NodeDefinition } from '@/types/domain';
import { COURSE_NODE_MIME, type CourseNodeDragPayload } from './CourseDesignCanvas';

/** The abstract low-level-design node vocabulary (no infra catalog entry). */
const lldComponents: { type: string; label: string; description: string }[] = [
  { type: 'lld_class', label: 'Class / Facade', description: 'A class or the public API facade' },
  { type: 'lld_index', label: 'HashMap / Index', description: 'Key → value lookup structure' },
  { type: 'lld_list', label: 'List', description: 'Linked list / array / queue' },
  { type: 'lld_node', label: 'Node', description: 'A list/tree node or entry' },
  { type: 'lld_bucket', label: 'Bucket / Counter', description: 'Bucket, counter, or frequency group' },
];

/**
 * Component palette for the course designer. For system-design courses it lists
 * the real infra catalog (so courses stay groundable + runnable on the canvas);
 * for LLD courses it lists the abstract class/data-structure vocabulary.
 */
export function EditorPalette() {
  const kind = useCourseEditorStore((s) => s.kind);
  const addNode = useCourseEditorStore((s) => s.addNode);
  const [query, setQuery] = useState('');

  const { data } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
    staleTime: Infinity,
    enabled: kind !== 'lld',
  });

  const groups = useMemo(() => {
    if (kind === 'lld') return [];
    const nodes = (data ?? []).filter((n) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return n.label.toLowerCase().includes(q) || n.description.toLowerCase().includes(q);
    });
    return groupCatalog(nodes);
  }, [data, query, kind]);

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-white/[0.06] bg-surface/60">
      <div className="border-b border-white/[0.06] p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          {kind === 'lld' ? 'Structures' : 'Components'}
        </p>
        {kind !== 'lld' && (
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-surface-panel px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-ghost focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {kind === 'lld'
          ? lldComponents.map((c) => (
              <PaletteCard
                key={c.type}
                type={c.type}
                label={c.label}
                description={c.description}
                category={lldCategoryFor(c.type) ?? 'compute'}
                onAdd={() => addNode({ type: c.type, label: c.label })}
              />
            ))
          : groups.map(([group, items]) => (
              <PaletteGroup key={group} group={group} items={items} onAdd={addNode} />
            ))}
      </div>
      <div className="border-t border-white/[0.06] px-3 py-2 text-[11px] text-ink-ghost">
        drag onto canvas or click to add
      </div>
    </div>
  );
}

function PaletteGroup({
  group,
  items,
  onAdd,
}: {
  group: string;
  items: NodeDefinition[];
  onAdd: (input: { type: string; label: string; config?: NodeConfig }) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="mb-1">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-hover/60"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 text-ink-faint transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          {group}
        </span>
      </button>
      {!collapsed && (
        <div className="grid gap-1.5 px-1 pb-2">
          {items.map((item) => (
            <PaletteCard
              key={item.type}
              type={item.type}
              label={item.label}
              description={item.description}
              category={item.category}
              config={item.defaultConfig}
              onAdd={() => onAdd({ type: item.type, label: item.label, config: item.defaultConfig })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PaletteCard({
  type,
  label,
  description,
  category,
  config,
  onAdd,
}: {
  type: string;
  label: string;
  description: string;
  category: string;
  config?: NodeConfig;
  onAdd: () => void;
}) {
  const style = categoryStyle(category);
  const Icon = iconFor(type, category);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        const payload: CourseNodeDragPayload = { type, label, config };
        e.dataTransfer.setData(COURSE_NODE_MIME, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onAdd}
      title={`${description} · drag onto canvas or click to add`}
      className="group flex cursor-grab items-center gap-2.5 rounded-lg border border-white/[0.05] bg-surface-panel/50 px-2.5 py-2 text-left transition hover:border-white/10 hover:bg-surface-hover active:cursor-grabbing"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${style.accent}1f`, color: style.accent }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="block min-w-0 flex-1 truncate text-sm font-medium text-ink">{label}</span>
      <Plus className="h-3.5 w-3.5 shrink-0 text-ink-ghost opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}
