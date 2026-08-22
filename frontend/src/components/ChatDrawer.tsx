import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Check, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { Spinner } from '@/components/Spinner';
import { Markdown } from '@/components/Markdown';
import type { ChatEntry, ChatState } from '@/store/createChatStore';

/** Message length cap — mirrored by the backend (`binding:"max=2000"`). */
const MAX_CHARS = 2000;

/** Visual + behavioural description of one proposed action, supplied per domain. */
export interface ActionDescriptor {
  icon: ReactNode;
  text: string;
  rationale?: string;
}

export interface ChatDrawerProps<A> {
  /** The chat store backing this drawer (infra or studio). */
  store: UseBoundStore<StoreApi<ChatState<A>>>;
  title: string;
  /** True while a reply is in flight (the wrapper's mutation.isPending). */
  isThinking: boolean;
  /** Send a user message — the wrapper pushes it and calls the right API. */
  onSend: (text: string) => void;
  /** Apply an assistant turn's proposed actions to the relevant graph. */
  onApply: (entry: ChatEntry<A>) => void;
  /** Render one action as an icon + label (+ optional rationale) chip. */
  describeAction: (action: A) => ActionDescriptor;
  suggestions: string[];
  welcomeTitle: string;
  welcomeBody: string;
  placeholder: string;
  /**
   * Heading and button wording for the proposed-actions block. Defaults suit a
   * graph edit ("Proposed changes" / "Apply all"); a domain whose actions are
   * commands to execute should say so instead.
   */
  actionsTitle?: string;
  applyLabel?: string;
  appliedLabel?: string;
  /** Extra content rendered under an assistant turn, e.g. command output. */
  renderExtra?: (entry: ChatEntry<A>) => ReactNode;
}

/**
 * Reusable slide-in AI chat drawer. It owns the presentation (overlay, message
 * list, composer, auto-send of a queued prompt) and reads its conversation from
 * the supplied store; the domain-specific bits — how to send, how to apply
 * actions, and how to describe each action — come in as props. Both the infra
 * Architecture Assistant and the Agent Studio assistant render through this.
 */
export function ChatDrawer<A>({
  store,
  title,
  isThinking,
  onSend,
  onApply,
  describeAction,
  suggestions,
  welcomeTitle,
  welcomeBody,
  placeholder,
  actionsTitle = 'Proposed changes',
  applyLabel = 'Apply all',
  appliedLabel = 'Applied',
  renderExtra,
}: ChatDrawerProps<A>) {
  const open = store((s) => s.open);
  const setOpen = store((s) => s.setOpen);
  const messages = store((s) => s.messages);
  const pending = store((s) => s.pending);
  const clearPending = store((s) => s.clearPending);
  const reset = store((s) => s.reset);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the composer up to a max height so the first line never scrolls
  // out of view as the message wraps onto more lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  // Keep the conversation scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || isThinking) return;
    onSend(message);
    setInput('');
  };

  // A prompt queued from elsewhere (e.g. chaos mode's "Make it resilient") opens
  // the drawer and sends itself once.
  useEffect(() => {
    if (open && pending) {
      send(pending);
      clearPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending]);

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
                <Sparkles className="h-4 w-4 text-accent" /> {title}
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
                <Welcome
                  title={welcomeTitle}
                  body={welcomeBody}
                  suggestions={suggestions}
                  onPick={send}
                />
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => (
                    <ChatBubble
                      key={m.id}
                      entry={m}
                      onApply={onApply}
                      describeAction={describeAction}
                      actionsTitle={actionsTitle}
                      applyLabel={applyLabel}
                      appliedLabel={appliedLabel}
                      renderExtra={renderExtra}
                    />
                  ))}
                  {isThinking && (
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
                  placeholder={placeholder}
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
                  disabled={!input.trim() || isThinking}
                  aria-label="Send"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-black transition disabled:opacity-40"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-ink-ghost">
                {input.length >= MAX_CHARS ? (
                  <span className="text-danger">Character limit reached ({MAX_CHARS}).</span>
                ) : (
                  'Suggestions are estimates — review changes before applying.'
                )}
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Welcome({
  title,
  body,
  suggestions,
  onPick,
}: {
  title: string;
  body: string;
  suggestions: string[];
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Wand2 className="h-6 w-6" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-xs text-ink-faint">{body}</p>
      </div>
      <div className="w-full space-y-1.5">
        {suggestions.map((s) => (
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

function ChatBubble<A>({
  entry,
  onApply,
  describeAction,
  actionsTitle,
  applyLabel,
  appliedLabel,
  renderExtra,
}: {
  entry: ChatEntry<A>;
  onApply: (entry: ChatEntry<A>) => void;
  describeAction: (action: A) => ActionDescriptor;
  actionsTitle: string;
  applyLabel: string;
  appliedLabel: string;
  renderExtra?: (entry: ChatEntry<A>) => ReactNode;
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
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-white/[0.06] bg-surface-panel/50 px-3.5 py-2.5">
        {/* Model replies are markdown; rendering them raw shows literal ** and `. */}
        <Markdown>{entry.content}</Markdown>
      </div>
      {actions.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-surface-panel/30 p-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {actionsTitle}
            </span>
            {!entry.applied && (
              <button
                type="button"
                onClick={() => onApply(entry)}
                className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-black transition hover:brightness-110"
              >
                <Check className="h-3 w-3" /> {applyLabel}
              </button>
            )}
            {entry.applied && (
              <span className="flex items-center gap-1 text-xs text-accent">
                <Check className="h-3 w-3" /> {appliedLabel}
              </span>
            )}
          </div>
          {actions.map((a, i) => (
            <ActionChip key={i} descriptor={describeAction(a)} />
          ))}
        </div>
      )}
      {renderExtra?.(entry)}
    </div>
  );
}

/**
 * Renders `backtick spans` in a one-line rationale as inline code. The full
 * markdown renderer is the wrong tool here — its block spacing would break the
 * chip layout — but leaving the backticks visible looks like a bug.
 */
function withInlineCode(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
      <code key={i} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.95em] text-accent">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function ActionChip({ descriptor }: { descriptor: ActionDescriptor }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-surface/40 px-2.5 py-1.5 text-xs">
      <span className="mt-0.5 shrink-0 text-ink-faint">{descriptor.icon}</span>
      <div className="min-w-0">
        <span className="text-ink">{descriptor.text}</span>
        {descriptor.rationale && (
          <span className="block text-ink-ghost">{withInlineCode(descriptor.rationale)}</span>
        )}
      </div>
    </div>
  );
}
