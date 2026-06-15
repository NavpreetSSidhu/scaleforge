import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useArchitectureStore } from '@/store/architectureStore';
import { useChaosStore } from '@/store/chaosStore';

/**
 * Drives Chaos / Resilience mode: while it's on, debounce-POSTs `/chaos` whenever
 * the graph, traffic, or the injected failure (kills / region outage / spike)
 * changes, and stores the degraded result so the canvas + controls react live.
 * It is read-only/compute (never persisted), so it runs freely for guests too —
 * the server rate-limits it like `/simulate`.
 */
export function useChaosSimulation() {
  const { nodes, edges, traffic, provider } = useArchitectureStore();
  const { mode, killedNodeIds, outageRegion, spikeMultiplier, setResult, setLoading } =
    useChaosStore();

  const run = useMutation({
    mutationFn: () =>
      api.chaos({
        graph: { nodes, edges },
        traffic,
        provider,
        scenario: {
          killedNodeIds,
          outageRegion: outageRegion ?? undefined,
          spikeMultiplier,
        },
      }),
    onSuccess: (res) => {
      setResult(res);
      setLoading(false);
    },
    onError: () => setLoading(false),
  });

  // Re-run whenever any input that affects the failure picture changes.
  const nodeSig = nodes
    .map((n) => `${n.id}:${n.type}:${n.config.replicas}:${n.config.cpu}:${n.config.region ?? ''}`)
    .join('|');
  const key = [
    mode,
    nodeSig,
    edges.map((e) => `${e.source}>${e.target}`).join('|'),
    killedNodeIds.join(','),
    outageRegion ?? '',
    spikeMultiplier,
    traffic.concurrentUsers,
    traffic.requestsPerUserMin,
    traffic.peakTrafficMultiplier,
    provider,
  ].join('~');

  useEffect(() => {
    if (!mode || nodes.length === 0) {
      setResult(null);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(() => run.mutate(), 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
