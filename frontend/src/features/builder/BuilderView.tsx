import { ReactFlowProvider } from 'reactflow';
import { Minimize2, PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { useArchitectureStore } from '@/store/architectureStore';
import { ComponentLibrary } from '@/features/builder/ComponentLibrary';
import { Canvas } from '@/features/builder/Canvas';
import { CanvasHeader } from '@/features/builder/CanvasHeader';
import { MetricsStrip } from '@/features/metrics/MetricsStrip';
import { TrafficScaler } from '@/features/metrics/TrafficScaler';
import { Inspector } from '@/features/inspector/Inspector';

export function BuilderView() {
  const {
    libraryOpen,
    setLibraryOpen,
    inspectorOpen,
    setInspectorOpen,
    libraryCollapsed,
    inspectorCollapsed,
    focusMode,
    toggleLibraryCollapsed,
    toggleInspectorCollapsed,
    toggleFocusMode,
  } = useArchitectureStore();

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Left rail — shown on lg+ when the library is collapsed (not in focus mode) */}
      {libraryCollapsed && !focusMode && (
        <div className="hidden w-11 shrink-0 flex-col items-center border-r border-white/[0.06] bg-surface/40 py-3 lg:flex">
          <button
            type="button"
            onClick={toggleLibraryCollapsed}
            aria-label="Expand component library"
            title="Expand component library"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Left: component library — static on lg+, drawer below */}
      <aside
        className={`z-40 w-64 shrink-0 border-r border-white/[0.06] transition-transform duration-200 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:top-14 max-lg:bottom-0 max-lg:shadow-panel ${
          libraryCollapsed || focusMode ? 'lg:hidden' : 'lg:static lg:translate-x-0'
        } ${libraryOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'}`}
      >
        <ComponentLibrary />
      </aside>

      {/* Center: canvas */}
      <ReactFlowProvider>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <CanvasHeader />
          <div className="min-h-0 flex-1">
            <Canvas />
          </div>
          <TrafficScaler />
          <MetricsStrip />

          {/* Focus-mode exit affordance */}
          {focusMode && (
            <button
              type="button"
              onClick={toggleFocusMode}
              className="absolute bottom-16 right-4 z-30 flex items-center gap-2 rounded-lg border border-white/10 bg-surface-panel/90 px-3 py-2 text-sm text-ink-muted shadow-panel backdrop-blur transition hover:text-ink"
            >
              <Minimize2 className="h-4 w-4" />
              Exit focus
            </button>
          )}
        </main>
      </ReactFlowProvider>

      {/* Right rail — shown on xl+ when the inspector is collapsed (not in focus mode) */}
      {inspectorCollapsed && !focusMode && (
        <div className="hidden w-11 shrink-0 flex-col items-center border-l border-white/[0.06] bg-surface/40 py-3 xl:flex">
          <button
            type="button"
            onClick={toggleInspectorCollapsed}
            aria-label="Expand inspector"
            title="Expand inspector"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Right: inspector — static on xl+, drawer below */}
      <aside
        className={`z-40 w-80 shrink-0 border-l border-white/[0.06] transition-transform duration-200 max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:top-14 max-xl:bottom-0 max-xl:shadow-panel ${
          inspectorCollapsed || focusMode ? 'xl:hidden' : 'xl:static xl:translate-x-0'
        } ${inspectorOpen ? 'max-xl:translate-x-0' : 'max-xl:translate-x-full'}`}
      >
        <Inspector />
      </aside>

      {/* Mobile drawer backdrop */}
      {(libraryOpen || inspectorOpen) && (
        <button
          type="button"
          aria-label="Close panels"
          onClick={() => {
            setLibraryOpen(false);
            setInspectorOpen(false);
          }}
          className="fixed inset-0 top-14 z-30 bg-black/50 xl:hidden"
        />
      )}
    </div>
  );
}
