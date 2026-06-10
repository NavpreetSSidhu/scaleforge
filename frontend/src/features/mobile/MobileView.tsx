import { Activity, DollarSign, Grid3x3, LogIn, Play, Target, Timer, Users, Zap } from 'lucide-react';
import { compact, compactUsd } from '@/lib/format';
import { gradeMeta, overallScore } from '@/lib/score';
import { useArchitectureStore } from '@/store/architectureStore';
import { useAuthStore } from '@/store/authStore';
import { initialsFor } from '@/features/auth/ProfileMenu';

interface MobileViewProps {
  onRun: () => void;
  isRunning: boolean;
}

export function MobileView({ onRun, isRunning }: MobileViewProps) {
  const { simulationResult: r, traffic, environment, view, setView } = useArchitectureStore();
  const { user, openAuthPrompt, logout, guestRunsLeft } = useAuthStore();
  const isGuest = user == null;

  const score = r ? overallScore(r.scores) : 0;
  const meta = gradeMeta(r?.scores.overallGrade ?? 'F');
  const overloaded = r?.nodeHealth.filter((h) => h.status === 'bottleneck') ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-base">
      <div className="flex justify-center px-4 py-8">
        {/* Phone frame */}
        <div className="w-full max-w-[380px] overflow-hidden rounded-[2.4rem] border border-white/10 bg-surface-panel/80 shadow-panel ring-1 ring-black/40">
          <div className="px-5 pb-6 pt-4">
            {/* Status bar */}
            <div className="mb-4 flex items-center justify-between text-[11px] text-ink-faint">
              <span className="font-medium">9:41</span>
              <span className="flex items-center gap-1.5">
                <Activity className="h-3 w-3" /> 100%
              </span>
            </div>

            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <span className="text-base font-bold">
                Scale<span className="text-accent">Forge</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="chip bg-accent/15 text-accent">
                  <span className="mr-1 h-1.5 w-1.5 rounded-full bg-accent" /> {environment}
                </span>
                {isGuest ? (
                  <button
                    type="button"
                    onClick={() => openAuthPrompt('Sign in to save and sync your architectures.')}
                    className="flex items-center gap-1 rounded-lg bg-surface-line/70 px-2 py-1 text-xs text-ink-muted transition hover:text-ink"
                  >
                    <LogIn className="h-3.5 w-3.5" /> Sign in
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={logout}
                    title={`${user?.email} — tap to log out`}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-info to-violet text-[11px] font-bold text-white"
                  >
                    {initialsFor(user)}
                  </button>
                )}
              </div>
            </div>

            {/* Grade card */}
            <div
              className="mb-3 flex items-center gap-4 rounded-2xl border p-4"
              style={{ borderColor: `${meta.color}33`, backgroundColor: `${meta.color}0f` }}
            >
              <GradeRing grade={r?.scores.overallGrade ?? '—'} score={score} color={meta.color} />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-faint">Arch. grade</div>
                <div className="font-mono text-3xl font-bold text-ink">
                  {r ? score : '—'}
                  <span className="text-base text-ink-faint">/100</span>
                </div>
                <div className="text-sm font-medium" style={{ color: meta.color }}>
                  {r ? meta.label : 'Run a simulation'}
                </div>
              </div>
            </div>

            {/* Metric grid */}
            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <MobileMetric icon={<Zap className="h-4 w-4 text-accent" />} label="Throughput" value={r ? compact(r.systemCapacityRps) : '—'} unit="rps" />
              <MobileMetric icon={<Timer className="h-4 w-4 text-info" />} label="Latency" value={r ? String(Math.round(r.estimatedLatencyMs)) : '—'} unit="ms p50" />
              <MobileMetric icon={<Users className="h-4 w-4 text-violet" />} label="Concurrent" value={compact(traffic.concurrentUsers)} unit="users" />
              <MobileMetric icon={<DollarSign className="h-4 w-4 text-amber" />} label="Cost" value={r ? compactUsd(r.monthlyCostUsd) : '—'} unit="/mo" />
            </div>

            {/* Bottlenecks */}
            <div className="mb-4 rounded-2xl border border-white/[0.06] bg-surface/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Bottlenecks</span>
                <span
                  className={`rounded-full px-2 text-[11px] ${
                    overloaded.length ? 'bg-danger/15 text-danger' : 'bg-surface-line text-ink-faint'
                  }`}
                >
                  {overloaded.length}
                </span>
              </div>
              {overloaded.length === 0 ? (
                <p className="text-xs text-ink-faint">
                  {r ? 'No saturated components 🎉' : 'Run a simulation to detect bottlenecks.'}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {overloaded.map((h) => {
                    const util = h.capacity > 0 ? Math.round((r!.incomingRps / h.capacity) * 100) : 0;
                    return (
                      <li key={h.nodeId} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-ink-muted">
                          <span className="h-2 w-2 rounded-full bg-danger" /> {h.label}
                        </span>
                        <span className="font-mono text-danger">{util}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Re-run */}
            <button
              type="button"
              onClick={onRun}
              disabled={isRunning}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              <Play className="h-4 w-4" fill="currentColor" />
              {isRunning ? 'Running…' : 'Re-run simulation'}
            </button>
            {isGuest && (
              <p className="mt-2 text-center text-[11px] text-ink-faint">
                {guestRunsLeft()} free guest run{guestRunsLeft() === 1 ? '' : 's'} left ·{' '}
                <button
                  type="button"
                  onClick={() => openAuthPrompt('Sign in for unlimited simulations.')}
                  className="font-medium text-accent hover:underline"
                >
                  sign in
                </button>{' '}
                for unlimited
              </p>
            )}
          </div>

          {/* Bottom nav */}
          <div className="flex items-center justify-around border-t border-white/[0.06] bg-surface/60 py-2 text-ink-faint">
            <NavButton icon={<Grid3x3 className="h-5 w-5" />} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
            <NavButton icon={<Zap className="h-5 w-5" />} label="Simulate" active={view === 'mobile'} onClick={() => setView('mobile')} />
            <NavButton icon={<Target className="h-5 w-5" />} label="Builder" active={view === 'builder'} onClick={() => setView('builder')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active}
      className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[9px] font-medium uppercase tracking-wider transition ${
        active ? 'text-accent' : 'text-ink-faint hover:text-ink-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function GradeRing({ grade, score, color }: { grade: string; score: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
      <circle cx="38" cy="38" r={r} fill="none" stroke="#232936" strokeWidth="5" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * score) / 100}
      />
      <text
        x="38"
        y="39"
        textAnchor="middle"
        dominantBaseline="middle"
        className="rotate-90 font-bold"
        transform="rotate(90 38 38)"
        style={{ fill: color, fontSize: '22px' }}
      >
        {grade}
      </text>
    </svg>
  );
}

function MobileMetric({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface/50 p-3.5">
      {icon}
      <div className="mt-3 text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="font-mono text-xl font-bold text-ink">
        {value}
        <span className="ml-1 text-[11px] font-normal text-ink-faint">{unit}</span>
      </div>
    </div>
  );
}
