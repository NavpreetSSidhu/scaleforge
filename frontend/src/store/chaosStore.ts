import { create } from 'zustand';
import type { ChaosResult, GraphNode } from '@/types/domain';

/**
 * Chaos Monkey tuning, after Netflix's (github.com/Netflix/chaosmonkey): each
 * tick it flips a biased coin and, on "kill", terminates one random instance.
 * Ticks stand in for Netflix's work days so a demo plays out in seconds.
 */
export const MONKEY_TICK_MS = 2500;
export const MONKEY_KILL_PROBABILITY = 0.6;
/** Ticks until an autoscaling group replaces a terminated instance. */
export const MONKEY_HEAL_TICKS = 2;

export interface MonkeyEvent {
  id: number;
  tick: number;
  kind: 'kill' | 'replace' | 'outage' | 'info';
  text: string;
}

interface ChaosState {
  /** Resilience mode is on — the canvas turns into a failure-injection surface. */
  mode: boolean;
  killedNodeIds: string[];
  outageRegion: string | null;
  /** Traffic spike applied on top of the profile (1 = none). */
  spikeMultiplier: number;
  result: ChaosResult | null;
  loading: boolean;

  /** Chaos Monkey: single instances terminated per node (nodeId -> count). */
  killedInstances: Record<string, number>;
  monkeyOn: boolean;
  monkeyTickCount: number;
  /** Pending autoscaling replacements. */
  heals: { nodeId: string; dueTick: number }[];
  monkeyLog: MonkeyEvent[];
  /** Steady-state hypothesis: checks run vs checks that served all traffic. */
  checks: number;
  steadyChecks: number;

  toggleMode: () => void;
  toggleKill: (nodeId: string) => void;
  setOutageRegion: (region: string | null) => void;
  setSpikeMultiplier: (multiplier: number) => void;
  setResult: (result: ChaosResult | null) => void;
  setLoading: (loading: boolean) => void;
  /** Clear the injected failure but stay in resilience mode. */
  reset: () => void;
  setMonkey: (on: boolean, reason?: string) => void;
  /** One Chaos Monkey round: replace due instances, then maybe kill one. */
  monkeyTick: (nodes: GraphNode[], rng?: () => number) => void;
  /** Record a steady-state check; the outage checker leashes the monkey on failure. */
  recordCheck: (result: ChaosResult) => void;
}

const cleared = {
  killedNodeIds: [] as string[],
  outageRegion: null as string | null,
  spikeMultiplier: 1,
  result: null as ChaosResult | null,
  loading: false,
  killedInstances: {} as Record<string, number>,
  monkeyOn: false,
  monkeyTickCount: 0,
  heals: [] as { nodeId: string; dueTick: number }[],
  monkeyLog: [] as MonkeyEvent[],
  checks: 0,
  steadyChecks: 0,
};

let eventId = 0;
const event = (tick: number, kind: MonkeyEvent['kind'], text: string): MonkeyEvent => ({
  id: ++eventId,
  tick,
  kind,
  text,
});
/** Newest first, capped so a long run doesn't grow without bound. */
const pushLog = (log: MonkeyEvent[], ...events: MonkeyEvent[]) =>
  [...events.reverse(), ...log].slice(0, 50);

/**
 * Ephemeral state for Chaos / Resilience mode. Kept separate from the
 * architecture store so the real builder graph is never mutated — chaos only
 * *describes* what to fail and renders the degraded result over the canvas.
 */
export const useChaosStore = create<ChaosState>((set) => ({
  mode: false,
  ...cleared,

  toggleMode: () => set((s) => (s.mode ? { mode: false, ...cleared } : { mode: true })),

  toggleKill: (nodeId) =>
    set((s) => ({
      killedNodeIds: s.killedNodeIds.includes(nodeId)
        ? s.killedNodeIds.filter((id) => id !== nodeId)
        : [...s.killedNodeIds, nodeId],
    })),

  setOutageRegion: (outageRegion) => set({ outageRegion }),
  setSpikeMultiplier: (spikeMultiplier) => set({ spikeMultiplier }),
  setResult: (result) => set({ result }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ ...cleared }),

  setMonkey: (on, reason) =>
    set((s) => ({
      monkeyOn: on,
      monkeyLog: pushLog(
        s.monkeyLog,
        event(
          s.monkeyTickCount,
          on ? 'info' : reason ? 'outage' : 'info',
          reason ?? (on ? 'Chaos Monkey unleashed' : 'Chaos Monkey leashed'),
        ),
      ),
    })),

  monkeyTick: (nodes, rng = Math.random) =>
    set((s) => {
      if (!s.monkeyOn) return {};
      const tick = s.monkeyTickCount + 1;
      const killed = { ...s.killedInstances };
      const events: MonkeyEvent[] = [];
      const byId = new Map(nodes.map((n) => [n.id, n]));

      // Autoscaling groups replace terminated instances (Netflix's ASGs did the healing).
      const heals = s.heals.filter((h) => {
        if (h.dueTick > tick) return true;
        if (killed[h.nodeId] > 0) {
          killed[h.nodeId] -= 1;
          if (killed[h.nodeId] === 0) delete killed[h.nodeId];
          events.push(
            event(
              tick,
              'replace',
              `ASG replaced an instance of ${byId.get(h.nodeId)?.label ?? h.nodeId}`,
            ),
          );
        }
        return false;
      });

      if (rng() < MONKEY_KILL_PROBABILITY) {
        // Netflix's "minimum time between terminations": a group still waiting
        // for its replacement isn't hit again until it has recovered.
        const alive = nodes.filter(
          (n) =>
            !s.killedNodeIds.includes(n.id) &&
            !heals.some((h) => h.nodeId === n.id) &&
            Math.max(n.config.replicas, 1) - (killed[n.id] ?? 0) > 0,
        );
        if (alive.length > 0) {
          const victim = alive[Math.floor(rng() * alive.length)];
          killed[victim.id] = (killed[victim.id] ?? 0) + 1;
          const left = Math.max(victim.config.replicas, 1) - killed[victim.id];
          events.push(
            event(
              tick,
              'kill',
              `Terminated 1 instance of ${victim.label} — ${left} of ${Math.max(victim.config.replicas, 1)} left`,
            ),
          );
          if (victim.config.autoscaling)
            heals.push({
              nodeId: victim.id,
              dueTick: tick + MONKEY_HEAL_TICKS,
            });
        }
      }

      return {
        monkeyTickCount: tick,
        killedInstances: killed,
        heals,
        monkeyLog: events.length ? pushLog(s.monkeyLog, ...events) : s.monkeyLog,
      };
    }),

  recordCheck: (result) =>
    set((s) => {
      if (!s.monkeyOn) return {};
      const steady = result.available && result.availability >= 0.999;
      const next = {
        checks: s.checks + 1,
        steadyChecks: s.steadyChecks + (steady ? 1 : 0),
      };
      if (result.available) return next;
      // Outage checker: Netflix auto-disables Chaos Monkey during an ongoing outage.
      return {
        ...next,
        monkeyOn: false,
        monkeyLog: pushLog(
          s.monkeyLog,
          event(s.monkeyTickCount, 'outage', 'Outage detected — outage checker leashed the monkey'),
        ),
      };
    }),
}));
