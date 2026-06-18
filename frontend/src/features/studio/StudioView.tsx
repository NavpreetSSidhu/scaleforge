import { useState } from 'react';
import { SlidersHorizontal, Gauge, Database, FileCode2 } from 'lucide-react';
import { useStudioStore } from '@/store/studioStore';
import { WorkflowPalette } from './WorkflowPalette';
import { WorkflowCanvas } from './WorkflowCanvas';
import { StudioRunBar } from './StudioRunBar';
import { NodeInspector } from './NodeInspector';
import { SimPanel } from './panels/SimPanel';
import { VectorBenchPanel } from './panels/VectorBenchPanel';
import { ExportPanel } from './panels/ExportPanel';

type Tab = 'inspect' | 'simulate' | 'vectors' | 'export';

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'inspect', label: 'Inspect', icon: <SlidersHorizontal className="h-4 w-4" /> },
  { id: 'simulate', label: 'Simulate', icon: <Gauge className="h-4 w-4" /> },
  { id: 'vectors', label: 'Vectors', icon: <Database className="h-4 w-4" /> },
  { id: 'export', label: 'Export', icon: <FileCode2 className="h-4 w-4" /> },
];

/** Agent Studio: design an agentic workflow, simulate its cost/latency, benchmark
 *  the vector engine, run it live (top Run button), and export runnable code. AI
 *  generation/editing lives in the shared assistant drawer (top-bar sparkle). */
export function StudioView() {
  const { name, setName, nodes, edges } = useStudioStore();
  const [tab, setTab] = useState<Tab>('inspect');

  const visibleTabs = tabs;

  return (
    <div className="flex min-h-0 flex-1">
      <WorkflowPalette />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-surface/40 px-4 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 max-w-sm flex-1 bg-transparent text-sm font-semibold text-ink outline-none"
            aria-label="Workflow name"
          />
          <span className="text-[11px] text-ink-ghost">
            {nodes.length} steps · {edges.length} edges
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <WorkflowCanvas />
        </div>
        <StudioRunBar />
      </div>

      <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-white/[0.06] bg-surface/60">
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-white/[0.06] px-2 py-2">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition ${
                tab === t.id ? 'bg-surface-panel text-ink ring-1 ring-white/[0.06]' : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'inspect' && <NodeInspector />}
          {tab === 'simulate' && <SimPanel />}
          {tab === 'vectors' && <VectorBenchPanel />}
          {tab === 'export' && <ExportPanel />}
        </div>
      </aside>
    </div>
  );
}
