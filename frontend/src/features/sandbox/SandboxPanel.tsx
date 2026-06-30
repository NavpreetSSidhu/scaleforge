import { useQuery } from '@tanstack/react-query';
import { FlaskConical, Play, Square } from 'lucide-react';
import { api } from '@/lib/api';
import { compact } from '@/lib/format';
import { useArchitectureStore } from '@/store/architectureStore';
import { useChaosStore } from '@/store/chaosStore';
import { useLiveSimStore } from '@/store/liveSimStore';
import { useSandboxStore } from '@/store/sandboxStore';
import { useSandbox } from './useSandbox';

/** Cached capability probe — the bar hides entirely when the sandbox is off. */
export function useSandboxEnabled() {
  const { data } = useQuery({
    queryKey: ['sandbox-status'],
    queryFn: api.getSandboxStatus,
    staleTime: Infinity,
    retry: false,
  });
  return data?.enabled ?? false;
}

/** Formats a measured-vs-predicted delta as a signed percentage. */
function deltaPct(measured: number, predicted: number): string {
  if (predicted <= 0) return '—';
  const d = ((measured - predicted) / predicted) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`;
}

/**
 * Real Sandbox control bar. Toggling it on lets the user stand the current design
 * up as a live HTTP service server-side and hammer it with a real Go load
 * generator, then compare what it MEASURED against what the simulator PREDICTED.
 */
export function SandboxPanel() {
  const enabled = useSandboxEnabled();
  const { start, stop } = useSandbox();
  const nodeCount = useArchitectureStore((s) => s.nodes.length);
  const { mode, running, phase, model, progress, measured, predicted, error, toggleMode } =
    useSandboxStore();

  if (!enabled) return null;

  if (!mode) {
    return (
      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.06] bg-surface/40 px-4 py-2">
        <span className="text-[11px] text-ink-faint">
          Prove it for real — stand this design up as a live service and load-test it.
        </span>
        <button
          type="button"
          onClick={() => {
            // Sandbox + Live + Chaos all overlay the workspace; only one at a time.
            if (useLiveSimStore.getState().mode) useLiveSimStore.getState().toggleMode();
            if (useChaosStore.getState().mode) useChaosStore.getState().toggleMode();
            toggleMode();
          }}
          disabled={nodeCount === 0}
          className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40"
        >
          <FlaskConical className="h-3.5 w-3.5 text-violet" />
          Sandbox
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 space-y-2 border-t border-violet/30 bg-violet/[0.05] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={toggleMode}
          className="flex items-center gap-1.5 rounded-lg bg-violet/15 px-2.5 py-1 text-xs font-semibold text-violet"
        >
          <FlaskConical className="h-3.5 w-3.5" /> Sandbox
        </button>

        {running ? (
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-1.5 rounded-lg bg-danger/15 px-2.5 py-1 text-xs font-semibold text-danger transition hover:bg-danger/25"
          >
            <Square className="h-3.5 w-3.5" /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={nodeCount === 0}
            className="flex items-center gap-1.5 rounded-lg bg-violet/15 px-2.5 py-1 text-xs font-semibold text-violet transition hover:bg-violet/25 disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" /> {measured ? 'Re-run' : 'Deploy & load-test'}
          </button>
        )}

        {phase && <span className="text-[11px] text-ink-faint">{phase}</span>}
      </div>

      {/* Live progress while running */}
      {progress && !measured && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
          <span className="text-ink-faint">
            achieved <span className="font-mono text-violet">{compact(progress.achievedRps)}</span> rps
          </span>
          <span className="text-ink-faint">
            p50/p95/p99{' '}
            <span className="font-mono text-ink">
              {Math.round(progress.p50)}/{Math.round(progress.p95)}/{Math.round(progress.p99)} ms
            </span>
          </span>
          {progress.errorRate > 0 && (
            <span className="text-ink-faint">
              errors <span className="font-mono text-danger">{(progress.errorRate * 100).toFixed(1)}%</span>
            </span>
          )}
        </div>
      )}

      {/* Measured vs predicted once done */}
      {measured && predicted && (
        <div className="overflow-hidden rounded-lg border border-white/[0.06]">
          <table className="w-full text-[11px]">
            <thead className="bg-surface-panel/60 text-ink-faint">
              <tr>
                <th className="px-2 py-1 text-left font-medium">metric</th>
                <th className="px-2 py-1 text-right font-medium">predicted</th>
                <th className="px-2 py-1 text-right font-medium">measured</th>
                <th className="px-2 py-1 text-right font-medium">Δ</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr className="border-t border-white/[0.05]">
                <td className="px-2 py-1 font-sans text-ink-muted">throughput (rps)</td>
                <td className="px-2 py-1 text-right text-ink-faint">{compact(predicted.capacityRps)}</td>
                <td className="px-2 py-1 text-right text-violet">{compact(measured.achievedRps)}</td>
                <td className="px-2 py-1 text-right text-ink-faint">
                  {deltaPct(measured.achievedRps, predicted.capacityRps)}
                </td>
              </tr>
              <tr className="border-t border-white/[0.05]">
                <td className="px-2 py-1 font-sans text-ink-muted">latency p50 (ms)</td>
                <td className="px-2 py-1 text-right text-ink-faint">{Math.round(predicted.latencyMs)}</td>
                <td className="px-2 py-1 text-right text-violet">{Math.round(measured.p50)}</td>
                <td className="px-2 py-1 text-right text-ink-faint">
                  {deltaPct(measured.p50, predicted.latencyMs)}
                </td>
              </tr>
            </tbody>
          </table>
          {model && (
            <div className="border-t border-white/[0.05] px-2 py-1 text-[10px] text-ink-ghost">
              live service: {model.concurrency} concurrent servers · ~{Math.round(model.serviceLatency)}ms/req ·
              p99 {Math.round(measured.p99)}ms · {(measured.errorRate * 100).toFixed(1)}% shed
            </div>
          )}
        </div>
      )}

      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
