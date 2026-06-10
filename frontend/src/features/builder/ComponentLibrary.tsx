import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { categoryStyle, groupCatalog, iconFor } from '@/lib/catalog';
import { useArchitectureStore } from '@/store/architectureStore';
import type { NodeDefinition } from '@/types/domain';

export function ComponentLibrary() {
  const addNode = useArchitectureStore((s) => s.addNode);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
  });

  const groups = useMemo(() => {
    const nodes = (data ?? []).filter((n) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        n.label.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.group.toLowerCase().includes(q)
      );
    });
    return groupCatalog(nodes);
  }, [data, query]);

  const total = data?.length ?? 0;

  return (
    <div className="flex h-full flex-col bg-surface/60">
      {/* Search */}
      <div className="border-b border-white/[0.06] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-surface-panel px-2.5 py-2">
          <Search className="h-4 w-4 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search components"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-ghost focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
        {isLoading && <p className="px-2 py-4 text-sm text-ink-faint">Loading catalog…</p>}
        {isError && (
          <p className="px-2 py-4 text-sm text-danger">Could not load components.</p>
        )}

        {groups.map(([group, items]) => {
          const isCollapsed = collapsed[group];
          return (
            <section key={group} className="mb-1">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [group]: !c[group] }))}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-surface-hover/60"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 text-ink-faint transition-transform ${
                    isCollapsed ? '-rotate-90' : ''
                  }`}
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  {group}
                </span>
                <span className="ml-auto rounded-md bg-surface-line px-1.5 text-[11px] text-ink-faint">
                  {items.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="grid min-w-0 grid-cols-1 gap-1.5 px-1 pb-2">
                  {items.map((item) => (
                    <ComponentCard key={item.type} def={item} onAdd={() => addNode(item)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-ink-faint">
        <span>{total} components</span>
        <span>double-click to add →</span>
      </div>
    </div>
  );
}

function ComponentCard({ def, onAdd }: { def: NodeDefinition; onAdd: () => void }) {
  const style = categoryStyle(def.category);
  const Icon = iconFor(def.type, def.category);

  return (
    <button
      type="button"
      onDoubleClick={onAdd}
      onClick={onAdd}
      title={`${def.description} · click to add`}
      className="group flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-surface-panel/50 px-2.5 py-2 text-left transition hover:border-white/10 hover:bg-surface-hover"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${style.accent}1f`, color: style.accent }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{def.label}</span>
        <span className="block truncate text-[11px] text-ink-faint">{def.description}</span>
      </span>
      <Plus className="h-4 w-4 shrink-0 text-ink-ghost opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}
