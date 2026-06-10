import { useEffect, useState } from 'react';
import { animate } from 'framer-motion';
import { Activity, AlertTriangle, DollarSign, Timer, Users } from 'lucide-react';
import { compact, compactUsd } from '@/lib/format';
import { overallScore, gradeMeta } from '@/lib/score';
import { useArchitectureStore } from '@/store/architectureStore';
import type { SimulationResult } from '@/types/domain';

/** Eases a number up to `value` on change, formatting each frame. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(() => format(value));
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.7,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display}</>;
}

export function MetricsStrip() {
  const { simulationResult, traffic, setInspectorOpen } = useArchitectureStore();
  const r = simulationResult;

  const p95 = r ? Math.round(r.estimatedLatencyMs * 1.9) : 0;
  const overloaded =
    r?.bottleneck && r.bottleneck.incoming > r.bottleneck.capacity ? r.bottleneck : null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/[0.06] bg-surface/70 px-3 py-2 backdrop-blur">
      <Metric
        icon={<Activity className="h-4 w-4 text-accent" />}
        label="Throughput"
        value={
          r ? <CountUp value={r.systemCapacityRps} format={(n) => `${compact(n)} rps`} /> : '—'
        }
      />
      <Metric
        icon={<Timer className="h-4 w-4 text-info" />}
        label="Latency p50"
        value={
          r ? (
            <CountUp value={r.estimatedLatencyMs} format={(n) => `${Math.round(n)} ms`} />
          ) : (
            '—'
          )
        }
        sub={r ? `p95 ${p95}` : undefined}
      />
      <Metric
        icon={<Users className="h-4 w-4 text-violet" />}
        label="Concurrent"
        value={<CountUp value={traffic.concurrentUsers} format={(n) => `${compact(n)} users`} />}
      />
      <Metric
        icon={<DollarSign className="h-4 w-4 text-amber" />}
        label="Est. cost"
        value={r ? <CountUp value={r.monthlyCostUsd} format={(n) => `${compactUsd(n)} /mo`} /> : '—'}
      />

      <div className="ml-auto flex items-center gap-2">
        {overloaded && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <span className="text-xs font-semibold text-danger">1 critical</span>
            <span className="hidden text-xs text-ink-muted sm:inline">· {overloaded.label}</span>
          </div>
        )}
        {r && <GradeBadge result={r} onClick={() => setInspectorOpen(true)} />}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-surface-panel/50 px-3 py-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-line/60">
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </div>
        <div className="font-mono text-sm font-semibold text-ink">
          {value}
          {sub && <span className="ml-1 text-[11px] font-normal text-ink-faint">· {sub}</span>}
        </div>
      </div>
    </div>
  );
}

function GradeBadge({ result, onClick }: { result: SimulationResult; onClick: () => void }) {
  const score = overallScore(result.scores);
  const meta = gradeMeta(result.scores.overallGrade);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 transition hover:brightness-110"
      style={{ borderColor: `${meta.color}55`, backgroundColor: `${meta.color}14` }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold"
        style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
      >
        {result.scores.overallGrade}
      </span>
      <div className="leading-tight">
        <div className="font-mono text-sm font-semibold text-ink">{score}/100</div>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: meta.color }}>
          {meta.label}
        </div>
      </div>
    </button>
  );
}
