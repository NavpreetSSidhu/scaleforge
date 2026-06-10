import { beforeEach, describe, expect, it } from 'vitest';
import { GUEST_SIM_LIMIT, useAuthStore, type AuthUser } from './authStore';

const user: AuthUser = {
  id: 'u1',
  email: 'a@b.com',
  name: 'Ada',
  createdAt: '2026-06-10T00:00:00Z',
};

describe('authStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({
      token: null,
      user: null,
      ready: false,
      guestRuns: 0,
      promptOpen: false,
      promptReason: null,
    });
  });

  it('starts unauthenticated with a full guest allowance', () => {
    const s = useAuthStore.getState();
    expect(s.isAuthenticated()).toBe(false);
    expect(s.guestRunsLeft()).toBe(GUEST_SIM_LIMIT);
  });

  it('setSession authenticates and persists the token', () => {
    useAuthStore.getState().setSession('tok-123', user);
    const s = useAuthStore.getState();
    expect(s.isAuthenticated()).toBe(true);
    expect(s.token).toBe('tok-123');
    expect(window.localStorage.getItem('scaleforge:token')).toBe('tok-123');
  });

  it('meters guest runs and counts down remaining', () => {
    const { registerGuestRun } = useAuthStore.getState();
    registerGuestRun();
    registerGuestRun();
    expect(useAuthStore.getState().guestRuns).toBe(2);
    expect(useAuthStore.getState().guestRunsLeft()).toBe(GUEST_SIM_LIMIT - 2);
  });

  it('does not meter runs once authenticated', () => {
    useAuthStore.getState().setSession('tok', user);
    useAuthStore.getState().registerGuestRun();
    expect(useAuthStore.getState().guestRuns).toBe(0);
  });

  it('logout clears the session and token', () => {
    useAuthStore.getState().setSession('tok', user);
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.token).toBeNull();
    expect(window.localStorage.getItem('scaleforge:token')).toBeNull();
  });

  it('opens and closes the auth prompt with a reason', () => {
    useAuthStore.getState().openAuthPrompt('please sign in');
    expect(useAuthStore.getState().promptOpen).toBe(true);
    expect(useAuthStore.getState().promptReason).toBe('please sign in');
    useAuthStore.getState().closeAuthPrompt();
    expect(useAuthStore.getState().promptOpen).toBe(false);
  });
});
