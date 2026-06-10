import { Minus, Plus, Gauge } from 'lucide-react';
import { compact } from '@/lib/format';
import { capacityUtilization, incomingRps, scaleConcurrency } from '@/lib/traffic';
import { useArchitectureStore } from '@/store/architectureStore';

const SLIDER_MIN = 100;
const SLIDER_MAX = 300_000;

/**
 * Live load dial. Dragging the slider (or nudging ±25%) rescales traffic, which
 * triggers a debounced re-simulation upstream — so throughput, the saturating
 * component and the recommendations all respond in real time. This is the
 * "increase/decrease traffic to see the bottleneck" control.
 */
export function TrafficScaler() {
  const { traffic, setTraffic, simulationResult } = useArchitectureStore();
  const incoming = incomingRps(traffic);

  const util =
    simulationResult != null
      ? capacityUtilization(incoming, simulationResult.systemCapacityRps)
      : null;
  const saturated = util != null && util > 1;
  const bottleneck = simulationResult?.bottleneck ?? null;

  const tone =
    util == null ? 'muted' : util > 1 ? 'danger' : util > 0.75 ? 'amber' : 'accent';
  const toneClass = {
    muted: 'text-ink-faint',
    accent: 'text-accent',
    amber: 'text-amber',
    danger: 'text-danger',
  }[tone];
  const barColor = { muted: '#2a3140', accent: '#2fd39e', amber: '#f5b14b', danger: '#ff6058' }[
    tone
  ];

  const setConcurrency = (concurrentUsers: number) =>
    setTraffic({
      concurrentUsers,
      dailyActiveUsers: concurrentUsers * 10,
      monthlyActiveUsers: concurrentUsers * 30,
    });

  const pct = util == null ? 0 : Math.min(100, Math.round(util * 100));

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] bg-surface/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-ink-faint" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
          Load
        </span>
        <button
          type="button"
          aria-label="Decrease traffic"
          onClick={() => setTraffic(scaleConcurrency(traffic, 0.8))}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.06] text-ink-faint transition hover:bg-surface-hover hover:text-ink"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[5.5rem] text-center font-mono text-sm font-semibold text-ink">
          {compact(incoming)} rps
        </span>
        <button
          type="button"
          aria-label="Increase traffic"
          onClick={() => setTraffic(scaleConcurrency(traffic, 1.25))}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.06] text-ink-faint transition hover:bg-surface-hover hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        type="range"
        aria-label="Concurrent users"
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={100}
        value={Math.min(SLIDER_MAX, traffic.concurrentUsers)}
        onChange={(e) => setConcurrency(Number(e.target.value))}
        className="h-1.5 min-w-[160px] flex-1 cursor-pointer appearance-none rounded-full bg-surface-line accent-accent"
        style={{ accentColor: barColor }}
      />

      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-ink-faint">{compact(traffic.concurrentUsers)} users</span>
        {util != null && (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: barColor }} />
            <span className={`font-mono font-semibold ${toneClass}`}>
              {util === Infinity ? '∞' : `${pct}%`}
            </span>
            <span className="hidden text-ink-faint sm:inline">
              {saturated && bottleneck
                ? `· ${bottleneck.label} saturates first`
                : '· of capacity'}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
