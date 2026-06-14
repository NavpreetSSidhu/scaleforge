import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, MessageCircleQuestion, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useLearnStore, type TutorChatEntry, type TutorTab } from '@/store/learnStore';
import { useSnackbar } from '@/store/snackbarStore';
import { courseBySlug } from '@/data/courses';
import { Spinner } from '@/components/Spinner';
import type { TutorMessage } from '@/types/domain';
import { Markdown } from './Markdown';

/** Message length cap — mirrored by the backend (`binding:"max=2000"`). */
const MAX_CHARS = 2000;

/** Cached capability probe — the tutor AI entrypoints hide when the API has no key. */
export function useTutorEnabled() {
  const { data } = useQuery({
    queryKey: ['tutor-status'],
    queryFn: api.getTutorStatus,
    staleTime: Infinity,
    retry: false,
  });
  return data?.enabled ?? false;
}

export function TutorDrawer() {
  const {
    drawerOpen,
    closeDrawer,
    tab,
    setTab,
    teacherMessages,
    qnaMessages,
    pushMessage,
    resetChat,
    activeCourse,
    stepIndex,
  } = useLearnStore();
  const pushSnack = useSnackbar((s) => s.push);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the composer up to a max height so wrapping doesn't hide earlier text.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const course = activeCourse ? courseBySlug(activeCourse) : undefined;
  const step = course?.steps[stepIndex];
  const focusComponent = step?.focusNodeId
    ? course?.graph.nodes.find((n) => n.id === step.focusNodeId)?.type
    : undefined;

  const messages = tab === 'teacher' ? teacherMessages : qnaMessages;

  const ask = useMutation({
    mutationFn: (text: string) => {
      const history: TutorMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
      if (tab === 'teacher') {
        return api.tutorExplain({
          courseTitle: course?.title ?? '',
          stepTitle: step?.title ?? '',
          stepBody: step?.body ?? '',
          focusComponent,
          question: text,
          history,
        });
      }
      return api.tutorAsk({ courseTitle: course?.title, question: text, history });
    },
    onSuccess: (resp) => pushMessage(tab, 'assistant', resp.reply),
    onError: (err) => pushSnack((err as Error).message || 'Tutor request failed', 'error'),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, ask.isPending]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || ask.isPending) return;
    pushMessage(tab, 'user', message);
    setInput('');
    ask.mutate(message);
  };

  // The Teacher can elaborate on the current step with no typed question.
  const explainStep = () => {
    if (ask.isPending || !step) return;
    pushMessage('teacher', 'user', `Explain "${step.title}" in more depth`);
    ask.mutate('');
  };

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
            className="fixed inset-0 z-50 bg-black/60"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/[0.06] bg-surface shadow-panel"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <div className="flex rounded-lg border border-white/[0.06] bg-surface-panel/60 p-0.5">
                <TabButton
                  active={tab === 'teacher'}
                  onClick={() => setTab('teacher')}
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  label="Teacher"
                />
                <TabButton
                  active={tab === 'qna'}
                  onClick={() => setTab('qna')}
                  icon={<MessageCircleQuestion className="h-3.5 w-3.5" />}
                  label="Q&A"
                />
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => resetChat(tab)}
                    aria-label="Clear conversation"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close tutor"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <Welcome
                  tab={tab}
                  stepTitle={step?.title}
                  onExplain={explainStep}
                  onPick={send}
                />
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => (
                    <ChatBubble key={m.id} entry={m} />
                  ))}
                  {ask.isPending && (
                    <div className="flex items-center gap-2 text-sm text-ink-faint">
                      <Spinner className="h-4 w-4 text-accent" /> Thinking…
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-white/[0.06] p-3">
              <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-surface-panel/60 px-3 py-2 focus-within:border-accent/40">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={1}
                  maxLength={MAX_CHARS}
                  placeholder={
                    tab === 'teacher'
                      ? 'Ask the teacher about this step…'
                      : 'Ask any system-design question…'
                  }
                  className="max-h-32 flex-1 resize-none overflow-y-auto bg-transparent text-sm text-ink outline-none placeholder:text-ink-ghost"
                />
                {input.length >= MAX_CHARS - 200 && (
                  <span
                    className={`shrink-0 self-end pb-0.5 font-mono text-[10px] ${
                      input.length >= MAX_CHARS ? 'text-danger' : 'text-ink-ghost'
                    }`}
                  >
                    {input.length}/{MAX_CHARS}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => send(input)}
                  disabled={!input.trim() || ask.isPending}
                  aria-label="Send"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-black transition disabled:opacity-40"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
              {input.length >= MAX_CHARS && (
                <p className="mt-1.5 px-1 text-[10px] text-danger">
                  Character limit reached ({MAX_CHARS}).
                </p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
        active ? 'bg-accent/15 text-accent' : 'text-ink-faint hover:text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Welcome({
  tab,
  stepTitle,
  onExplain,
  onPick,
}: {
  tab: TutorTab;
  stepTitle?: string;
  onExplain: () => void;
  onPick: (text: string) => void;
}) {
  const qnaSuggestions = [
    'What is the difference between a token bucket and a leaky bucket?',
    'When should I shard a database?',
    'Why use a message queue instead of calling a service directly?',
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        {tab === 'teacher' ? <Sparkles className="h-6 w-6" /> : <MessageCircleQuestion className="h-6 w-6" />}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-ink">
          {tab === 'teacher' ? 'Your AI Teacher' : 'Ask anything'}
        </h3>
        <p className="mt-1 text-xs text-ink-faint">
          {tab === 'teacher'
            ? 'I can go deeper on the step you’re reading and the component in focus.'
            : 'Freeform system-design questions, answered with concrete examples.'}
        </p>
      </div>
      <div className="w-full space-y-1.5">
        {tab === 'teacher' && stepTitle && (
          <button
            type="button"
            onClick={onExplain}
            className="w-full rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-left text-sm text-accent transition hover:bg-accent/20"
          >
            Explain “{stepTitle}” in more depth
          </button>
        )}
        {tab === 'qna' &&
          qnaSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="w-full rounded-lg border border-white/[0.06] bg-surface-panel/50 px-3 py-2 text-left text-sm text-ink-muted transition hover:border-accent/30 hover:text-ink"
            >
              {s}
            </button>
          ))}
      </div>
    </div>
  );
}

function ChatBubble({ entry }: { entry: TutorChatEntry }) {
  if (entry.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-sm text-ink">
          {entry.content}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-white/[0.06] bg-surface-panel/50 px-3.5 py-2.5">
      <Markdown>{entry.content}</Markdown>
    </div>
  );
}
