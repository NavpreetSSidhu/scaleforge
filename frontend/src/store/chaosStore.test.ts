import { beforeEach, describe, expect, it } from 'vitest';
import { useChaosStore } from './chaosStore';
import type { ChaosResult } from '@/types/domain';

const s = () => useChaosStore.getState();

const fakeResult = { available: false, resilienceScore: 12 } as unknown as ChaosResult;

describe('chaosStore', () => {
  beforeEach(() => {
    // Force a clean, mode-off state before each test.
    if (s().mode) s().toggleMode();
    s().reset();
  });

  it('toggleMode turns resilience mode on, then clears everything on the way off', () => {
    s().toggleMode();
    expect(s().mode).toBe(true);

    s().toggleKill('db');
    s().setSpikeMultiplier(5);
    s().setResult(fakeResult);

    s().toggleMode();
    expect(s().mode).toBe(false);
    expect(s().killedNodeIds).toEqual([]);
    expect(s().spikeMultiplier).toBe(1);
    expect(s().result).toBeNull();
  });

  it('toggleKill adds and removes a node id', () => {
    s().toggleKill('api');
    expect(s().killedNodeIds).toEqual(['api']);
    s().toggleKill('api');
    expect(s().killedNodeIds).toEqual([]);
  });

  it('reset clears the injected failure but stays in mode', () => {
    s().toggleMode();
    s().toggleKill('db');
    s().setOutageRegion('us-east-1');
    s().setResult(fakeResult);

    s().reset();
    expect(s().mode).toBe(true);
    expect(s().killedNodeIds).toEqual([]);
    expect(s().outageRegion).toBeNull();
    expect(s().result).toBeNull();
  });
});
