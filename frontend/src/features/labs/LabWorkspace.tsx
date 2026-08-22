import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  CircleDot,
  ExternalLink,
  Lightbulb,
  ListChecks,
  Square,
  Timer,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { useLabStore } from '@/store/labStore';
import type { Lab, LabSession, LabTask, LabTaskState } from '@/types/lab';
import { useLabSession, useLabStatus, useStopLab, useVerifyLab } from './useLabs';
import { LabTerminal } from './LabTerminal';

/** The running-lab screen: objectives on the left, a real shell on the right. */
export function LabWorkspace({ sessionId }: { sessionId: string }) {
  const { data: session, isLoading } = useLabSession(sessionId);
  const { data: status } = useLabStatus();
  const clearSession = useLabStore((s) => s.clearSession);
  const stop = useStopLab();

  const lab = status?.labs.find((l) => l.id === session?.labId);

  if (isLoading || !session) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 text-sm text-ink-faint">
        <Spinner className="h-4 w-4" /> Loading the lab…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-surface-line px-4 py-2.5">
        <button
          type="button"
          onClick={clearSession}
          className="flex items-center gap-1.5 text-[13px] text-ink-faint transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Labs
        </button>
        <h1 className="text-sm font-semibold text-ink">{lab?.title ?? session.labId}</h1>
        <StatusPill session={session} />
        <div className="ml-auto flex items-center gap-3">
          <Endpoints session={session} />
          {session.status === 'ready' && <ExpiryTimer expiresAt={session.expiresAt} />}
          <button
            type="button"
            disabled={stop.isPending || session.status === 'stopped'}
            onClick={() => stop.mutate(sessionId)}
            className="flex items-center gap-1.5 rounded-md border border-surface-line px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
          >
            {stop.isPending ? <Spinner className="h-3 w-3" /> : <Square className="h-3 w-3" />}
            Tear down
          </button>
        </div>
      </header>

      {session.status === 'starting' && <Provisioning session={session} />}
      {session.status === 'failed' && <Failed session={session} />}
      {session.status === 'stopped' && (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-ink-faint">
          This environment has been torn down. Its containers and network are gone.
        </div>
      )}

      {session.status === 'ready' && lab && (
        <div className="flex min-h-0 flex-1">
          <TaskPanel lab={lab} session={session} sessionId={sessionId} />
          <div className="flex min-w-0 flex-1 flex-col border-l border-surface-line">
            <LabTerminal sessionId={sessionId} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Provisioning is a genuinely long wait on a cold cache — images have to come
 * down and control planes have to converge — so the phase line is shown verbatim
 * rather than hidden behind an indeterminate spinner.
 */
function Provisioning({ session }: { session: LabSession }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <Spinner className="h-5 w-5" />
      <p className="text-sm text-ink">{session.phase}</p>
      <p className="max-w-md text-[13px] leading-relaxed text-ink-faint">
        The first run of a lab pulls its images, which can take a few minutes. Later runs start in
        seconds.
      </p>
    </div>
  );
}

function Failed({ session }: { session: LabSession }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-sm font-semibold text-danger">The environment couldn&apos;t start</h2>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-danger/20 bg-danger/[0.06] p-3 font-mono text-[12px] leading-relaxed text-ink-muted">
          {session.error}
        </pre>
      </div>
    </div>
  );
}

function TaskPanel({
  lab,
  session,
  sessionId,
}: {
  lab: Lab;
  session: LabSession;
  sessionId: string;
}) {
  const verify = useVerifyLab(sessionId);
  const taskStates = session.tasks ?? [];
  const states = new Map(taskStates.map((t) => [t.id, t]));
  const completed = taskStates.filter((t) => t.done).length;

  return (
    <aside className="flex w-[26rem] shrink-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-surface-line px-4 py-2.5">
        <ListChecks className="h-3.5 w-3.5 text-ink-faint" />
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
          objectives
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-muted">
          {completed}/{lab.tasks.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <ol className="space-y-4">
          {lab.tasks.map((task, i) => (
            <TaskRow
              key={task.id}
              index={i}
              task={task}
              state={states.get(task.id)}
              sessionId={sessionId}
            />
          ))}
        </ol>
      </div>

      <div className="border-t border-surface-line p-3">
        <button
          type="button"
          disabled={verify.isPending}
          onClick={() => verify.mutate()}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-base transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-ink-ghost"
        >
          {verify.isPending ? <Spinner className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {verify.isPending ? 'Checking the live environment…' : 'Verify objectives'}
        </button>
      </div>
    </aside>
  );
}

function TaskRow({
  index,
  task,
  state,
  sessionId,
}: {
  index: number;
  task: LabTask;
  state?: LabTaskState;
  sessionId: string;
}) {
  const revealHint = useLabStore((s) => s.revealHint);
  const hint = useLabStore((s) => s.revealedHints[task.id]);
  const [loadingHint, setLoadingHint] = useState(false);
  const done = state?.done ?? false;
  const checked = Boolean(state?.checkedAt);

  const showHint = async () => {
    setLoadingHint(true);
    try {
      const { hint: text } = await api.getLabHint(sessionId, task.id);
      revealHint(task.id, text);
    } finally {
      setLoadingHint(false);
    }
  };

  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0">
        {done ? (
          <CheckCircle2 className="h-4 w-4 text-accent" />
        ) : checked ? (
          <CircleDot className="h-4 w-4 text-amber" />
        ) : (
          <Circle className="h-4 w-4 text-ink-ghost" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-medium ${done ? 'text-ink-faint line-through' : 'text-ink'}`}>
          {index + 1}. {task.title}
        </p>

        <div className="prose-labs mt-1 text-[13px] leading-relaxed text-ink-muted">
          <ReactMarkdown>{task.brief}</ReactMarkdown>
        </div>

        {state?.message && (
          <p className={`mt-1.5 text-[12px] ${done ? 'text-accent' : 'text-amber'}`}>
            {state.message}
          </p>
        )}

        {hint ? (
          <pre className="mt-2 overflow-x-auto rounded border border-surface-line bg-surface p-2 font-mono text-[11.5px] leading-relaxed text-ink-muted">
            {hint}
          </pre>
        ) : (
          !done && (
            <button
              type="button"
              onClick={showHint}
              disabled={loadingHint}
              className="mt-1.5 flex items-center gap-1 text-[12px] text-ink-ghost transition-colors hover:text-amber"
            >
              <Lightbulb className="h-3 w-3" />
              {loadingHint ? 'Loading…' : 'Show the command'}
            </button>
          )
        )}
      </div>
    </li>
  );
}

function StatusPill({ session }: { session: LabSession }) {
  const map: Record<LabSession['status'], string> = {
    starting: 'border-amber/30 bg-amber/10 text-amber',
    ready: 'border-accent/30 bg-accent/10 text-accent',
    failed: 'border-danger/30 bg-danger/10 text-danger',
    stopped: 'border-surface-line bg-surface-panel text-ink-faint',
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${map[session.status]}`}>
      {session.status}
    </span>
  );
}

function Endpoints({ session }: { session: LabSession }) {
  const endpoints = session.endpoints ?? [];
  if (endpoints.length === 0) return null;
  return (
    <div className="hidden items-center gap-2 xl:flex">
      {endpoints.map((ep) =>
        ep.url ? (
          <a
            key={ep.label}
            href={ep.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded border border-surface-line px-1.5 py-0.5 font-mono text-[11px] text-ink-muted transition-colors hover:border-accent/40 hover:text-accent"
          >
            {ep.label}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : (
          <span
            key={ep.label}
            className="rounded border border-surface-line px-1.5 py-0.5 font-mono text-[11px] text-ink-faint"
            title={ep.address}
          >
            {ep.label} {ep.address}
          </span>
        ),
      )}
    </div>
  );
}

/**
 * Labs hold real containers, so they expire. Showing the remaining time makes the
 * teardown expected rather than a shell that mysteriously dies mid-lesson.
 */
function ExpiryTimer({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() => remaining(expiresAt));
  useEffect(() => {
    const handle = window.setInterval(() => setLeft(remaining(expiresAt)), 30_000);
    return () => window.clearInterval(handle);
  }, [expiresAt]);

  return (
    <span
      className="flex items-center gap-1 font-mono text-[11px] text-ink-ghost"
      title="Lab environments are torn down automatically when they expire"
    >
      <Timer className="h-3 w-3" />
      {left}
    </span>
  );
}

function remaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  return `${Math.max(1, Math.round(ms / 60_000))}m left`;
}
