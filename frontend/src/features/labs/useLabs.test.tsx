import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabSession } from '@/types/lab';
import { useLabStore } from '@/store/labStore';
import { useSnackbar } from '@/store/snackbarStore';

const startLabSession = vi.fn();
const stopLabSession = vi.fn();
const verifyLabSession = vi.fn();
const getLabSession = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    startLabSession: (...a: unknown[]) => startLabSession(...a),
    stopLabSession: (...a: unknown[]) => stopLabSession(...a),
    verifyLabSession: (...a: unknown[]) => verifyLabSession(...a),
    getLabSession: (...a: unknown[]) => getLabSession(...a),
    getLabStatus: vi.fn(),
  },
  labTerminalURL: (id: string) => `ws://test/${id}`,
}));

import { useStartLab, useStopLab, useVerifyLab } from './useLabs';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The snackbar is a queue; the newest entry is what the user just saw. */
function lastSnack(): string {
  const { snacks } = useSnackbar.getState();
  return snacks[snacks.length - 1]?.message ?? '';
}

const session: LabSession = {
  id: 'sess-1',
  labId: 's3-object-storage',
  status: 'starting',
  phase: 'Queued',
  createdAt: new Date().toISOString(),
  expiresAt: new Date().toISOString(),
  endpoints: [],
  tasks: [],
};

describe('useLabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLabStore.setState({ sessionId: null, labId: null, revealedHints: {} });
    useSnackbar.setState({ snacks: [] });
  });

  it('attaches the store to the session it started', async () => {
    startLabSession.mockResolvedValue(session);
    const { result } = renderHook(() => useStartLab(), { wrapper });

    result.current.mutate('s3-object-storage');

    await waitFor(() => expect(useLabStore.getState().sessionId).toBe('sess-1'));
    expect(useLabStore.getState().labId).toBe('s3-object-storage');
  });

  // A refused start (Docker down, too many labs) must not leave the UI attached
  // to a session that does not exist.
  it('leaves the store detached when starting fails', async () => {
    startLabSession.mockRejectedValue(new Error('Docker isn&apos;t reachable'));
    const { result } = renderHook(() => useStartLab(), { wrapper });

    result.current.mutate('s3-object-storage');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useLabStore.getState().sessionId).toBeNull();
  });

  it('detaches the store once the environment is torn down', async () => {
    useLabStore.setState({ sessionId: 'sess-1', labId: 's3-object-storage', revealedHints: {} });
    stopLabSession.mockResolvedValue({ stopped: true });
    const { result } = renderHook(() => useStopLab(), { wrapper });

    result.current.mutate('sess-1');

    await waitFor(() => expect(useLabStore.getState().sessionId).toBeNull());
  });

  it('reports partial progress after verifying', async () => {
    verifyLabSession.mockResolvedValue({ tasks: [], completed: 2, total: 5 });
    const { result } = renderHook(() => useVerifyLab('sess-1'), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(lastSnack()).toMatch(/2 of 5/));
  });

  it('announces the lab as finished when every objective is met', async () => {
    verifyLabSession.mockResolvedValue({ tasks: [], completed: 5, total: 5 });
    const { result } = renderHook(() => useVerifyLab('sess-1'), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(lastSnack()).toMatch(/lab finished/i));
  });
});
