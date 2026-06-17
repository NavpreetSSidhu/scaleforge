import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { runWorkflowStream } from '@/lib/api';
import { formatMs } from '@/lib/agentflow';
import { useStudioStore } from '@/store/studioStore';
import type { RunEvent } from '@/types/agentflow';

/** Live dry-run panel: streams Server-Sent step events from the Go runtime,
 *  lighting up nodes on the canvas and logging each step + the final answer. */
export function RunPanel() {
  const { graph, input, setInput, setNodeStatus, clearRunStatus } = useStudioStore();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [final, setFinal] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    setEvents([]);
    setFinal('');
    setError('');
    clearRunStatus();
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await runWorkflowStream({ graph: graph(), input }, (ev) => {
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'node_start' && ev.nodeId) setNodeStatus(ev.nodeId, 'running');
        if (ev.type === 'node_finish' && ev.nodeId) setNodeStatus(ev.nodeId, ev.error ? 'error' : 'done');
        if (ev.type === 'done') setFinal(ev.output ?? '');
        if (ev.type === 'error') setError(ev.error ?? 'run failed');
      }, ctrl.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-ghost">Input query</span>
        <textarea
          className="input min-h-[64px] resize-y"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>

      {running ? (
        <button type="button" onClick={stop} className="btn-ghost w-full justify-center">
          <Square className="h-4 w-4" /> Stop
        </button>
      ) : (
        <button type="button" onClick={start} className="btn-primary w-full justify-center">
          <Play className="h-4 w-4" fill="currentColor" /> Run live
        </button>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {events.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {events
            .filter((e) => e.type === 'node_start' || e.type === 'node_finish' || e.type === 'route')
            .map((e, i) => (
              <EventRow key={i} ev={e} />
            ))}
        </div>
      )}

      {final && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-accent">Final answer</div>
          <p className="whitespace-pre-wrap text-xs text-ink">{final}</p>
        </div>
      )}
    </div>
  );
}

function EventRow({ ev }: { ev: RunEvent }) {
  if (ev.type === 'route') {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />
        <span>{ev.label} → branch “{ev.branch}”</span>
      </div>
    );
  }
  const done = ev.type === 'node_finish';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-accent' : 'bg-amber-300 animate-pulse'}`} />
      <span className={done ? 'text-ink-muted' : 'text-ink'}>{ev.label}</span>
      {done && ev.latencyMs != null && (
        <span className="ml-auto font-mono text-[10px] text-ink-ghost">{formatMs(ev.latencyMs)}</span>
      )}
    </div>
  );
}
