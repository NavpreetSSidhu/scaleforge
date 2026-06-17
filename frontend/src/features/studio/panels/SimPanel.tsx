import { useMutation } from '@tanstack/react-query';
import { Play, Gauge } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMs, formatUsd, nodeStyle } from '@/lib/agentflow';
import { Spinner } from '@/components/Spinner';
import { useStudioStore } from '@/store/studioStore';
import type { SimResult } from '@/types/agentflow';

/** Monte-Carlo simulation panel: latency/cost distribution + per-node hotspots. */
export function SimPanel() {
  const graph = useStudioStore((s) => s.graph);
  const sim = useMutation({
    mutationFn: () => api.simulateWorkflow({ graph: graph(), trials: 4000 }),
  });
  const r = sim.data;

  return (
    <div className="flex flex-col gap-4 p-4">
      <button type="button" onClick={() => sim.mutate()} disabled={sim.isPending} className="btn-primary w-full justify-center">
        {sim.isPending ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" fill="currentColor" />}
        {sim.isPending ? 'Simulating…' : 'Run Monte-Carlo simulation'}
      </button>

      {sim.isError && <p className="text-xs text-danger">{(sim.error as Error).message}</p>}

      {r && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="p50 latency" value={formatMs(r.latencyMs.p50)} />
            <Stat label="p95 latency" value={formatMs(r.latencyMs.p95)} accent />
            <Stat label="p99 latency" value={formatMs(r.latencyMs.p99)} accent />
            <Stat label="mean cost" value={formatUsd(r.costUsd.mean)} />
            <Stat label="tokens in" value={Math.round(r.meanTokensIn).toLocaleString()} />
            <Stat label="tokens out" value={Math.round(r.meanTokensOut).toLocaleString()} />
          </div>

          <Section title="Per-step latency share" icon={<Gauge className="h-3.5 w-3.5" />}>
            <Hotspots r={r} />
          </Section>

          {r.criticalPath.length > 0 && (
            <Section title="Critical path">
              <p className="text-xs text-ink-muted">{r.criticalPath.join('  →  ')}</p>
            </Section>
          )}
          <p className="text-[11px] text-ink-ghost">
            {r.trials.toLocaleString()} trials · bottleneck:{' '}
            <span className="text-ink-muted">
              {r.perNode.find((n) => n.nodeId === r.bottleneck)?.label ?? r.bottleneck}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function Hotspots({ r }: { r: SimResult }) {
  const sorted = [...r.perNode].sort((a, b) => b.share - a.share);
  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((n) => (
        <div key={n.nodeId} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs text-ink-muted">{n.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, n.share * 100)}%`, background: nodeStyle(n.type).accent }}
            />
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-[11px] text-ink-faint">
            {Math.round(n.share * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-surface-panel/50 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-ghost">{label}</div>
      <div className={`font-mono text-sm ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-ghost">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}
