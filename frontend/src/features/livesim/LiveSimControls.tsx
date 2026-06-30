import { Activity, Gauge, Play, Square, Zap } from 'lucide-react';
import { compact } from '@/lib/format';
import { useArchitectureStore } from '@/store/architectureStore';
import { useChaosStore } from '@/store/chaosStore';
import { useLiveSimStore } from '@/store/liveSimStore';
import { useLiveSim } from './useLiveSim';

const SPEEDS = [1, 2, 4, 8];
const ARRIVAL_SCALES = [0.5, 1, 2, 4];

/** Inline SVG sparkline of p95 latency over the streamed ticks. */
function LatencySparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 22;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={points} fill="none" stroke="#f5b14b" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * Live Mode controls. Toggling it on turns the canvas into a live discrete-event
 * playground: requests flow through the tiers as a streamed simulation, queues
 * build at the bottleneck, tail latency stretches, and overloaded tiers shed
 * load. This bar starts/stops the run, tunes pace and arrival rate, and reads
 * back the live latency distribution + served/shed throughput.
 */
export function LiveSimControls() {
  const { start, stop } = useLiveSim();
  const nodeCount = useArchitectureStore((s) => s.nodes.length);
  const {
    mode,
    running,
    latest,
    history,
    error,
    speedFactor,
    arrivalScale,
    toggleMode,
    setSpeedFactor,
    setArrivalScale,
  } = useLiveSimStore();

  if (!mode) {
    return (
      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.06] bg-surface/40 px-4 py-2">
        <span className="text-[11px] text-ink-faint">
          Watch it run — stream real requests through the tiers and see queues build under load.
        </span>
        <button
          type="button"
          onClick={() => {
            // Live Mode and Chaos mode both overlay the canvas; only one at a time.
            if (useChaosStore.getState().mode) useChaosStore.getState().toggleMode();
            toggleMode();
          }}
          disabled={nodeCount === 0}
          className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40"
        >
          <Activity className="h-3.5 w-3.5 text-accent" />
          Live mode
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 space-y-2 border-t border-accent/30 bg-accent/[0.04] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={toggleMode}
          className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent"
        >
          <Activity className="h-3.5 w-3.5" />
          Live mode
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
            className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent transition hover:bg-accent/25 disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" /> {latest ? 'Replay' : 'Run'}
          </button>
        )}

        {/* Pace */}
        <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <Gauge className="h-3.5 w-3.5" /> speed
          <div className="flex overflow-hidden rounded-md border border-white/[0.08]">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeedFactor(s)}
                className={`px-1.5 py-0.5 font-mono text-[11px] transition ${
                  speedFactor === s ? 'bg-accent/20 text-accent' : 'text-ink-faint hover:bg-surface-hover'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* Arrival-rate scaler */}
        <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <Zap className="h-3.5 w-3.5" /> load
          <div className="flex overflow-hidden rounded-md border border-white/[0.08]">
            {ARRIVAL_SCALES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setArrivalScale(s)}
                className={`px-1.5 py-0.5 font-mono text-[11px] transition ${
                  arrivalScale === s ? 'bg-amber/20 text-amber' : 'text-ink-faint hover:bg-surface-hover'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Readout */}
      {latest && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="text-ink-faint">p50/p95/p99</span>
            <span className="font-mono font-semibold text-ink">
              {Math.round(latest.p50)}/{Math.round(latest.p95)}/{Math.round(latest.p99)}
              <span className="text-ink-ghost"> ms</span>
            </span>
          </span>

          <span className="text-ink-faint">
            served <span className="font-mono text-accent">{compact(latest.servedRps)}</span> rps
          </span>

          {latest.droppedRps > 0 && (
            <span className="text-ink-faint">
              shedding <span className="font-mono text-danger">{compact(latest.droppedRps)}</span> rps
            </span>
          )}

          <span className="text-ink-faint">
            completed <span className="font-mono text-ink">{compact(latest.completed)}</span>
            {latest.failed > 0 && (
              <>
                {' · '}failed <span className="font-mono text-danger">{compact(latest.failed)}</span>
              </>
            )}
          </span>

          <span className="ml-auto flex items-center gap-1.5 text-ink-ghost">
            <LatencySparkline values={history.map((t) => t.p95)} />
            {running ? (
              <span className="text-accent">streaming…</span>
            ) : (
              latest.done && <span>done</span>
            )}
          </span>
        </div>
      )}

      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
