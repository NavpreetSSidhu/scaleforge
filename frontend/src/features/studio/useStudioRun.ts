import { useCallback, useEffect, useRef } from 'react';
import { runWorkflowStream } from '@/lib/api';
import { useStudioStore } from '@/store/studioStore';

/**
 * Drives the Agent Studio live dry-run from the shared top-level Run button (the
 * agentflow analog of the infra "Run Simulation"). It streams Server-Sent step
 * events from the Go runtime into the studio store — lighting up nodes on the
 * canvas (runStatus) and feeding the run-output strip (runEvents/runFinal). State
 * lives in the store rather than the hook so both the canvas and the strip read
 * it regardless of which view triggered the run.
 */
export function useStudioRun() {
  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight run if the app unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async () => {
    const st = useStudioStore.getState();
    st.beginRun();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await runWorkflowStream(
        { graph: st.graph(), input: st.input },
        (ev) => {
          const s = useStudioStore.getState();
          s.pushRunEvent(ev);
          if (ev.type === 'node_start' && ev.nodeId) s.setNodeStatus(ev.nodeId, 'running');
          if (ev.type === 'node_finish' && ev.nodeId) s.setNodeStatus(ev.nodeId, ev.error ? 'error' : 'done');
          if (ev.type === 'done') s.setRunFinal(ev.output ?? '');
          if (ev.type === 'error') s.setRunError(ev.error ?? 'run failed');
        },
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') useStudioStore.getState().setRunError((e as Error).message);
    } finally {
      useStudioStore.getState().setRunning(false);
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    useStudioStore.getState().setRunning(false);
  }, []);

  return { start, stop };
}
