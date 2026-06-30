import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, Wand2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useArchitectureStore } from '@/store/architectureStore';
import { useChaosStore } from '@/store/chaosStore';
import { useReviewStore } from '@/store/reviewStore';
import { useSnackbar } from '@/store/snackbarStore';
import { applyAssistantActions } from '@/features/assistant/applyActions';
import type { ReviewFinding, ReviewSeverity } from '@/types/domain';

/** Cached capability probe — the entrypoint hides when the API has no LLM key. */
export function useReviewEnabled() {
  const { data } = useQuery({
    queryKey: ['review-status'],
    queryFn: api.getReviewStatus,
    staleTime: Infinity,
    retry: false,
  });
  return data?.enabled ?? false;
}

const severityStyle: Record<ReviewSeverity, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: '#ff6058', bg: 'bg-danger/15 text-danger border-danger/30' },
  high: { label: 'High', color: '#f5b14b', bg: 'bg-amber/15 text-amber border-amber/30' },
  medium: { label: 'Medium', color: '#4aa3ff', bg: 'bg-info/15 text-info border-info/30' },
  low: { label: 'Low', color: '#8a93a6', bg: 'bg-white/[0.06] text-ink-faint border-white/10' },
};

/**
 * AI SRE Reviewer drawer. On open it sends the architecture together with the
 * latest measured simulation (and chaos, if Resilience mode produced one) to the
 * reviewer, then renders severity-ranked findings. Each finding's fix reuses the
 * assistant apply pipeline, so "Apply fix" mutates the graph and re-simulates.
 */
export function ReviewDrawer({ onRun }: { onRun: () => void }) {
  const { open, appliedIds, setOpen, markApplied } = useReviewStore();
  const { nodes, edges, traffic, provider, simulationResult } = useArchitectureStore();
  const chaosResult = useChaosStore((s) => s.result);
  const pushSnack = useSnackbar((s) => s.push);

  const { data: catalog = [] } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
    staleTime: Infinity,
  });

  const review = useMutation({
    mutationFn: () =>
      api.review({
        graph: { nodes, edges },
        traffic,
        provider,
        result: simulationResult,
        chaos: chaosResult,
      }),
    onError: (err) => pushSnack((err as Error).message || 'Review failed', 'error'),
  });

  // Kick off a review when the drawer opens (once per open).
  useEffect(() => {
    if (open) review.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const applyFix = (finding: ReviewFinding, id: string) => {
    const { applied, skipped } = applyAssistantActions(finding.actions, catalog);
    markApplied(id);
    if (applied > 0) {
      pushSnack(
        `Applied ${applied} change${applied === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`,
        'success',
      );
      onRun();
    } else {
      pushSnack('No changes could be applied', 'error');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 bg-black/60"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-white/[0.06] bg-surface shadow-panel"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-accent" /> SRE Review
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => review.mutate()}
                  disabled={review.isPending}
                  className="btn-ghost !py-1.5 disabled:opacity-40"
                >
                  <RefreshCw className={`h-4 w-4 ${review.isPending ? 'animate-spin' : ''}`} /> Re-run
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close review"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {review.isPending ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <RefreshCw className="h-7 w-7 animate-spin text-ink-ghost" />
                  <p className="text-sm text-ink-faint">Auditing your architecture against the measured results…</p>
                </div>
              ) : review.data ? (
                <div className="space-y-5">
                  <p className="rounded-xl border border-white/[0.06] bg-surface-panel/50 px-4 py-3 text-sm text-ink-muted">
                    {review.data.summary}
                  </p>

                  {review.data.findings.length === 0 ? (
                    <p className="text-sm text-ink-faint">No issues found — the design looks solid for this load.</p>
                  ) : (
                    review.data.findings.map((f, i) => {
                      const id = `f-${i}`;
                      const style = severityStyle[f.severity] ?? severityStyle.medium;
                      const isApplied = appliedIds.includes(id);
                      return (
                        <article
                          key={id}
                          className="rounded-xl border border-white/[0.06] bg-surface-panel/40 p-4"
                          style={{ borderLeftColor: style.color, borderLeftWidth: 3 }}
                        >
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.bg}`}>
                              {style.label}
                            </span>
                            <span className="text-[11px] uppercase tracking-wider text-ink-faint">{f.category}</span>
                          </div>
                          <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
                          <p className="mt-1 text-sm text-ink-muted">{f.detail}</p>
                          {f.actions.length > 0 && (
                            <button
                              type="button"
                              disabled={isApplied}
                              onClick={() => applyFix(f, id)}
                              className="mt-3 flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent transition hover:bg-accent/25 disabled:opacity-40"
                            >
                              <Wand2 className="h-3.5 w-3.5" />
                              {isApplied ? 'Applied' : `Apply fix (${f.actions.length})`}
                            </button>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <ShieldCheck className="h-8 w-8 text-ink-ghost" />
                  <p className="text-sm text-ink-faint">Run a review to audit your architecture.</p>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
