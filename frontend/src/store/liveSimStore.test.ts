import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveSimStore } from './liveSimStore';
import type { LiveTick } from '@/types/domain';

function tick(partial: Partial<LiveTick> = {}): LiveTick {
  return {
    timeMs: 0,
    stations: [],
    incomingRps: 0,
    servedRps: 0,
    droppedRps: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    p999: 0,
    meanLatencyMs: 0,
    completed: 0,
    failed: 0,
    done: false,
    ...partial,
  };
}

describe('liveSimStore', () => {
  beforeEach(() => {
    useLiveSimStore.setState({
      mode: false,
      running: false,
      latest: null,
      history: [],
      error: null,
      speedFactor: 4,
      arrivalScale: 1,
    });
  });

  it('toggleMode clears transient state on entry and exit', () => {
    useLiveSimStore.getState().pushTick(tick({ completed: 5 }));
    useLiveSimStore.getState().toggleMode();
    expect(useLiveSimStore.getState().mode).toBe(true);
    expect(useLiveSimStore.getState().latest).toBeNull();
    expect(useLiveSimStore.getState().history).toHaveLength(0);

    useLiveSimStore.getState().pushTick(tick({ completed: 9 }));
    useLiveSimStore.getState().toggleMode();
    expect(useLiveSimStore.getState().mode).toBe(false);
    expect(useLiveSimStore.getState().latest).toBeNull();
  });

  it('begin resets the run and pushTick accumulates the latest + history', () => {
    useLiveSimStore.getState().begin();
    expect(useLiveSimStore.getState().running).toBe(true);

    useLiveSimStore.getState().pushTick(tick({ timeMs: 100, completed: 1 }));
    useLiveSimStore.getState().pushTick(tick({ timeMs: 200, completed: 3 }));
    const s = useLiveSimStore.getState();
    expect(s.latest?.completed).toBe(3);
    expect(s.history).toHaveLength(2);
  });

  it('history is capped', () => {
    for (let i = 0; i < 300; i++) useLiveSimStore.getState().pushTick(tick({ timeMs: i }));
    expect(useLiveSimStore.getState().history.length).toBeLessThanOrEqual(160);
    // Newest tick is retained.
    expect(useLiveSimStore.getState().latest?.timeMs).toBe(299);
  });
});
