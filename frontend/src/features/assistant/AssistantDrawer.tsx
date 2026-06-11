import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUp,
  Check,
  GitBranch,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useArchitectureStore } from '@/store/architectureStore';
import { useAssistantStore, type ChatEntry } from '@/store/assistantStore';
import { useSnackbar } from '@/store/snackbarStore';
import { Spinner } from '@/components/Spinner';
import { applyAssistantActions } from '@/features/assistant/applyActions';
import type { AssistantAction, AssistantMessage } from '@/types/domain';

/** Cached capability probe — the button hides entirely when the API has no key. */
export function useAssistantEnabled() {
  const { data } = useQuery({
    queryKey: ['assistant-status'],
    queryFn: api.getAssistantStatus,
    staleTime: Infinity,
    retry: false,
  });
  return data?.enabled ?? false;
}

const SUGGESTIONS = [
  'Explain this architecture',
  'How do I handle 10x the traffic?',
  'Where is my bottleneck and how do I fix it?',
  'How can I cut cost without losing reliability?',
];

export function AssistantDrawer({ onRun }: { onRun: () => void }) {
  const { open, setOpen, messages, pushUser, pushAssistant, markApplied, reset } =
    useAssistantStore();
  const { nodes, edges, traffic, provider, simulationResult } = useArchitectureStore();
  const pushSnack = useSnackbar((s) => s.push);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: catalog = [] } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
    staleTime: Infinity,
  });

  const ask = useMutation({
    mutationFn: (message: string) => {
      const history: AssistantMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      return api.assistant({
        message,
        graph: { nodes, edges },
        traffic,
        provider,
        result: simulationResult,
        history,
      });
    },
    onSuccess: (resp) => pushAssistant(resp.reply, resp.actions),
    onError: (err) => pushSnack((err as Error).message || 'Assistant request failed', 'error'),
  });

  // Keep the conversation scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, ask.isPending]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || ask.isPending) return;
    pushUser(message);
    setInput('');
    ask.mutate(message);
  };

  const apply = (entry: ChatEntry, actions: AssistantAction[]) => {
    const { applied, skipped } = applyAssistantActions(actions, catalog);
    markApplied(entry.id);
    if (applied > 0) {
      pushSnack(
        `Applied ${applied} change${applied === 1 ? '' : 's'}${
          skipped ? ` (${skipped} skipped)` : ''
        }`,
        'success',
      );
      onRun(); // re-simulate so metrics reflect the new architecture
    } else {
      pushSnack('No changes could be applied', 'error');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
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
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-accent" /> Architecture Assistant
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={reset}
                    aria-label="Clear conversation"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close assistant"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <Welcome onPick={send} />
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => (
                    <ChatBubble key={m.id} entry={m} onApply={apply} />
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
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={1}
                  placeholder="Ask about or change your architecture…"
                  className="max-h-32 flex-1 resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-ghost"
                />
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
              <p className="mt-1.5 px-1 text-[10px] text-ink-ghost">
                Suggestions are estimates — review changes before applying.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Wand2 className="h-6 w-6" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-ink">Ask about your architecture</h3>
        <p className="mt-1 text-xs text-ink-faint">
          I can explain the design and propose changes you preview before applying.
        </p>
      </div>
      <div className="w-full space-y-1.5">
        {SUGGESTIONS.map((s) => (
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

function ChatBubble({
  entry,
  onApply,
}: {
  entry: ChatEntry;
  onApply: (entry: ChatEntry, actions: AssistantAction[]) => void;
}) {
  if (entry.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-sm text-ink">
          {entry.content}
        </div>
      </div>
    );
  }

  const actions = entry.actions ?? [];
  return (
    <div className="space-y-2">
      <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-white/[0.06] bg-surface-panel/50 px-3.5 py-2.5 text-sm text-ink-muted">
        {entry.content}
      </div>
      {actions.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-surface-panel/30 p-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Proposed changes
            </span>
            {!entry.applied && (
              <button
                type="button"
                onClick={() => onApply(entry, actions)}
                className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-black transition hover:brightness-110"
              >
                <Check className="h-3 w-3" /> Apply all
              </button>
            )}
            {entry.applied && (
              <span className="flex items-center gap-1 text-xs text-accent">
                <Check className="h-3 w-3" /> Applied
              </span>
            )}
          </div>
          {actions.map((a, i) => (
            <ActionChip key={i} action={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionChip({ action }: { action: AssistantAction }) {
  const { icon, text } = describeAction(action);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-surface/40 px-2.5 py-1.5 text-xs">
      <span className="mt-0.5 shrink-0 text-ink-faint">{icon}</span>
      <div className="min-w-0">
        <span className="text-ink">{text}</span>
        {action.rationale && <span className="block text-ink-ghost">{action.rationale}</span>}
      </div>
    </div>
  );
}

function describeAction(a: AssistantAction): { icon: React.ReactNode; text: string } {
  switch (a.op) {
    case 'addNode':
      return { icon: <Plus className="h-3.5 w-3.5" />, text: `Add ${a.label || a.nodeType}` };
    case 'removeNode':
      return { icon: <Trash2 className="h-3.5 w-3.5" />, text: `Remove ${a.nodeId}` };
    case 'addEdge':
      return {
        icon: <GitBranch className="h-3.5 w-3.5" />,
        text: `Connect ${a.source} → ${a.target}`,
      };
    case 'removeEdge':
      return {
        icon: <GitBranch className="h-3.5 w-3.5" />,
        text: `Disconnect ${a.source} → ${a.target}`,
      };
    case 'updateConfig':
      return {
        icon: <Settings2 className="h-3.5 w-3.5" />,
        text: `Update ${a.nodeId}: ${formatConfig(a.config)}`,
      };
    default:
      return { icon: <Settings2 className="h-3.5 w-3.5" />, text: a.op };
  }
}

function formatConfig(config?: Partial<AssistantAction['config']>): string {
  if (!config) return '';
  return Object.entries(config)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}
