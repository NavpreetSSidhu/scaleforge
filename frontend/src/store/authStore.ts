import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

/** How many simulations a signed-out guest may run before being prompted to log in. */
export const GUEST_SIM_LIMIT = 5;

const TOKEN_KEY = 'scaleforge:token';
const GUEST_RUNS_KEY = 'scaleforge:guestRuns';

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore unavailable storage */
  }
}

function readGuestRuns(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return Number(window.localStorage.getItem(GUEST_RUNS_KEY)) || 0;
  } catch {
    return 0;
  }
}

function persistGuestRuns(n: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUEST_RUNS_KEY, String(n));
  } catch {
    /* ignore */
  }
}

/** Why the auth prompt was opened, so the modal can explain the gated action. */
export type AuthReason = string | null;

/** Which tab the auth modal should open on. */
export type AuthMode = 'login' | 'signup';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** False until the initial /auth/me hydration settles, to avoid UI flicker. */
  ready: boolean;
  guestRuns: number;
  promptOpen: boolean;
  promptReason: AuthReason;
  promptMode: AuthMode;

  setSession: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser | null) => void;
  setReady: (ready: boolean) => void;
  logout: () => void;
  registerGuestRun: () => void;

  openAuthPrompt: (reason?: AuthReason, mode?: AuthMode) => void;
  closeAuthPrompt: () => void;

  // Derived helpers
  isAuthenticated: () => boolean;
  guestRunsLeft: () => number;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: readToken(),
  user: null,
  ready: false,
  guestRuns: readGuestRuns(),
  promptOpen: false,
  promptReason: null,
  promptMode: 'login',

  setSession: (token, user) => {
    persistToken(token);
    set({ token, user, ready: true, promptOpen: false, promptReason: null });
  },

  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),

  logout: () => {
    persistToken(null);
    set({ token: null, user: null });
  },

  registerGuestRun: () =>
    set((state) => {
      if (state.user) return state; // only guests are metered
      const guestRuns = state.guestRuns + 1;
      persistGuestRuns(guestRuns);
      return { guestRuns };
    }),

  openAuthPrompt: (reason = null, mode = 'login') =>
    set({ promptOpen: true, promptReason: reason, promptMode: mode }),
  closeAuthPrompt: () => set({ promptOpen: false, promptReason: null }),

  isAuthenticated: () => get().user != null,
  guestRunsLeft: () => Math.max(0, GUEST_SIM_LIMIT - get().guestRuns),
}));
