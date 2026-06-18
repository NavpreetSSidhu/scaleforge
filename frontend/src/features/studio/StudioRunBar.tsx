import { Play } from 'lucide-react';
import { formatMs } from '@/lib/agentflow';
import { useStudioStore } from '@/store/studioStore';
import { Spinner } from '@/components/Spinner';
import type { RunEvent } from '@/types/agentflow';

/**
 * Run-output strip beneath the studio canvas — the agentflow analog of the
 * builder's MetricsStrip. It holds the run query input and surfaces the live
 * dry-run's step events + final answer. The run itself is started from the
 * top-level Run button (see [[useStudioRun]]); this only reflects its state.
 */
export function StudioRunBar() {
  const { input, setInput, running, runEvents, runFinal, runError } = useStudioStore();

  const steps = runEvents.filter(
    (e) => e.type === 'node_start' || e.type === 'node_finish' || e.type === 'route',
  );

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-surface/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-ink-ghost">
            Run input
          </span>
          <input
            className="input min-w-0 flex-1 py-1.5 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Query to run through the workflow…"
          />
        </label>
        <span className="flex items-center gap-1.5 text-xs text-ink-faint">
          {running ? (
            <>
              <Spinner className="h-3.5 w-3.5 text-accent" /> Running…
            </>
          ) : (
            <>
              <Play className="h-3 w-3" fill="currentColor" /> Run from the top bar
            </>
          )}
        </span>
      </div>

      {runError && <p className="mt-2 text-xs text-danger">{runError}</p>}

      {steps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {steps.map((e, i) => (
            <EventRow key={i} ev={e} />
          ))}
        </div>
      )}

      {runFinal && (
        <div className="mt-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-accent">Final answer</div>
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-ink">{runFinal}</p>
        </div>
      )}
    </div>
  );
}

function EventRow({ ev }: { ev: RunEvent }) {
  if (ev.type === 'route') {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />
        <span>{ev.label} → branch “{ev.branch}”</span>
      </div>
    );
  }
  const done = ev.type === 'node_finish';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-accent' : 'bg-amber-300 animate-pulse'}`} />
      <span className={done ? 'text-ink-muted' : 'text-ink'}>{ev.label}</span>
      {done && ev.latencyMs != null && (
        <span className="font-mono text-[10px] text-ink-ghost">{formatMs(ev.latencyMs)}</span>
      )}
    </div>
  );
}
