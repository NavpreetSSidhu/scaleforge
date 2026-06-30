import { useCallback, useEffect, useRef } from 'react';
import { runSandboxStream } from '@/lib/api';
import { useArchitectureStore } from '@/store/architectureStore';
import { useSandboxStore } from '@/store/sandboxStore';

/**
 * Drives a Real Sandbox run: stands the design up server-side as a live HTTP
 * service, load-tests it, and streams phase/progress/done events into the sandbox
 * store. The predicted numbers come from the latest simulation result so the
 * panel can show measured vs predicted.
 */
export function useSandbox() {
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async () => {
    const arch = useArchitectureStore.getState();
    const sim = arch.simulationResult;
    useSandboxStore.getState().begin();
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    try {
      await runSandboxStream(
        {
          graph: arch.toGraph(),
          traffic: arch.traffic,
          predicted: {
            capacityRps: sim?.systemCapacityRps ?? 0,
            latencyMs: sim?.estimatedLatencyMs ?? 0,
          },
        },
        (ev) => {
          const s = useSandboxStore.getState();
          if (ev.type === 'phase') s.setPhase(ev.message ?? '', ev.model);
          if (ev.type === 'progress' && ev.progress) s.setProgress(ev.progress);
          if (ev.type === 'done' && ev.measured && ev.predicted) s.setDone(ev.measured, ev.predicted);
          if (ev.type === 'error') s.setError(ev.message ?? 'run failed');
        },
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') useSandboxStore.getState().setError((e as Error).message);
    } finally {
      useSandboxStore.getState().setRunning(false);
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    useSandboxStore.getState().setRunning(false);
  }, []);

  return { start, stop };
}
