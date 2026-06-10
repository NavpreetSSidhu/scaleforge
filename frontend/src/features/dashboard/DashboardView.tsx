import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Boxes,
  ChevronRight,
  GitFork,
  Globe2,
  LayoutTemplate,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { AchievementsPanel } from '@/features/achievements/AchievementsPanel';
import { compact, timeAgo } from '@/lib/format';
import { templates, type Template } from '@/data/templates';
import { useArchitectureStore } from '@/store/architectureStore';
import { useAuthStore } from '@/store/authStore';
import type { Architecture } from '@/types/domain';

const THUMB_COLORS = ['#2fd39e', '#4aa3ff', '#7c74ff', '#f47bd0', '#f5b14b', '#8fd14f'];

export function DashboardView() {
  const queryClient = useQueryClient();
  const { loadArchitecture, newArchitecture, loadDemo, setName, setNodes, setEdges, setTraffic } =
    useArchitectureStore();
  const user = useAuthStore((s) => s.user);
  const openAuthPrompt = useAuthStore((s) => s.openAuthPrompt);
  const isGuest = user == null;

  const { data: architectures = [], isLoading } = useQuery({
    queryKey: ['architectures'],
    queryFn: api.listArchitectures,
    enabled: !isGuest,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteArchitecture(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['architectures'] }),
  });

  const loadTemplate = (t: Template) => {
    newArchitecture();
    setName(t.name);
    setTraffic(t.traffic);
    setNodes(t.graph.nodes.map((node) => ({ ...node, config: { ...node.config } })));
    setEdges(t.graph.edges.map((edge) => ({ ...edge })));
  };

  const totalNodes = architectures.reduce((sum, a) => sum + a.graph.nodes.length, 0);
  const totalEdges = architectures.reduce((sum, a) => sum + a.graph.edges.length, 0);
  const regionCount = new Set(
    architectures.flatMap((a) => a.graph.nodes.map((n) => n.config.region ?? 'us-east-1')),
  ).size;

  const recent = [...architectures]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        {/* Hero */}
        <div className="mb-8">
          <span className="chip mb-4 inline-flex bg-surface-line text-ink-faint">
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-accent" /> WORKSPACE · ACME CLOUD
          </span>
          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Design systems that <span className="text-accent">scale</span> before you ship them.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Model your architecture, run a load simulation, and get an instant grade across
            performance, reliability, scalability, cost and maintainability.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={loadDemo}
              className="btn-ghost"
            >
              <LayoutTemplate className="h-4 w-4" /> Load demo architecture
            </button>
            <button type="button" onClick={newArchitecture} className="btn-primary">
              <Plus className="h-4 w-4" /> New architecture
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={<Boxes className="h-4 w-4" />} label="Architectures" value={String(architectures.length)} />
          <StatCard icon={<GitFork className="h-4 w-4" />} label="Components" value={compact(totalNodes)} />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Connections" value={compact(totalEdges)} />
          <StatCard icon={<Globe2 className="h-4 w-4" />} label="Regions in use" value={String(regionCount || 1)} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Your architectures */}
          <section className="lg:col-span-2 rounded-2xl border border-white/[0.06] bg-surface/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Your architectures</h2>
              <span className="text-xs text-ink-faint">{architectures.length} saved</span>
            </div>

            {isGuest && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.08] px-4 py-10 text-center">
                <Sparkles className="h-6 w-6 text-ink-ghost" />
                <p className="text-sm text-ink-faint">
                  You're exploring as a guest. Sign in to save architectures to your workspace and
                  sync them across devices.
                </p>
                <button
                  type="button"
                  onClick={() => openAuthPrompt('Sign in to save and sync your architectures.')}
                  className="btn-primary"
                >
                  Sign in to save
                </button>
              </div>
            )}

            {!isGuest && isLoading && <p className="px-1 py-6 text-sm text-ink-faint">Loading…</p>}

            {!isGuest && !isLoading && architectures.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.08] px-4 py-10 text-center">
                <Sparkles className="h-6 w-6 text-ink-ghost" />
                <p className="text-sm text-ink-faint">
                  No saved architectures yet. Build one and hit Save, or start from a template.
                </p>
                <button type="button" onClick={loadDemo} className="btn-ghost">
                  Load demo architecture
                </button>
              </div>
            )}

            <div className="space-y-1">
              {architectures.map((a) => (
                <ArchitectureRow
                  key={a.id}
                  arch={a}
                  onOpen={() => loadArchitecture(a)}
                  onDelete={() => remove.mutate(a.id)}
                />
              ))}
            </div>
          </section>

          {/* Templates + Activity */}
          <div className="space-y-5">
            <section className="rounded-2xl border border-white/[0.06] bg-surface/40 p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">Start from a template</h2>
              <div className="space-y-1.5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => loadTemplate(t)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.05] bg-surface-panel/50 px-3 py-2.5 text-left transition hover:border-white/10 hover:bg-surface-hover"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <LayoutTemplate className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{t.name}</span>
                        <span className="shrink-0 font-mono text-[10px] text-ink-ghost">{t.load}</span>
                      </span>
                      <span className="block truncate text-[11px] text-ink-faint">{t.description}</span>
                    </span>
                    <span className="shrink-0 rounded-md bg-surface-line px-1.5 text-[11px] text-ink-faint">
                      {t.graph.nodes.length}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <AchievementsPanel />

            <section className="rounded-2xl border border-white/[0.06] bg-surface/40 p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">Activity</h2>
              {recent.length === 0 ? (
                <p className="text-xs text-ink-faint">No recent activity.</p>
              ) : (
                <ul className="space-y-3">
                  {recent.map((a) => (
                    <li key={a.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-line/60 text-ink-faint">
                        <Boxes className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 text-sm">
                        <p className="truncate text-ink-muted">
                          <span className="font-medium text-ink">{a.name}</span> saved
                        </p>
                        <p className="text-[11px] text-ink-faint">{timeAgo(a.updatedAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface/40 p-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-line/60 text-ink-faint">
        {icon}
      </span>
      <div className="mt-3 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function ArchitectureRow({
  arch,
  onOpen,
  onDelete,
}: {
  arch: Architecture;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const regions = new Set(arch.graph.nodes.map((n) => n.config.region ?? 'us-east-1'));
  const subtitle = `${arch.graph.edges.length} connections · ${regions.size} region${
    regions.size === 1 ? '' : 's'
  }`;

  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-hover/60">
      <MiniGraph seed={arch.graph.nodes.length} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{arch.name}</span>
          <span className="shrink-0 rounded-md bg-surface-line px-1.5 text-[11px] text-ink-faint">
            {arch.graph.nodes.length} nodes
          </span>
        </div>
        <div className="truncate text-[11px] text-ink-faint">{subtitle}</div>
      </button>
      <span className="hidden text-[11px] text-ink-faint sm:inline">{timeAgo(arch.updatedAt)}</span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${arch.name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-ghost opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${arch.name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Small decorative node-graph thumbnail. */
function MiniGraph({ seed }: { seed: number }) {
  const dots = Math.max(3, Math.min(6, seed));
  const pts = Array.from({ length: dots }, (_, i) => {
    const angle = (Math.PI * 2 * i) / dots - Math.PI / 2;
    return [22 + 13 * Math.cos(angle), 22 + 13 * Math.sin(angle)] as const;
  });
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      className="shrink-0 rounded-lg border border-white/[0.05] bg-surface-panel/60"
    >
      {pts.map(([x, y], i) => {
        const [nx, ny] = pts[(i + 1) % pts.length];
        return <line key={`l${i}`} x1={x} y1={y} x2={nx} y2={ny} stroke="#2a3140" strokeWidth="1" />;
      })}
      {pts.map(([x, y], i) => (
        <circle key={`c${i}`} cx={x} cy={y} r="2.4" fill={THUMB_COLORS[i % THUMB_COLORS.length]} />
      ))}
    </svg>
  );
}
