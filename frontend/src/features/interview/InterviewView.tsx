import { useRef, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Award,
  Lightbulb,
  MessagesSquare,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useArchitectureStore } from '@/store/architectureStore';
import { useInterviewStore } from '@/store/interviewStore';
import { useSnackbar } from '@/store/snackbarStore';
import { ComponentLibrary } from '@/features/builder/ComponentLibrary';
import { Canvas } from '@/features/builder/Canvas';
import { MetricsStrip } from '@/features/metrics/MetricsStrip';
import type { InterviewMessage } from '@/types/domain';

/** Cached capability probe + topic bank for the interviewer. */
function useInterviewStatus() {
  return useQuery({
    queryKey: ['interview-status'],
    queryFn: api.getInterviewStatus,
    staleTime: Infinity,
    retry: false,
  });
}

export function InterviewView() {
  const phase = useInterviewStore((s) => s.phase);

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Left: component palette (real builder library) */}
      <aside className="hidden w-64 shrink-0 border-r border-white/[0.06] lg:block">
        <ComponentLibrary />
      </aside>

      {/* Center: the real design canvas */}
      <ReactFlowProvider>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <Canvas />
          </div>
          <MetricsStrip />
        </main>
      </ReactFlowProvider>

      {/* Right: interviewer panel */}
      <aside className="flex w-[22rem] shrink-0 flex-col border-l border-white/[0.06] bg-surface">
        {phase === 'idle' ? <TopicPicker /> : phase === 'done' ? <GradeReport /> : <ChatPanel />}
      </aside>
    </div>
  );
}

function TopicPicker() {
  const { data, isLoading } = useInterviewStatus();
  const begin = useInterviewStore((s) => s.begin);
  const pushSnack = useSnackbar((s) => s.push);
  const enabled = data?.enabled ?? false;

  const start = useMutation({
    mutationFn: (topic: string) => api.startInterview(topic),
    onSuccess: (session) => begin(session),
    onError: (err) => pushSnack((err as Error).message || 'Could not start interview', 'error'),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-sm font-semibold">
        <MessagesSquare className="h-4 w-4 text-accent" /> Mock Interview
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!enabled && !isLoading && (
          <p className="mb-4 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-[12px] text-amber">
            Set a GROQ_API_KEY on the server to enable the AI interviewer (follow-ups + grading).
          </p>
        )}
        <p className="mb-3 text-[13px] text-ink-muted">
          Pick a prompt. The interviewer watches what you build on the canvas, asks probing
          follow-ups, then grades your design.
        </p>
        <div className="space-y-2">
          {(data?.topics ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!enabled || start.isPending}
              onClick={() => start.mutate(t.id)}
              className="w-full rounded-xl border border-white/[0.06] bg-surface-panel/50 px-3.5 py-3 text-left transition hover:border-accent/30 hover:bg-surface-hover disabled:opacity-40"
            >
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              <div className="mt-0.5 line-clamp-2 text-[12px] text-ink-faint">{t.prompt}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatPanel() {
  const { topic, transcript, followUps, ready, pushUser, pushInterviewer, setGrade, setPhase, reset } =
    useInterviewStore();
  const { nodes, edges, traffic, simulationResult } = useArchitectureStore();
  const sessionId = useInterviewStore((s) => s.sessionId) ?? '';
  const pushSnack = useSnackbar((s) => s.push);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const turn = useMutation({
    mutationFn: (message: string) => {
      const history: InterviewMessage[] = transcript;
      return api.interviewTurn({
        sessionId,
        topic: topic!,
        graph: { nodes, edges },
        traffic,
        result: simulationResult,
        history,
        message,
      });
    },
    onSuccess: (resp) => {
      pushInterviewer(resp.reply, resp.followUps ?? [], resp.done);
      queueMicrotask(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    },
    onError: (err) => pushSnack((err as Error).message || 'Interviewer request failed', 'error'),
  });

  const grade = useMutation({
    mutationFn: () =>
      api.interviewGrade({
        sessionId,
        topic: topic!,
        graph: { nodes, edges },
        traffic,
        result: simulationResult,
        history: transcript,
      }),
    onMutate: () => setPhase('grading'),
    onSuccess: (g) => setGrade(g),
    onError: (err) => {
      setPhase('designing');
      pushSnack((err as Error).message || 'Grading failed', 'error');
    },
  });

  const send = (message: string) => {
    if (!message.trim() || turn.isPending) return;
    pushUser(message);
    setInput('');
    turn.mutate(message);
    queueMicrotask(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessagesSquare className="h-4 w-4 text-accent" /> {topic?.title}
        </div>
        <button
          type="button"
          onClick={reset}
          aria-label="End interview"
          className="text-ink-faint transition hover:text-ink"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {transcript.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl px-3 py-2 text-[13px] ${
              m.role === 'interviewer'
                ? 'border border-white/[0.06] bg-surface-panel/60 text-ink-muted'
                : 'ml-6 bg-accent/15 text-ink'
            }`}
          >
            {m.content}
          </div>
        ))}
        {turn.isPending && (
          <div className="flex items-center gap-2 text-[12px] text-ink-faint">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" /> thinking…
          </div>
        )}
      </div>

      {followUps.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-white/[0.06] px-4 py-2">
          {followUps.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => send(f)}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-surface-panel/50 px-2 py-1 text-[11px] text-ink-faint transition hover:text-ink"
            >
              <Lightbulb className="h-3 w-3" /> {f}
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0 space-y-2 border-t border-white/[0.06] px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Explain your design decision…"
            className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-surface-panel px-3 py-2 text-[13px] text-ink outline-none focus:border-accent/40"
          />
          <button
            type="submit"
            disabled={turn.isPending || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent transition hover:bg-accent/25 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <button
          type="button"
          onClick={() => grade.mutate()}
          disabled={grade.isPending}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            ready
              ? 'bg-accent text-base hover:opacity-90'
              : 'border border-white/10 bg-surface-panel text-ink-muted hover:text-ink'
          } disabled:opacity-40`}
        >
          <Award className="h-4 w-4" />
          {grade.isPending ? 'Grading…' : 'Submit for grading'}
        </button>
      </div>
    </div>
  );
}

/** Colour for a 0–5 rubric score. */
function scoreColor(score: number): string {
  if (score >= 4) return '#2fd39e';
  if (score >= 3) return '#8fd14f';
  if (score >= 2) return '#f5b14b';
  return '#ff6058';
}

function GradeReport() {
  const { topic, grade, reset } = useInterviewStore();
  if (!grade) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Award className="h-4 w-4 text-accent" /> Assessment
        </div>
        <button
          type="button"
          onClick={reset}
          className="btn-ghost !py-1.5 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" /> New
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xl font-bold"
            style={{ borderColor: scoreColor(grade.overall / 20), color: scoreColor(grade.overall / 20) }}
          >
            {grade.overall}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-ink-faint">{topic?.title}</div>
            <p className="text-[13px] text-ink-muted">{grade.summary}</p>
          </div>
        </div>

        <div className="space-y-3">
          {grade.rubric.map((r) => (
            <div key={r.dimension}>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="font-medium text-ink">{r.dimension}</span>
                <span className="font-mono" style={{ color: scoreColor(r.score) }}>
                  {r.score}/5
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-line">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(r.score / 5) * 100}%`, backgroundColor: scoreColor(r.score) }}
                />
              </div>
              {r.comment && <p className="mt-1 text-[12px] text-ink-faint">{r.comment}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
