import { create } from 'zustand';

/**
 * Which lab session the Labs view is currently attached to.
 *
 * Kept in a store rather than component state so the session survives navigating
 * away to the builder and back — the containers are still running, and losing
 * the handle to them in a re-render would strand them until the TTL reaper ran.
 */
interface LabState {
  sessionId: string | null;
  labId: string | null;
  /** Task IDs whose hint the user has chosen to reveal. */
  revealedHints: Record<string, string>;
  setSession: (sessionId: string, labId: string) => void;
  clearSession: () => void;
  revealHint: (taskId: string, hint: string) => void;
}

export const useLabStore = create<LabState>((set) => ({
  sessionId: null,
  labId: null,
  revealedHints: {},
  setSession: (sessionId, labId) => set({ sessionId, labId, revealedHints: {} }),
  clearSession: () => set({ sessionId: null, labId: null, revealedHints: {} }),
  revealHint: (taskId, hint) =>
    set((s) => ({ revealedHints: { ...s.revealedHints, [taskId]: hint } })),
}));
