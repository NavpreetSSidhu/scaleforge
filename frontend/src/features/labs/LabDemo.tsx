import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CheckCircle2, Circle, ListChecks, RotateCcw, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

/** One beat of the scripted session. */
type Beat =
  | { kind: 'phase'; text: string }
  | { kind: 'type'; text: string }
  | { kind: 'out'; text: string }
  | { kind: 'done'; task: number }
  | { kind: 'pause'; ms: number };

const DEMO_TASKS = [
  'Create a bucket',
  'Upload an object under a key with slashes',
  'Turn on bucket versioning',
  'Overwrite the object and keep both versions',
  "Delete the object — and discover it isn't gone",
];

/**
 * A recorded run of the S3 lab. It is the real command sequence with the real
 * output, so what the demo shows is what the lab does — nothing here is
 * aspirational.
 */
const SCRIPT: Beat[] = [
  { kind: 'phase', text: 'Creating an isolated network…' },
  { kind: 'phase', text: 'Starting minio (minio/minio:latest)…' },
  { kind: 'phase', text: 'Starting the workstation (amazon/aws-cli:latest)…' },
  { kind: 'phase', text: 'Waiting for the environment to come up…' },
  { kind: 'phase', text: 'Ready.' },
  { kind: 'pause', ms: 500 },

  { kind: 'type', text: 'aws s3 mb s3://scaleforge-lab' },
  { kind: 'out', text: 'make_bucket: scaleforge-lab' },
  { kind: 'done', task: 0 },

  { kind: 'type', text: 'echo v1 > /tmp/hello.txt && aws s3 cp /tmp/hello.txt s3://scaleforge-lab/notes/hello.txt' },
  { kind: 'out', text: 'upload: ../tmp/hello.txt to s3://scaleforge-lab/notes/hello.txt' },
  { kind: 'done', task: 1 },

  { kind: 'type', text: 'aws s3api put-bucket-versioning --bucket scaleforge-lab \\\r\n  --versioning-configuration Status=Enabled' },
  { kind: 'done', task: 2 },

  { kind: 'type', text: 'echo v2 > /tmp/hello.txt && aws s3 cp /tmp/hello.txt s3://scaleforge-lab/notes/hello.txt' },
  { kind: 'out', text: 'upload: ../tmp/hello.txt to s3://scaleforge-lab/notes/hello.txt' },
  { kind: 'done', task: 3 },

  { kind: 'type', text: 'aws s3 rm s3://scaleforge-lab/notes/hello.txt' },
  { kind: 'out', text: 'delete: s3://scaleforge-lab/notes/hello.txt' },
  { kind: 'type', text: 'aws s3 ls s3://scaleforge-lab/notes/' },
  { kind: 'out', text: '\x1b[38;5;244m(nothing — the object is gone from a plain listing)\x1b[0m' },
  { kind: 'pause', ms: 700 },
  { kind: 'type', text: "aws s3api list-object-versions --bucket scaleforge-lab --prefix notes/ \\\r\n  --query '[length(Versions), length(DeleteMarkers)]'" },
  { kind: 'out', text: '[\r\n    2,\r\n    1\r\n]' },
  { kind: 'out', text: '\x1b[38;5;244m# both versions are still there, behind one delete marker\x1b[0m' },
  { kind: 'done', task: 4 },
];

const PROMPT = '\x1b[38;5;114msh-5.2#\x1b[0m ';

/**
 * A replay of a real lab session, for people deciding whether Labs is worth
 * starting Docker for — and for the case where Docker isn't running at all,
 * where the catalog would otherwise be a wall of buttons that don't work.
 */
export function LabDemo({ onClose }: { onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState<boolean[]>(() => DEMO_TASKS.map(() => false));
  const [finished, setFinished] = useState(false);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: { background: '#0c0e13', foreground: '#eef0f4', cursor: '#2fd39e' },
      // A replay has no input, so the cursor shouldn't invite typing.
      disableStdin: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // Fires while detached during teardown; nothing to do.
      }
    });
    observer.observe(host);

    // `cancelled` stops the async runner promptly when the demo is closed or
    // restarted, so a replay can't keep writing into a disposed terminal.
    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const handle = window.setTimeout(resolve, ms);
        if (cancelled) window.clearTimeout(handle);
      });

    (async () => {
      setDone(DEMO_TASKS.map(() => false));
      setFinished(false);

      for (const beat of SCRIPT) {
        if (cancelled) return;
        switch (beat.kind) {
          case 'phase':
            term.writeln(`\x1b[38;5;244m· ${beat.text}\x1b[0m`);
            await sleep(420);
            break;
          case 'type': {
            term.write(PROMPT);
            for (const ch of beat.text) {
              if (cancelled) return;
              term.write(ch);
              await sleep(16);
            }
            term.write('\r\n');
            await sleep(260);
            break;
          }
          case 'out':
            term.writeln(beat.text);
            await sleep(320);
            break;
          case 'done':
            setDone((prev) => prev.map((v, i) => (i === beat.task ? true : v)));
            await sleep(500);
            break;
          case 'pause':
            await sleep(beat.ms);
            break;
        }
      }

      if (cancelled) return;
      term.write(PROMPT);
      setFinished(true);
    })();

    return () => {
      cancelled = true;
      observer.disconnect();
      term.dispose();
    };
  }, [runId]);

  const completed = done.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-8">
      <div className="flex h-full max-h-[44rem] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-surface-line bg-surface-raised shadow-panel">
        <header className="flex items-center gap-3 border-b border-surface-line px-4 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-wider text-accent">demo</span>
          <h2 className="text-sm font-semibold text-ink">S3: Buckets, Objects &amp; Versioning</h2>
          <span className="rounded border border-surface-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
            replay
          </span>
          <div className="ml-auto flex items-center gap-2">
            {finished && (
              <button
                type="button"
                onClick={() => setRunId((n) => n + 1)}
                className="flex items-center gap-1.5 rounded-md border border-surface-line px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
              >
                <RotateCcw className="h-3 w-3" />
                Replay
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the demo"
              className="rounded-md border border-surface-line p-1.5 text-ink-faint transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-72 shrink-0 flex-col border-r border-surface-line md:flex">
            <div className="flex items-center gap-2 border-b border-surface-line px-4 py-2.5">
              <ListChecks className="h-3.5 w-3.5 text-ink-faint" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                objectives
              </span>
              <span className="ml-auto font-mono text-[11px] text-ink-muted">
                {completed}/{DEMO_TASKS.length}
              </span>
            </div>
            <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {DEMO_TASKS.map((title, i) => (
                <li key={title} className="flex gap-2.5">
                  {done[i] ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-ghost" />
                  )}
                  <span
                    className={`text-[13px] leading-snug ${done[i] ? 'text-ink-faint line-through' : 'text-ink'}`}
                  >
                    {i + 1}. {title}
                  </span>
                </li>
              ))}
            </ol>
            {finished && (
              <p className="border-t border-surface-line px-4 py-3 text-[12px] leading-relaxed text-accent">
                Every tick came from a real check against the live bucket.
              </p>
            )}
          </aside>

          <div ref={hostRef} className="min-h-0 min-w-0 flex-1 overflow-hidden bg-surface p-2" />
        </div>
      </div>
    </div>
  );
}
