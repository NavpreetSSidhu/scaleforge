import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Cloud, Server } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { useArchitectureStore } from '@/store/architectureStore';
import { useSnackbar } from '@/store/snackbarStore';
import type { NodeDefinition, PricingProvider } from '@/types/domain';

/** Cached pricing query, shared with the compare view via the same query key. */
export function usePricing() {
  return useQuery({
    queryKey: ['pricing'],
    queryFn: api.getPricing,
    staleTime: Infinity,
  });
}

export function providerLabel(providers: PricingProvider[] | undefined, id: string): string {
  return providers?.find((p) => p.id === id)?.label ?? id.toUpperCase();
}

/** Compact label for tight spots (toolbar button, metric chips). */
const SHORT_LABELS: Record<string, string> = { aws: 'AWS', gcp: 'GCP', azure: 'Azure' };
export function providerShortLabel(id: string): string {
  return SHORT_LABELS[id] ?? id.toUpperCase();
}

/**
 * Cloud-provider picker. Choosing a provider re-prices the architecture (App's
 * debounced re-sim keys on the provider), so costs and the grade update live.
 * The popover also lists, under "Services", the real managed products the
 * current architecture's components map to on the chosen provider.
 */
export function ProviderSelector() {
  const { provider, setProvider, nodes } = useArchitectureStore();
  const pushSnack = useSnackbar((s) => s.push);
  const { data, isLoading, isError } = usePricing();
  const providers = data?.providers ?? [];
  const [open, setOpen] = useState(false);

  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
    staleTime: Infinity,
  });

  const selected = providers.find((p) => p.id === provider);

  // Distinct component types in the current architecture, with display labels,
  // so the Services list shows each kind once in a stable order.
  const components = useMemo(() => {
    const labelByType = new Map<string, string>(
      (catalog ?? []).map((d: NodeDefinition) => [d.type, d.label]),
    );
    const seen = new Set<string>();
    const out: { type: string; label: string }[] = [];
    for (const n of nodes) {
      if (seen.has(n.type)) continue;
      seen.add(n.type);
      out.push({ type: n.type, label: labelByType.get(n.type) ?? n.type });
    }
    return out;
  }, [nodes, catalog]);

  const choose = (p: PricingProvider) => {
    if (p.id !== provider) {
      setProvider(p.id);
      pushSnack(`Pricing set to ${p.label}`, 'info');
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-white/[0.06] bg-surface-panel/60 px-2.5 py-1.5 text-sm hover:bg-surface-hover"
        title="Cloud pricing provider"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Cloud className="h-3.5 w-3.5 shrink-0 text-info" />
        <span className="font-medium">{providerShortLabel(provider)}</span>
        {isLoading ? (
          <Spinner className="h-3.5 w-3.5 text-ink-faint" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-xl border border-white/[0.06] bg-surface-panel shadow-panel">
          {isError ? (
            <p className="px-3 py-3 text-sm text-danger">Couldn't load providers — is the API running?</p>
          ) : isLoading ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-ink-faint">
              <Spinner /> Loading providers…
            </p>
          ) : (
            <>
              <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Provider
              </div>
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(p);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-surface-hover"
                >
                  <span className="flex items-center gap-2">
                    <Cloud className="h-3.5 w-3.5 text-info" />
                    {p.label}
                  </span>
                  {p.id === provider && <Check className="h-3.5 w-3.5 text-accent" />}
                </button>
              ))}

              <div className="mt-1 border-t border-white/[0.06] px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Services on {selected?.label ?? providerLabel(providers, provider)}
              </div>
              <div className="max-h-60 overflow-y-auto pb-2">
                {components.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-ink-faint">
                    Add components on the canvas to see which {selected?.label ?? 'cloud'} services
                    they map to.
                  </p>
                ) : (
                  components.map((c) => (
                    <div
                      key={c.type}
                      className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-ink-muted">
                        <Server className="h-3 w-3 shrink-0 text-ink-ghost" />
                        <span className="truncate">{c.label}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink">
                        {selected?.services?.[c.type] ?? '—'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
