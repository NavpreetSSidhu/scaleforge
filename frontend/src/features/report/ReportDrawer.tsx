import { AnimatePresence, motion } from 'framer-motion';
import { Activity, DollarSign, FileDown, Scale, Share2, Timer, Users, X } from 'lucide-react';
import { compact, compactUsd } from '@/lib/format';
import { gradeMeta, overallScore } from '@/lib/score';
import { buildShareLink } from '@/lib/share';
import { ScorePanel } from '@/features/metrics/ScorePanel';
import { useArchitectureStore } from '@/store/architectureStore';
import type { SimulationResult } from '@/types/domain';

export function ReportDrawer() {
  const { reportOpen, setReportOpen, simulationResult, name, environment, traffic, toGraph } =
    useArchitectureStore();

  const handleShare = async () => {
    const link = buildShareLink({ name, graph: toGraph(), traffic });
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy this shareable link:', link);
    }
  };

  return (
    <AnimatePresence>
      {reportOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setReportOpen(false)}
            className="fixed inset-0 z-50 bg-black/60"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-white/[0.06] bg-surface shadow-panel"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Scale className="h-4 w-4 text-ink-faint" /> Simulation Report
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => window.print()} className="btn-ghost !py-1.5">
                  <FileDown className="h-4 w-4" /> Export PDF
                </button>
                <button type="button" onClick={handleShare} className="btn-ghost !py-1.5">
                  <Share2 className="h-4 w-4" /> Share
                </button>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  aria-label="Close report"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
              {simulationResult ? (
                <ReportBody result={simulationResult} environment={environment} traffic={traffic} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <Scale className="h-8 w-8 text-ink-ghost" />
                  <p className="text-sm text-ink-faint">
                    Run a simulation to generate a report.
                  </p>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function ReportBody({
  result: r,
  environment,
  traffic,
}: {
  result: SimulationResult;
  environment: string;
  traffic: { concurrentUsers: number };
}) {
  const score = overallScore(r.scores);
  const meta = gradeMeta(r.scores.overallGrade);
  const c = 2 * Math.PI * 52;
  const constrained = r.bottleneck && r.bottleneck.incoming > r.bottleneck.capacity;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <svg width="148" height="148" viewBox="0 0 148 148" className="-rotate-90">
            <circle cx="74" cy="74" r="52" fill="none" stroke="#232936" strokeWidth="8" />
            <circle
              cx="74"
              cy="74"
              r="52"
              fill="none"
              stroke={meta.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c - (c * score) / 100}
            />
            <text x="74" y="72" textAnchor="middle" dominantBaseline="middle" transform="rotate(90 74 74)" style={{ fill: meta.color, fontSize: '40px', fontWeight: 700 }}>
              {r.scores.overallGrade}
            </text>
            <text x="74" y="98" textAnchor="middle" dominantBaseline="middle" transform="rotate(90 74 74)" className="fill-ink-faint" style={{ fontSize: '10px', letterSpacing: '0.1em' }}>
              {meta.label.toUpperCase()}
            </text>
          </svg>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-surface-panel px-2 py-0.5 font-mono text-[11px] text-ink-muted">
            {score} / 100
          </div>
        </div>

        <div className="min-w-0">
          <h2 className="text-2xl font-bold leading-tight">
            {constrained ? (
              <>
                This design is <span className="text-danger">capacity-constrained</span> — {r.bottleneck!.label} saturates under {environment} load.
              </>
            ) : (
              <>
                This design is <span className="text-accent">well-balanced</span> for the current {environment} load.
              </>
            )}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Simulated against {environment} traffic ({compact(r.incomingRps)} rps offered) across{' '}
            {r.nodeHealth.length} nodes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip accent>{compact(r.systemCapacityRps)} rps sustained</Chip>
            <Chip>{Math.round(r.estimatedLatencyMs)}ms p50</Chip>
            <Chip>{compact(traffic.concurrentUsers)} concurrent</Chip>
            <Chip>{compactUsd(r.monthlyCostUsd)}/mo</Chip>
          </div>
        </div>
      </div>

      {/* Live metrics */}
      <Section icon={<Activity className="h-3.5 w-3.5" />} title="Live metrics">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricBar icon={<Activity className="h-4 w-4 text-accent" />} label="Throughput" value={`${compact(r.systemCapacityRps)} rps`} pct={Math.min(100, (r.systemCapacityRps / Math.max(r.incomingRps, 1)) * 60)} color="#2fd39e" />
          <MetricBar icon={<Timer className="h-4 w-4 text-info" />} label="Latency p50" value={`${Math.round(r.estimatedLatencyMs)} ms`} pct={Math.max(8, 100 - r.estimatedLatencyMs / 3)} color="#4aa3ff" />
          <MetricBar icon={<Users className="h-4 w-4 text-violet" />} label="Concurrent" value={`${compact(traffic.concurrentUsers)}`} pct={Math.min(100, traffic.concurrentUsers / 1000)} color="#7c74ff" />
          <MetricBar icon={<DollarSign className="h-4 w-4 text-amber" />} label="Est. cost" value={`${compactUsd(r.monthlyCostUsd)}`} pct={Math.min(100, r.monthlyCostUsd / 100)} color="#f5b14b" />
        </div>
      </Section>

      {/* Score card */}
      <Section icon={<Scale className="h-3.5 w-3.5" />} title="Architecture score card">
        <ScorePanel scores={r.scores} />
      </Section>

      {/* Recommendations */}
      {r.recommendations.length > 0 && (
        <Section icon={<Activity className="h-3.5 w-3.5" />} title="Recommendations">
          <ul className="space-y-2">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-xl border border-white/[0.05] bg-surface-panel/50 px-3 py-2.5 text-sm text-ink-muted">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {rec}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        {icon} {title}
      </div>
      {children}
    </section>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${
        accent
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-white/[0.08] bg-surface-panel/50 text-ink-muted'
      }`}
    >
      {children}
    </span>
  );
}

function MetricBar({
  icon,
  label,
  value,
  pct,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-panel/50 p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-faint">
        {icon} {label}
      </div>
      <div className="font-mono text-lg font-semibold text-ink">{value}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-line">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
