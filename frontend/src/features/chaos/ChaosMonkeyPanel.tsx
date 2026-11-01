import { useEffect, useState } from "react";
import { BookOpen, PawPrint } from "lucide-react";
import { useArchitectureStore } from "@/store/architectureStore";
import { MONKEY_TICK_MS, useChaosStore } from "@/store/chaosStore";

const EVENT_COLOR = {
  kill: "#ff6058",
  replace: "#2fd39e",
  outage: "#f5b14b",
  info: "#8a93a6",
};

/** How each idea from Netflix's Chaos Monkey maps onto this simulator. */
const NETFLIX_MAP: [string, string][] = [
  [
    "Randomly terminate production instances",
    'Each tick a biased coin decides; on "kill" one random instance (replica) dies',
  ],
  [
    "Mean time between terminations",
    `A ${MONKEY_TICK_MS / 1000}s tick stands in for a work day`,
  ],
  [
    "Auto Scaling groups replace lost instances",
    "Nodes with autoscaling get their instance back two ticks later",
  ],
  [
    "Steady-state hypothesis",
    "Every check asks: is 100% of traffic still served?",
  ],
  [
    "Outage checker disables the monkey",
    "A full outage leashes the monkey automatically",
  ],
  [
    "Chaos Gorilla / Chaos Kong (zone/region loss)",
    "The region-outage control above",
  ],
];

/**
 * Netflix-style Chaos Monkey: once unleashed it keeps killing single instances
 * at random while the canvas and readout show whether the system still serves
 * traffic. The existing /chaos engine does the maths; this only drives it.
 */
export function ChaosMonkeyPanel() {
  const nodes = useArchitectureStore((s) => s.nodes);
  const { monkeyOn, monkeyLog, checks, steadyChecks, setMonkey, monkeyTick } =
    useChaosStore();
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    if (!monkeyOn) return;
    const handle = window.setInterval(() => monkeyTick(nodes), MONKEY_TICK_MS);
    return () => window.clearInterval(handle);
  }, [monkeyOn, nodes, monkeyTick]);

  return (
    // Capped height so the log and Netflix table never squeeze the canvas away.
    <div className="max-h-40 space-y-1.5 overflow-y-auto border-t border-white/[0.06] pt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <button
          type="button"
          onClick={() => setMonkey(!monkeyOn)}
          aria-pressed={monkeyOn}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            monkeyOn
              ? "bg-danger/20 text-danger"
              : "bg-surface-hover text-ink-faint hover:text-ink"
          }`}
        >
          <PawPrint className="h-3.5 w-3.5" />
          {monkeyOn ? "Leash Chaos Monkey" : "Unleash Chaos Monkey"}
        </button>

        {checks > 0 && (
          <span className="text-ink-faint">
            Steady state held{" "}
            <span className="font-mono text-ink">
              {steadyChecks}/{checks}
            </span>{" "}
            checks
          </span>
        )}

        <button
          type="button"
          onClick={() => setShowMap((v) => !v)}
          className="ml-auto flex items-center gap-1 text-ink-faint transition hover:text-ink"
        >
          <BookOpen className="h-3 w-3" /> How this maps to Netflix
        </button>
      </div>

      {showMap && (
        <div className="rounded-md border border-white/[0.06] bg-surface/60 p-2 text-[11px]">
          <p className="mb-1.5 text-ink-faint">
            Netflix built Chaos Monkey so engineers would design for instance
            failure:{" "}
            <a
              className="text-accent underline"
              href="https://netflixtechblog.com/the-netflix-simian-army-16e57fbab116"
              target="_blank"
              rel="noreferrer"
            >
              The Netflix Simian Army
            </a>{" "}
            ·{" "}
            <a
              className="text-accent underline"
              href="https://netflix.github.io/chaosmonkey/"
              target="_blank"
              rel="noreferrer"
            >
              Chaos Monkey docs
            </a>
          </p>
          <table className="w-full">
            <tbody>
              {NETFLIX_MAP.map(([netflix, here]) => (
                <tr key={netflix} className="align-top">
                  <td className="py-0.5 pr-3 text-ink">{netflix}</td>
                  <td className="py-0.5 text-ink-faint">{here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {monkeyLog.length > 0 && (
        <ol
          className="max-h-24 space-y-0.5 overflow-y-auto font-mono text-[11px]"
          aria-live="polite"
        >
          {monkeyLog.map((e) => (
            <li key={e.id} style={{ color: EVENT_COLOR[e.kind] }}>
              <span className="text-ink-ghost">t{e.tick} </span>
              {e.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
