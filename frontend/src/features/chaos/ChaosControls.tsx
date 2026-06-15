import { Bomb, RotateCcw, ShieldAlert, Skull, TrendingUp, Wand2 } from 'lucide-react';
import { compact } from '@/lib/format';
import { useArchitectureStore } from '@/store/architectureStore';
import { useAssistantStore } from '@/store/assistantStore';
import { useChaosStore } from '@/store/chaosStore';
import { useAssistantEnabled } from '@/features/assistant/AssistantDrawer';
import { useChaosSimulation } from './useChaosSimulation';

/** Colour for the 0–100 resilience score, matching the grade ramp elsewhere. */
function scoreColor(score: number): string {
  if (score >= 80) return '#2fd39e';
  if (score >= 60) return '#8fd14f';
  if (score >= 40) return '#f5b14b';
  return '#ff6058';
}

const SPIKES = [1, 2, 5, 10, 20];

/** Builds the prompt the assistant auto-answers when "Make it resilient" is clicked. */
function resiliencePrompt(spofLabels: string[], availabilityPct: number): string {
  if (spofLabels.length > 0) {
    return `My architecture has single points of failure: ${spofLabels.join(
      ', ',
    )}. How do I eliminate them and make the system fault-tolerant? Give concrete changes.`;
  }
  return `Under failure my system only serves about ${availabilityPct}% of traffic. How do I make it more resilient? Give concrete changes.`;
}

/**
 * Chaos / Resilience mode controls. Toggling it on turns the canvas into a
 * failure-injection surface (click a node to kill it); this panel adds a region
 * outage and a traffic spike, and reads back the resilience score, availability
 * and single points of failure of the design under the injected failure.
 */
export function ChaosControls() {
  useChaosSimulation();

  const regions = useArchitectureStore((s) => s.regions);
  const nodeCount = useArchitectureStore((s) => s.nodes.length);
  const {
    mode,
    killedNodeIds,
    outageRegion,
    spikeMultiplier,
    result,
    toggleMode,
    setOutageRegion,
    setSpikeMultiplier,
    reset,
  } = useChaosStore();
  const openAssistant = useAssistantStore((s) => s.openWith);
  const assistantEnabled = useAssistantEnabled();

  if (!mode) {
    return (
      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.06] bg-surface/40 px-4 py-2">
        <span className="text-[11px] text-ink-faint">
          Stress-test your design — inject failures and watch it degrade.
        </span>
        <button
          type="button"
          onClick={toggleMode}
          disabled={nodeCount === 0}
          className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40"
        >
          <ShieldAlert className="h-3.5 w-3.5 text-danger" />
          Resilience mode
        </button>
      </div>
    );
  }

  const score = result?.resilienceScore ?? null;
  const availabilityPct = result ? Math.round(result.availability * 100) : null;
  const fullOutage = result != null && !result.available;
  const spofLabels = result?.spofs?.map((s) => s.label) ?? [];
  const hasFailure = killedNodeIds.length > 0 || outageRegion != null || spikeMultiplier > 1;

  return (
    <div className="shrink-0 space-y-2 border-t border-danger/30 bg-danger/[0.04] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={toggleMode}
          className="flex items-center gap-1.5 rounded-lg bg-danger/15 px-2.5 py-1 text-xs font-semibold text-danger"
        >
          <Bomb className="h-3.5 w-3.5" />
          Resilience mode
        </button>

        <span className="hidden items-center gap-1 text-[11px] text-ink-faint sm:flex">
          <Skull className="h-3.5 w-3.5" /> click a node to kill it
          {killedNodeIds.length > 0 && (
            <span className="ml-1 font-mono text-danger">({killedNodeIds.length} down)</span>
          )}
        </span>

        {/* Region outage */}
        <label className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          Region outage
          <select
            value={outageRegion ?? ''}
            onChange={(e) => setOutageRegion(e.target.value || null)}
            className="rounded-md border border-white/[0.08] bg-surface-panel px-1.5 py-0.5 text-[11px] text-ink"
          >
            <option value="">none</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        {/* Traffic spike */}
        <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <TrendingUp className="h-3.5 w-3.5" /> spike
          <div className="flex overflow-hidden rounded-md border border-white/[0.08]">
            {SPIKES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSpikeMultiplier(m)}
                className={`px-1.5 py-0.5 font-mono text-[11px] transition ${
                  spikeMultiplier === m
                    ? 'bg-amber/20 text-amber'
                    : 'text-ink-faint hover:bg-surface-hover'
                }`}
              >
                {m}×
              </button>
            ))}
          </div>
        </div>

        {hasFailure && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 text-[11px] text-ink-faint transition hover:text-ink"
          >
            <RotateCcw className="h-3 w-3" /> reset
          </button>
        )}
      </div>

      {/* Readout */}
      {result && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
          {score != null && (
            <span className="flex items-center gap-1.5">
              <span className="text-ink-faint">Resilience</span>
              <span className="font-mono text-sm font-semibold" style={{ color: scoreColor(score) }}>
                {score}
              </span>
              <span className="text-ink-ghost">/100</span>
            </span>
          )}

          <span className="flex items-center gap-1.5">
            <span className="text-ink-faint">Availability</span>
            <span
              className="font-mono font-semibold"
              style={{ color: fullOutage ? '#ff6058' : availabilityPct! < 100 ? '#f5b14b' : '#2fd39e' }}
            >
              {fullOutage ? 'OUTAGE' : `${availabilityPct}%`}
            </span>
          </span>

          {result.failedRps > 0 && (
            <span className="text-ink-faint">
              shedding <span className="font-mono text-danger">{compact(result.failedRps)}</span> rps
            </span>
          )}

          {spofLabels.length > 0 && (
            <span className="text-ink-faint">
              SPOFs:{' '}
              <span className="text-danger">{spofLabels.join(', ')}</span>
            </span>
          )}

          {assistantEnabled && (
            <button
              type="button"
              onClick={() => openAssistant(resiliencePrompt(spofLabels, availabilityPct ?? 0))}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1 font-semibold text-accent transition hover:bg-accent/25"
            >
              <Wand2 className="h-3.5 w-3.5" /> Make it resilient
            </button>
          )}
        </div>
      )}
    </div>
  );
}
