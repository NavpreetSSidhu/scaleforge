import { describe, expect, it } from 'vitest';
import { capacityUtilization, incomingRps, scaleConcurrency } from './traffic';
import type { TrafficProfile } from '@/types/domain';

const base: TrafficProfile = {
  dailyActiveUsers: 50000,
  monthlyActiveUsers: 150000,
  concurrentUsers: 5000,
  requestsPerUserMin: 2,
  peakTrafficMultiplier: 1.5,
};

describe('incomingRps', () => {
  it('mirrors the backend formula (concurrent * rpm / 60 * peak)', () => {
    expect(incomingRps(base)).toBe((5000 * 2) / 60 * 1.5);
  });

  it('defaults a missing peak multiplier to 1x', () => {
    expect(incomingRps({ ...base, peakTrafficMultiplier: 0 })).toBe((5000 * 2) / 60);
  });

  it('returns 0 when there is no traffic', () => {
    expect(incomingRps({ ...base, concurrentUsers: 0 })).toBe(0);
    expect(incomingRps({ ...base, requestsPerUserMin: 0 })).toBe(0);
  });
});

describe('scaleConcurrency', () => {
  it('scales concurrency and keeps daily/monthly proportional', () => {
    const scaled = scaleConcurrency(base, 2);
    expect(scaled.concurrentUsers).toBe(10000);
    expect(scaled.dailyActiveUsers).toBe(100000);
    expect(scaled.monthlyActiveUsers).toBe(300000);
  });

  it('never drops below a 100-user floor', () => {
    expect(scaleConcurrency({ ...base, concurrentUsers: 120 }, 0.1).concurrentUsers).toBe(100);
  });
});

describe('capacityUtilization', () => {
  it('expresses incoming load as a fraction of capacity', () => {
    expect(capacityUtilization(750, 1500)).toBe(0.5);
    expect(capacityUtilization(3000, 1500)).toBe(2);
  });

  it('reports infinite utilization against zero capacity', () => {
    expect(capacityUtilization(10, 0)).toBe(Infinity);
    expect(capacityUtilization(0, 0)).toBe(0);
  });
});
