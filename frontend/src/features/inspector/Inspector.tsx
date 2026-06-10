import { Lightbulb, SlidersHorizontal, X } from 'lucide-react';
import { compactUsd } from '@/lib/format';
import { useArchitectureStore } from '@/store/architectureStore';
import { ScorePanel } from '@/features/metrics/ScorePanel';
import { NodeProperties } from './NodeProperties';
import { TrafficForm } from './TrafficForm';

export function Inspector() {
  const { nodes, edges, selectedNodeId, simulationResult, setInspectorOpen } =
    useArchitectureStore();
  const selected = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex h-full flex-col bg-surface/60">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-ink-faint" />
          <span className="text-sm font-semibold">Inspector</span>
        </div>
        <button
          type="button"
          aria-label="Close inspector"
          onClick={() => setInspectorOpen(false)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-hover hover:text-ink xl:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {selected ? (
          <NodeProperties node={selected} />
        ) : (
          <section>
            <h3 className="text-sm font-semibold text-ink">Node properties</h3>
            <p className="mt-1 text-xs text-ink-faint">
              Select a node on the canvas to tune CPU, memory, replicas and autoscaling — and watch
              the simulation respond.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat value={String(nodes.length)} label="nodes" />
              <Stat value={String(edges.length)} label="connections" />
              <Stat
                value={simulationResult ? compactUsd(simulationResult.monthlyCostUsd) : '—'}
                label="/mo est."
              />
            </div>
          </section>
        )}

        <Section title="Traffic profile">
          <TrafficForm />
        </Section>

        {simulationResult && (
          <>
            <Section title="Architecture score">
              <ScorePanel scores={simulationResult.scores} />
            </Section>

            <Section title="Recommendations" icon={<Lightbulb className="h-3.5 w-3.5" />}>
              <ul className="space-y-2">
                {simulationResult.recommendations.map((rec) => (
                  <li
                    key={rec}
                    className="rounded-lg border border-white/[0.05] bg-surface-panel/40 px-3 py-2 text-xs text-ink-muted"
                  >
                    {rec}
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/[0.06] pt-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-surface-panel/50 px-2 py-2 text-center">
      <div className="font-mono text-base font-bold text-ink">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
    </div>
  );
}
