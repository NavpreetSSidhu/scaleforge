import type { TrafficProfile } from '@/types/domain';

/**
 * Requests per second the architecture must absorb, mirroring the backend
 * engine's formula so the UI can preview load instantly while the authoritative
 * simulation re-runs in the background.
 */
export function incomingRps(traffic: TrafficProfile): number {
  if (traffic.concurrentUsers <= 0 || traffic.requestsPerUserMin <= 0) return 0;
  const peak = traffic.peakTrafficMultiplier > 0 ? traffic.peakTrafficMultiplier : 1;
  return (traffic.concurrentUsers * traffic.requestsPerUserMin) / 60 * peak;
}

/**
 * Scale concurrency by `factor`, clamped to a sane range, keeping the derived
 * daily/monthly figures proportional. Used by the load stepper's ± buttons.
 */
export function scaleConcurrency(traffic: TrafficProfile, factor: number): TrafficProfile {
  const concurrentUsers = Math.max(100, Math.round(traffic.concurrentUsers * factor));
  return {
    ...traffic,
    concurrentUsers,
    dailyActiveUsers: concurrentUsers * 10,
    monthlyActiveUsers: concurrentUsers * 30,
  };
}

/**
 * Fraction (0–1+) of system capacity the incoming load consumes. Values above 1
 * mean the weakest component is saturated.
 */
export function capacityUtilization(incoming: number, systemCapacityRps: number): number {
  if (systemCapacityRps <= 0) return incoming > 0 ? Infinity : 0;
  return incoming / systemCapacityRps;
}
