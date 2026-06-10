import { useReactFlow } from 'reactflow';
import {
  Expand,
  GitBranch,
  Maximize2,
  PanelLeftClose,
  PanelRightClose,
  Trash2,
} from 'lucide-react';
import { useArchitectureStore, type ScoreView } from '@/store/architectureStore';

const scoreViews: { id: ScoreView; label: string }[] = [
  { id: 'cards', label: 'Cards' },
  { id: 'gauges', label: 'Gauges' },
  { id: 'radar', label: 'Radar' },
];

export function CanvasHeader() {
  const {
    name,
    setName,
    nodes,
    edges,
    scoreView,
    setScoreView,
    clearCanvas,
    libraryCollapsed,
    inspectorCollapsed,
    focusMode,
    toggleLibraryCollapsed,
    toggleInspectorCollapsed,
    toggleFocusMode,
  } = useArchitectureStore();
  const { fitView } = useReactFlow();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.06] bg-surface/50 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Architecture name"
          className="min-w-0 max-w-[240px] truncate rounded-md bg-transparent px-1 text-sm font-semibold text-ink outline-none hover:bg-surface-hover/50 focus:bg-surface-panel"
        />
        <span className="hidden items-center gap-1 rounded-md bg-surface-line px-1.5 py-0.5 text-[11px] text-ink-faint sm:flex">
          <GitBranch className="h-3 w-3" /> main
        </span>
        <span className="hidden whitespace-nowrap text-xs text-ink-faint md:block">
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-[11px] uppercase tracking-wider text-ink-ghost lg:inline">
          score view
        </span>
        <div className="flex items-center rounded-lg border border-white/[0.06] bg-surface-panel/60 p-0.5">
          {scoreViews.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setScoreView(v.id)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${
                scoreView === v.id
                  ? 'bg-surface-hover text-ink shadow-sm'
                  : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Desktop panel toggles */}
        <button
          type="button"
          onClick={toggleLibraryCollapsed}
          aria-label={libraryCollapsed ? 'Show component library' : 'Hide component library'}
          title={libraryCollapsed ? 'Show library' : 'Hide library'}
          className={`hidden h-8 w-8 items-center justify-center rounded-lg transition lg:flex ${
            libraryCollapsed ? 'text-ink-faint hover:text-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
          }`}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleInspectorCollapsed}
          aria-label={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
          title={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
          className={`hidden h-8 w-8 items-center justify-center rounded-lg transition xl:flex ${
            inspectorCollapsed ? 'text-ink-faint hover:text-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
          }`}
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleFocusMode}
          aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
          title={focusMode ? 'Exit focus mode' : 'Focus canvas'}
          className={`hidden h-8 w-8 items-center justify-center rounded-lg transition lg:flex ${
            focusMode ? 'bg-accent/15 text-accent' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
          }`}
        >
          <Expand className="h-4 w-4" />
        </button>

        <button type="button" onClick={() => fitView({ duration: 300, padding: 0.2 })} className="btn-ghost">
          <Maximize2 className="h-4 w-4" />
          <span className="hidden sm:inline">Fit</span>
        </button>
        <button
          type="button"
          onClick={clearCanvas}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-sm text-ink-faint transition hover:border-danger/30 hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>
    </div>
  );
}
