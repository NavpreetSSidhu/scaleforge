import { beforeEach, describe, expect, it } from "vitest";
import { useChaosStore } from "./chaosStore";
import type { ChaosResult, GraphNode } from "@/types/domain";

const s = () => useChaosStore.getState();

const fakeResult = {
  available: false,
  resilienceScore: 12,
} as unknown as ChaosResult;

describe("chaosStore", () => {
  beforeEach(() => {
    // Force a clean, mode-off state before each test.
    if (s().mode) s().toggleMode();
    s().reset();
  });

  it("toggleMode turns resilience mode on, then clears everything on the way off", () => {
    s().toggleMode();
    expect(s().mode).toBe(true);

    s().toggleKill("db");
    s().setSpikeMultiplier(5);
    s().setResult(fakeResult);

    s().toggleMode();
    expect(s().mode).toBe(false);
    expect(s().killedNodeIds).toEqual([]);
    expect(s().spikeMultiplier).toBe(1);
    expect(s().result).toBeNull();
  });

  it("toggleKill adds and removes a node id", () => {
    s().toggleKill("api");
    expect(s().killedNodeIds).toEqual(["api"]);
    s().toggleKill("api");
    expect(s().killedNodeIds).toEqual([]);
  });

  it("reset clears the injected failure but stays in mode", () => {
    s().toggleMode();
    s().toggleKill("db");
    s().setOutageRegion("us-east-1");
    s().setResult(fakeResult);

    s().reset();
    expect(s().mode).toBe(true);
    expect(s().killedNodeIds).toEqual([]);
    expect(s().outageRegion).toBeNull();
    expect(s().result).toBeNull();
  });

  describe("Chaos Monkey", () => {
    const node = (id: string, replicas: number, autoscaling = false) =>
      ({
        id,
        label: id,
        type: "api_service",
        position: { x: 0, y: 0 },
        config: { cpu: 2, memory: 4, replicas, autoscaling },
      }) as GraphNode;

    it("kills one instance per tick and an autoscaling group replaces it", () => {
      const nodes = [node("api", 3, true)];
      s().setMonkey(true);
      s().monkeyTick(nodes, () => 0); // coin lands on kill, picks api
      expect(s().killedInstances).toEqual({ api: 1 });

      s().monkeyTick(nodes, () => 0.99); // no kill
      s().monkeyTick(nodes, () => 0.99); // heal due (tick 1 + 2)
      expect(s().killedInstances).toEqual({});
      expect(s().monkeyLog[0].kind).toBe("replace");
    });

    it("never kills more instances than a node has", () => {
      const nodes = [node("db", 1)];
      s().setMonkey(true);
      s().monkeyTick(nodes, () => 0);
      s().monkeyTick(nodes, () => 0);
      expect(s().killedInstances).toEqual({ db: 1 });
    });

    it("outage checker leashes the monkey", () => {
      s().setMonkey(true);
      s().recordCheck({ available: true, availability: 1 } as ChaosResult);
      s().recordCheck(fakeResult);
      expect(s().monkeyOn).toBe(false);
      expect([s().checks, s().steadyChecks]).toEqual([2, 1]);
      expect(s().monkeyLog[0].kind).toBe("outage");
    });
  });
});
