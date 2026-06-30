import { useCallback, useEffect, useRef } from 'react';
import { runLiveSimStream } from '@/lib/api';
import { useArchitectureStore } from '@/store/architectureStore';
import { useLiveSimStore } from '@/store/liveSimStore';

/**
 * Drives a live discrete-event run: it streams Tick snapshots from the Go
 * simulator into the live-sim store, which the canvas reads to animate queues
 * building, tails stretching, and load shedding. State lives in the store (not
 * the hook) so the canvas overlay and the control bar stay in sync regardless of
 * which one triggered the run.
 */
export function useLiveSim() {
  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight run if the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async () => {
    const arch = useArchitectureStore.getState();
    const live = useLiveSimStore.getState();
    live.begin();
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    try {
      await runLiveSimStream(
        {
          graph: arch.toGraph(),
          traffic: arch.traffic,
          speedFactor: live.speedFactor,
          arrivalScale: live.arrivalScale,
        },
        (t) => useLiveSimStore.getState().pushTick(t),
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        useLiveSimStore.getState().setError((e as Error).message);
      }
    } finally {
      useLiveSimStore.getState().setRunning(false);
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    useLiveSimStore.getState().setRunning(false);
  }, []);

  return { start, stop };
}
