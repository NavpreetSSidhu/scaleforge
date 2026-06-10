import { create } from 'zustand';

export type SnackbarVariant = 'success' | 'error' | 'info';

export interface Snack {
  id: number;
  message: string;
  variant: SnackbarVariant;
}

interface SnackbarState {
  snacks: Snack[];
  push: (message: string, variant?: SnackbarVariant) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

/**
 * Global, lightweight snackbar (toast) queue. Any component can surface a
 * transient message — `useSnackbar.getState().push('Saved')` — without prop
 * drilling. The <Snackbar> component renders and auto-dismisses them.
 */
export const useSnackbar = create<SnackbarState>((set) => ({
  snacks: [],
  push: (message, variant = 'info') =>
    set((state) => ({ snacks: [...state.snacks, { id: ++seq, message, variant }] })),
  dismiss: (id) => set((state) => ({ snacks: state.snacks.filter((s) => s.id !== id) })),
}));

/** Convenience helper for non-React callers. */
export const snack = (message: string, variant: SnackbarVariant = 'info') =>
  useSnackbar.getState().push(message, variant);
