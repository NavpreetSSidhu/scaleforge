import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSnackbar } from '@/store/snackbarStore';
import { useLabStore } from '@/store/labStore';
import type { LabSession } from '@/types/lab';

/** Capability probe + lab catalog. Docker can come and go, so this stays fresh. */
export function useLabStatus() {
  return useQuery({
    queryKey: ['lab-status'],
    queryFn: api.getLabStatus,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Polls the active session while it provisions. Images have to be pulled and
 * control planes have to converge, so "starting" can legitimately last minutes —
 * the phase string is what makes that wait legible rather than a frozen spinner.
 */
export function useLabSession(sessionId: string | null) {
  const query = useQuery({
    queryKey: ['lab-session', sessionId],
    queryFn: () => api.getLabSession(sessionId as string),
    enabled: Boolean(sessionId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'starting' ? 1500 : false;
    },
  });

  // Surface a provisioning failure once, then let the panel render the detail.
  const status = query.data?.status;
  useEffect(() => {
    if (status === 'failed') {
      useSnackbar.getState().push("The lab environment couldn't start", 'error');
    }
  }, [status]);

  return query;
}

export function useStartLab() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (labId: string) => api.startLabSession(labId),
    onSuccess: (session: LabSession) => {
      useLabStore.getState().setSession(session.id, session.labId);
      queryClient.setQueryData(['lab-session', session.id], session);
      queryClient.invalidateQueries({ queryKey: ['lab-sessions'] });
    },
    onError: (err) => useSnackbar.getState().push((err as Error).message, 'error'),
  });
}

export function useStopLab() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.stopLabSession(sessionId),
    onSuccess: (_result, sessionId) => {
      useLabStore.getState().clearSession();
      queryClient.invalidateQueries({ queryKey: ['lab-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['lab-sessions'] });
      useSnackbar.getState().push('Lab environment torn down', 'success');
    },
    onError: (err) => useSnackbar.getState().push((err as Error).message, 'error'),
  });
}

/** Runs every objective's check against the live environment. */
export function useVerifyLab(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.verifyLabSession(sessionId as string),
    onSuccess: (result) => {
      // Fold the fresh task states into the cached session so the checklist
      // updates without waiting for the next poll.
      queryClient.setQueryData<LabSession | undefined>(['lab-session', sessionId], (prev) =>
        prev ? { ...prev, tasks: result.tasks } : prev,
      );
      const { completed, total } = result;
      useSnackbar
        .getState()
        .push(
          completed === total
            ? `All ${total} objectives complete — lab finished`
            : `${completed} of ${total} objectives complete`,
          completed === total ? 'success' : 'info',
        );
    },
    onError: (err) => useSnackbar.getState().push((err as Error).message, 'error'),
  });
}
