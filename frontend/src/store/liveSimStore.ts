import { create } from 'zustand';
import type { LiveTick } from '@/types/domain';

/** How many recent ticks to retain for the latency sparkline. */
const HISTORY_CAP = 160;

interface LiveSimState {
  /** Live Mode is on — the canvas animates a streamed discrete-event run. */
  mode: boolean;
  /** A run is currently streaming. */
  running: boolean;
  /** The most recent tick (drives the canvas overlay + readouts). */
  latest: LiveTick | null;
  /** Recent ticks, oldest→newest, capped, for the sparkline. */
  history: LiveTick[];
  error: string | null;

  /** Tuning knobs sent with the next run. */
  speedFactor: number;
  arrivalScale: number;

  toggleMode: () => void;
  begin: () => void;
  pushTick: (tick: LiveTick) => void;
  setRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  setSpeedFactor: (factor: number) => void;
  setArrivalScale: (scale: number) => void;
  reset: () => void;
}

const cleared = {
  running: false,
  latest: null as LiveTick | null,
  history: [] as LiveTick[],
  error: null as string | null,
};

/**
 * Ephemeral state for Live Mode (the discrete-event simulator). Kept separate
 * from the architecture store — like chaosStore — so the real builder graph is
 * never mutated: Live Mode only renders a streamed run over the canvas.
 */
export const useLiveSimStore = create<LiveSimState>((set) => ({
  mode: false,
  speedFactor: 4,
  arrivalScale: 1,
  ...cleared,

  toggleMode: () =>
    set((s) => (s.mode ? { mode: false, ...cleared } : { mode: true, ...cleared })),

  begin: () => set({ running: true, error: null, latest: null, history: [] }),

  pushTick: (tick) =>
    set((s) => ({
      latest: tick,
      history: [...s.history, tick].slice(-HISTORY_CAP),
    })),

  setRunning: (running) => set({ running }),
  setError: (error) => set({ error }),
  setSpeedFactor: (speedFactor) => set({ speedFactor }),
  setArrivalScale: (arrivalScale) => set({ arrivalScale }),
  reset: () => set({ ...cleared }),
}));
