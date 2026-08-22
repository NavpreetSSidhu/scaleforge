import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Boxes,
  Clock,
  Cloud,
  Container,
  FlaskConical,
  Radio,
  Database,
  HardDrive,
  Network,
  ShieldAlert,
  Terminal as TerminalIcon,
} from 'lucide-react';
import { Spinner } from '@/components/Spinner';
import { useLabStore } from '@/store/labStore';
import type { Lab, LabTrack } from '@/types/lab';
import { useLabStatus, useStartLab } from './useLabs';
import { LabWorkspace } from './LabWorkspace';
import { LabGuide } from './LabGuide';
import { LabDemo } from './LabDemo';

const TRACK_META: Record<LabTrack, { label: string; icon: React.ReactNode }> = {
  storage: { label: 'Storage', icon: <HardDrive className="h-4 w-4" /> },
  messaging: { label: 'Messaging & Streaming', icon: <Radio className="h-4 w-4" /> },
  'cloud-api': { label: 'Cloud APIs', icon: <Cloud className="h-4 w-4" /> },
  orchestration: { label: 'Orchestration', icon: <Boxes className="h-4 w-4" /> },
  data: { label: 'Data', icon: <Database className="h-4 w-4" /> },
  mesh: { label: 'Service Mesh', icon: <Network className="h-4 w-4" /> },
};

const DIFFICULTY_STYLE: Record<string, string> = {
  beginner: 'text-accent border-accent/30 bg-accent/10',
  intermediate: 'text-info border-info/30 bg-info/10',
  advanced: 'text-pink border-pink/30 bg-pink/10',
};

/**
 * Labs is the container-backed vertical: every lab starts real services on an
 * isolated Docker network and gives you a real shell into them, with objectives
 * checked against live state rather than against your answers.
 */
export function LabsView() {
  const sessionId = useLabStore((s) => s.sessionId);
  const { data: status, isLoading } = useLabStatus();
  const [showDemo, setShowDemo] = useState(false);

  if (sessionId) return <LabWorkspace sessionId={sessionId} />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-2 text-accent">
            <Container className="h-4 w-4" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em]">Labs</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Real infrastructure, running locally</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Each lab starts genuine containers on an isolated network and drops you into a shell
            inside them. Nothing is simulated — you run the real{' '}
            <code className="font-mono text-ink">aws</code>,{' '}
            <code className="font-mono text-ink">kubectl</code> and{' '}
            <code className="font-mono text-ink">psql</code>, and every objective is verified by
            querying the live system.
          </p>
        </header>

        <div className="mb-6">
          <LabGuide onWatchDemo={() => setShowDemo(true)} />
        </div>

        {isLoading ? (
          <div className="flex items-center gap-3 text-sm text-ink-faint">
            <Spinner className="h-4 w-4" /> Checking the lab runtime…
          </div>
        ) : !status?.enabled ? (
          <Notice
            tone="muted"
            title="Labs are turned off"
            body={
              <>
                Labs start real containers, so they are opt-in. Set{' '}
                <code className="font-mono text-ink">LABS_ENABLED=1</code> in the backend
                environment and restart the API to switch them on.
              </>
            }
          />
        ) : !status.docker ? (
          <Notice
            tone="warn"
            title="Docker isn't reachable"
            body={
              <>
                Start Docker Desktop (or your container runtime) and this page will pick it up — the
                lab catalog below is ready to go. In the meantime you can{' '}
                <button
                  type="button"
                  onClick={() => setShowDemo(true)}
                  className="underline underline-offset-2 hover:text-ink"
                >
                  watch a recorded lab session
                </button>
                .
              </>
            }
          />
        ) : null}

        <div className="mt-8 space-y-10">
          {groupByTrack(status?.labs ?? []).map(([track, labs]) => (
            <section key={track}>
              <div className="mb-3 flex items-center gap-2 text-ink-muted">
                {TRACK_META[track].icon}
                <h2 className="text-xs font-semibold uppercase tracking-[0.15em]">
                  {TRACK_META[track].label}
                </h2>
                <div className="h-px flex-1 bg-surface-line" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {labs.map((lab) => (
                  <LabCard key={lab.id} lab={lab} runnable={Boolean(status?.enabled && status.docker)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {showDemo && <LabDemo onClose={() => setShowDemo(false)} />}
    </div>
  );
}

function LabCard({ lab, runnable }: { lab: Lab; runnable: boolean }) {
  const start = useStartLab();
  const starting = start.isPending && start.variables === lab.id;

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col rounded-lg border border-surface-line bg-surface-raised p-5 transition-colors hover:border-white/10"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{lab.title}</h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {lab.fidelity === 'emulated' && (
            <span
              title={lab.fidelityNote}
              className="flex items-center gap-1 rounded border border-violet/30 bg-violet/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-violet"
            >
              <FlaskConical className="h-2.5 w-2.5" />
              emulated
            </span>
          )}
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
              DIFFICULTY_STYLE[lab.difficulty] ?? DIFFICULTY_STYLE.beginner
            }`}
          >
            {lab.difficulty}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{lab.blurb}</p>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {lab.concepts.map((concept) => (
          <li
            key={concept}
            className="rounded bg-surface-panel px-1.5 py-0.5 text-[11px] text-ink-faint"
          >
            {concept}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-3 border-t border-surface-line pt-3 font-mono text-[11px] text-ink-ghost">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {lab.minutes}m
        </span>
        <span>{lab.tasks.length} objectives</span>
        <span className="truncate" title={lab.services.map((s) => s.image).join(', ')}>
          {lab.services.map((s) => s.image).join(' + ')}
        </span>
      </div>

      {!lab.verified && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber">
          <ShieldAlert className="mt-px h-3 w-3 shrink-0" />
          Preview — this environment hasn&apos;t been exercised end to end yet, so expect rough edges.
        </p>
      )}

      <button
        type="button"
        disabled={!runnable || start.isPending}
        onClick={() => start.mutate(lab.id)}
        className="mt-4 flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-base transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-ink-ghost"
      >
        {starting ? <Spinner className="h-3.5 w-3.5" /> : <TerminalIcon className="h-3.5 w-3.5" />}
        {starting ? 'Starting…' : 'Start lab'}
      </button>
    </motion.article>
  );
}

function Notice({
  tone,
  title,
  body,
}: {
  tone: 'muted' | 'warn';
  title: string;
  body: React.ReactNode;
}) {
  const styles =
    tone === 'warn'
      ? 'border-amber/30 bg-amber/[0.07] text-amber'
      : 'border-surface-line bg-surface-raised text-ink-muted';
  return (
    <div className={`rounded-lg border px-4 py-3 ${styles}`}>
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed opacity-90">{body}</p>
    </div>
  );
}

/** Groups labs by track, preserving catalog order within each track. */
function groupByTrack(labs: Lab[]): [LabTrack, Lab[]][] {
  const order: LabTrack[] = ['storage', 'orchestration', 'data', 'messaging', 'cloud-api', 'mesh'];
  return order
    .map((track) => [track, labs.filter((l) => l.track === track)] as [LabTrack, Lab[]])
    .filter(([, group]) => group.length > 0);
}
