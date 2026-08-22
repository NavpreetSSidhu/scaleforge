import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, Play, Terminal, X } from 'lucide-react';

const GUIDE_DISMISSED_KEY = 'scaleforge.labs.guideDismissed';

/** localStorage is unavailable in private modes and some embedded browsers; the
 *  guide should still render rather than taking the page down with it. */
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(GUIDE_DISMISSED_KEY, '1');
  } catch {
    // Not being able to remember the dismissal is not worth an error.
  }
}

const STEPS = [
  {
    icon: <Play className="h-4 w-4" />,
    title: 'Start a lab',
    body: 'Real containers come up on a network of their own — MinIO, a k3s cluster, Postgres, a Kafka broker. The first run pulls images and takes a few minutes; later runs start in seconds.',
  },
  {
    icon: <Terminal className="h-4 w-4" />,
    title: 'Work in a real shell',
    body: 'The terminal is a genuine shell inside that environment, with the tools already configured — real aws, kubectl, psql, redis-cli, rpk. Explore freely; breaking things is the point.',
  },
  {
    icon: <CheckCircle2 className="h-4 w-4" />,
    title: 'Objectives check the live system',
    body: 'Verify runs real queries against what you actually built — kubectl reading replica counts, psql reading the query plan. Nothing is compared against a stored answer, so there is no way to pass without it being true.',
  },
];

/**
 * First-run explainer for Labs. The model here is unusual enough — real
 * containers, a real shell, objectives checked against live state — that landing
 * on a grid of cards without context undersells what the page does.
 */
export function LabGuide({ onWatchDemo }: { onWatchDemo: () => void }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [expanded, setExpanded] = useState(false);

  const dismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="flex items-center gap-1.5 text-[12px] text-ink-ghost transition-colors hover:text-ink-muted"
      >
        <ChevronDown className="h-3 w-3" />
        How Labs works
      </button>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-lg border border-surface-line bg-surface-raised p-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss the guide"
        className="absolute right-3 top-3 text-ink-ghost transition-colors hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <h2 className="text-sm font-semibold text-ink">How Labs works</h2>

      <ol className="mt-4 grid gap-4 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
              {step.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">
                {i + 1}. {step.title}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                {expanded ? step.body : truncate(step.body)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-surface-line pt-3">
        <button
          type="button"
          onClick={onWatchDemo}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-base transition-colors hover:bg-accent-bright"
        >
          <Play className="h-3.5 w-3.5" />
          Watch a 60-second demo
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[12.5px] text-ink-faint transition-colors hover:text-ink"
        >
          {expanded ? 'Show less' : 'Tell me more'}
        </button>
        <span className="ml-auto text-[12px] text-ink-ghost">
          Labs are torn down automatically — nothing is left running on your machine.
        </span>
      </div>
    </motion.section>
  );
}

function truncate(body: string): string {
  const cut = body.indexOf('. ');
  return cut > 0 ? body.slice(0, cut + 1) : body;
}
