import { create } from 'zustand';
import type { ChaosResult } from '@/types/domain';

interface ChaosState {
  /** Resilience mode is on — the canvas turns into a failure-injection surface. */
  mode: boolean;
  killedNodeIds: string[];
  outageRegion: string | null;
  /** Traffic spike applied on top of the profile (1 = none). */
  spikeMultiplier: number;
  result: ChaosResult | null;
  loading: boolean;

  toggleMode: () => void;
  toggleKill: (nodeId: string) => void;
  setOutageRegion: (region: string | null) => void;
  setSpikeMultiplier: (multiplier: number) => void;
  setResult: (result: ChaosResult | null) => void;
  setLoading: (loading: boolean) => void;
  /** Clear the injected failure but stay in resilience mode. */
  reset: () => void;
}

const cleared = {
  killedNodeIds: [] as string[],
  outageRegion: null as string | null,
  spikeMultiplier: 1,
  result: null as ChaosResult | null,
  loading: false,
};

/**
 * Ephemeral state for Chaos / Resilience mode. Kept separate from the
 * architecture store so the real builder graph is never mutated — chaos only
 * *describes* what to fail and renders the degraded result over the canvas.
 */
export const useChaosStore = create<ChaosState>((set) => ({
  mode: false,
  ...cleared,

  toggleMode: () =>
    set((s) => (s.mode ? { mode: false, ...cleared } : { mode: true })),

  toggleKill: (nodeId) =>
    set((s) => ({
      killedNodeIds: s.killedNodeIds.includes(nodeId)
        ? s.killedNodeIds.filter((id) => id !== nodeId)
        : [...s.killedNodeIds, nodeId],
    })),

  setOutageRegion: (outageRegion) => set({ outageRegion }),
  setSpikeMultiplier: (spikeMultiplier) => set({ spikeMultiplier }),
  setResult: (result) => set({ result }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ ...cleared }),
}));
