import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Code2, Crown, GitCompareArrows, Layers, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { isWinner, metricRows, providerScenarios, runtimeScenarios, winTally } from '@/lib/compare';
import { usePricing, providerLabel } from '@/features/shell/ProviderSelector';
import { useRuntimes } from '@/features/shell/useRuntimes';
import { useArchitectureStore } from '@/store/architectureStore';
import { useAuthStore } from '@/store/authStore';
import type { CompareScenario, Comparison, PricingProvider, Runtime } from '@/types/domain';

type Mode = 'providers' | 'architectures' | 'runtimes';

export function CompareView() {
  const { name, provider, nodes, edges, traffic, setView } = useArchitectureStore();
  const user = useAuthStore((s) => s.user);
  const isGuest = user == null;
  const { data: pricing } = usePricing();
  const providers = pricing?.providers ?? [];
  const { data: runtimeCatalog } = useRuntimes();
  const runtimes = runtimeCatalog?.runtimes ?? [];

  const [mode, setMode] = useState<Mode>('providers');
  const [challengerId, setChallengerId] = useState<string | null>(null);

  const { data: architectures = [] } = useQuery({
    queryKey: ['architectures'],
    queryFn: api.listArchitectures,
    enabled: !isGuest,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
    staleTime: Infinity,
  });

  // The set of compute component types — only these get a runtime stamped.
  const computeTypes = useMemo(
    () => new Set(catalog.filter((d) => d.category === 'compute').map((d) => d.type)),
    [catalog],
  );

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const canvasEmpty = nodes.length === 0;
  const hasComputeNode = nodes.some((n) => computeTypes.has(n.type));

  // Build the scenario list for the active mode.
  const scenarios = useMemo<CompareScenario[]>(() => {
    if (canvasEmpty) return [];
    if (mode === 'providers') {
      return providers.length > 0 ? providerScenarios(graph, traffic, providers) : [];
    }
    if (mode === 'runtimes') {
      return runtimes.length > 0
        ? runtimeScenarios(graph, traffic, provider, runtimes, computeTypes)
        : [];
    }
    // architectures mode: current canvas vs a chosen saved architecture. Both
    // are priced on the selected provider AND run under the *current* traffic
    // profile, so the comparison is apples-to-apples (architecture is the only
    // variable, not the load).
    const current: CompareScenario = {
      label: `${name || 'Current'} (current)`,
      provider,
      graph,
      traffic,
    };
    const challenger = architectures.find((a) => a.id === challengerId);
    if (!challenger) return [current];
    return [current, { label: challenger.name, provider, graph: challenger.graph, traffic }];
  }, [
    canvasEmpty,
    mode,
    providers,
    runtimes,
    computeTypes,
    graph,
    traffic,
    name,
    provider,
    architectures,
    challengerId,
  ]);

  const compare = useMutation({
    mutationFn: (payload: CompareScenario[]) => api.compare({ scenarios: payload }),
  });

  // Auto-run whenever a valid (≥2 scenario) set is ready.
  const runnable = scenarios.length >= 2;
  const scenarioKey = JSON.stringify(scenarios.map((s) => [s.label, s.provider]));
  useEffect(() => {
    if (runnable) compare.mutate(scenarios);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioKey, runnable]);

  const result = compare.data;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <header className="mb-6">
          <span className="chip mb-3 inline-flex bg-surface-line text-ink-faint">
            <GitCompareArrows className="mr-1.5 h-3 w-3" /> COMPARISON
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Compare architectures</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Run the same load profile across cloud providers, or pit two architectures against each
            other. Winners are highlighted per metric — the simulation engine is the single source
            of truth.
          </p>
        </header>

        {/* Mode switch */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <ModeButton
            active={mode === 'providers'}
            onClick={() => setMode('providers')}
            icon={<Layers className="h-4 w-4" />}
            label="Across cloud providers"
          />
          <ModeButton
            active={mode === 'runtimes'}
            onClick={() => setMode('runtimes')}
            icon={<Code2 className="h-4 w-4" />}
            label="Across runtimes"
          />
          <ModeButton
            active={mode === 'architectures'}
            onClick={() => setMode('architectures')}
            icon={<GitCompareArrows className="h-4 w-4" />}
            label="Two architectures"
          />

          {mode === 'architectures' && !isGuest && architectures.length > 0 && (
            <select
              value={challengerId ?? ''}
              onChange={(e) => setChallengerId(e.target.value || null)}
              className="ml-1 rounded-lg border border-white/[0.08] bg-surface-panel/60 px-2.5 py-1.5 text-sm text-ink"
            >
              <option value="">Compare against…</option>
              {architectures.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* States */}
        {canvasEmpty ? (
          <EmptyState
            title="Nothing to compare yet"
            body="Build or load an architecture in the Builder, then come back to compare it."
            action={
              <button type="button" onClick={() => setView('builder')} className="btn-primary">
                Go to Builder
              </button>
            }
          />
        ) : mode === 'runtimes' && !hasComputeNode ? (
          <EmptyState
            title="Add a compute component"
            body="Runtime comparison varies the language your services run in (Go, Rust, Node…). Add a compute component — an API service, microservice, worker, etc. — to compare runtimes."
            action={
              <button type="button" onClick={() => setView('builder')} className="btn-primary">
                Go to Builder
              </button>
            }
          />
        ) : mode === 'architectures' && isGuest ? (
          <EmptyState
            title="Sign in to compare two architectures"
            body="Comparing against a saved architecture needs an account. You can still compare across cloud providers as a guest."
            action={
              <button type="button" onClick={() => setMode('providers')} className="btn-ghost">
                Compare providers instead
              </button>
            }
          />
        ) : mode === 'architectures' && !runnable ? (
          <EmptyState
            title="Pick a second architecture"
            body={
              architectures.length === 0
                ? 'You have no other saved architectures yet. Save one from the Builder to compare against it.'
                : 'Choose a saved architecture from the dropdown above to compare against your current canvas.'
            }
          />
        ) : compare.isPending ? (
          <p className="px-1 py-10 text-sm text-ink-faint">Running comparison…</p>
        ) : compare.isError ? (
          <p className="px-1 py-10 text-sm text-danger">
            Comparison failed: {(compare.error as Error).message}
          </p>
        ) : result ? (
          <>
            <p className="mb-3 text-xs text-ink-faint">
              {mode === 'providers'
                ? 'Same architecture and traffic, priced against each provider’s curated rates. Identical metrics (a tie) are left unhighlighted — only genuine differences win.'
                : mode === 'runtimes'
                  ? `Same architecture and traffic on ${providerLabel(
                      providers,
                      provider,
                    )}; only the language/runtime of your compute components changes, so throughput, latency, and the scores that depend on them shift per runtime.`
                  : `Both architectures run under the current traffic profile and priced on ${providerLabel(
                      providers,
                      provider,
                    )}, so the architecture is the only variable.`}
            </p>
            <ComparisonMatrix comparison={result} providers={providers} />
            {mode === 'runtimes' && (
              <RuntimeLegend runtimes={runtimes} provenance={runtimeCatalog?.provenance} />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ComparisonMatrix({
  comparison,
  providers,
}: {
  comparison: Comparison;
  providers: PricingProvider[];
}) {
  const tally = winTally(comparison);
  const topWins = Math.max(...tally, 0);

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-surface/40">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="sticky left-0 z-10 bg-surface/40 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-faint">
              Metric
            </th>
            {comparison.scenarios.map((s, i) => {
              const best = tally[i] === topWins && topWins > 0;
              return (
                <th key={i} className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-ink">{s.label}</span>
                    {best && <Crown className="h-3.5 w-3.5 text-amber" />}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] font-normal text-ink-faint">
                    {s.provider && <span>{providerLabel(providers, s.provider)}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Trophy className="h-3 w-3" /> {tally[i]} win{tally[i] === 1 ? '' : 's'}
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {metricRows.map((row) => (
            <tr key={row.key} className="border-b border-white/[0.04] last:border-0">
              <td className="sticky left-0 z-10 bg-surface/40 px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-ink-muted">
                  {row.label}
                  {row.lowerIsBetter ? (
                    <ArrowDown className="h-3 w-3 text-ink-ghost" />
                  ) : (
                    <ArrowUp className="h-3 w-3 text-ink-ghost" />
                  )}
                </span>
              </td>
              {comparison.scenarios.map((s, i) => {
                const win = isWinner(comparison, row.key, i);
                return (
                  <td key={i} className="px-4 py-2.5">
                    <span
                      className={
                        win
                          ? 'inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2 py-0.5 font-mono font-semibold text-accent'
                          : 'font-mono text-ink'
                      }
                    >
                      {row.format(s.result)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
          {/* Bottleneck row (informational, no winner). */}
          <tr>
            <td className="sticky left-0 z-10 bg-surface/40 px-4 py-2.5 text-ink-muted">Bottleneck</td>
            {comparison.scenarios.map((s, i) => (
              <td key={i} className="px-4 py-2.5 text-ink-faint">
                {s.result.bottleneck ? s.result.bottleneck.label : '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RuntimeLegend({
  runtimes,
  provenance,
}: {
  runtimes: Runtime[];
  provenance?: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-surface/40 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        <Code2 className="h-3.5 w-3.5" /> Runtime coefficients (relative to Go = 1.0)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="px-2 py-1 text-left font-medium">Runtime</th>
              <th className="px-2 py-1 text-right font-medium">Throughput</th>
              <th className="px-2 py-1 text-right font-medium">Latency</th>
              <th className="px-2 py-1 text-right font-medium">Memory</th>
            </tr>
          </thead>
          <tbody>
            {runtimes.map((r) => (
              <tr key={r.id} className="border-t border-white/[0.04]">
                <td className="px-2 py-1.5 text-ink">{r.label}</td>
                <td className="px-2 py-1.5 text-right font-mono text-ink-muted">
                  {r.throughputFactor.toFixed(2)}×
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-ink-muted">
                  {r.latencyFactor.toFixed(2)}×
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-ink-muted">
                  {r.memoryFactor.toFixed(2)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {provenance && <p className="mt-3 text-[11px] leading-relaxed text-ink-ghost">{provenance}</p>}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? 'bg-surface-panel text-ink shadow-sm ring-1 ring-white/[0.06]'
          : 'text-ink-faint hover:text-ink-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/[0.08] px-4 py-16 text-center">
      <GitCompareArrows className="h-7 w-7 text-ink-ghost" />
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-sm text-ink-faint">{body}</p>
      {action}
    </div>
  );
}
