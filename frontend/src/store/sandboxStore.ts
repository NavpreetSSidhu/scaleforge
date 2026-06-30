import { create } from 'zustand';
import type { SandboxMeasured, SandboxModel, SandboxPredicted, SandboxProgress } from '@/types/domain';

interface SandboxState {
  /** Sandbox mode is on — the control bar is expanded. */
  mode: boolean;
  running: boolean;
  phase: string | null;
  model: SandboxModel | null;
  progress: SandboxProgress | null;
  measured: SandboxMeasured | null;
  predicted: SandboxPredicted | null;
  error: string | null;

  toggleMode: () => void;
  begin: () => void;
  setPhase: (phase: string, model?: SandboxModel | null) => void;
  setProgress: (progress: SandboxProgress) => void;
  setDone: (measured: SandboxMeasured, predicted: SandboxPredicted) => void;
  setRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
}

const cleared = {
  running: false,
  phase: null as string | null,
  model: null as SandboxModel | null,
  progress: null as SandboxProgress | null,
  measured: null as SandboxMeasured | null,
  predicted: null as SandboxPredicted | null,
  error: null as string | null,
};

/** State for the Real Sandbox load test. Separate from the architecture store —
 *  it only drives + reports a run, never mutates the design. */
export const useSandboxStore = create<SandboxState>((set) => ({
  mode: false,
  ...cleared,

  toggleMode: () => set((s) => (s.mode ? { mode: false, ...cleared } : { mode: true, ...cleared })),
  begin: () => set({ ...cleared, running: true }),
  setPhase: (phase, model) => set((s) => ({ phase, model: model ?? s.model })),
  setProgress: (progress) => set({ progress }),
  setDone: (measured, predicted) => set({ measured, predicted, phase: 'Done' }),
  setRunning: (running) => set({ running }),
  setError: (error) => set({ error }),
}));
