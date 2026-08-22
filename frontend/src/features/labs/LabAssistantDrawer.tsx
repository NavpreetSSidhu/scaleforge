import { useMutation } from '@tanstack/react-query';
import { TerminalSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { ChatDrawer, type ActionDescriptor } from '@/components/ChatDrawer';
import { useSnackbar } from '@/store/snackbarStore';
import {
  terminalTail,
  useLabAssistantStore,
  useLabCommandOutput,
  type LabChatEntry,
} from '@/store/labAssistantStore';
import type { Lab, LabAssistRequest, LabCommand } from '@/types/lab';

/** Suggestions are lab-shaped: the generic ones are useless beside a live shell. */
function suggestionsFor(lab?: Lab): string[] {
  const base = [
    "Explain what I'm looking at",
    "I'm stuck on the current objective — what should I look at?",
    'Explain the last error in my terminal',
  ];
  if (!lab) return base;
  return [...base, `Set up a realistic ${lab.title.split(':')[0]} scenario for me to explore`];
}

/**
 * The assistant beside a running lab. It explains what's happening and proposes
 * commands, which the user accepts before anything runs — accepting executes them
 * in the same workstation container the terminal is attached to.
 */
export function LabAssistantDrawer({ sessionId, lab }: { sessionId: string; lab?: Lab }) {
  const { pushUser, pushAssistant, markApplied } = useLabAssistantStore();
  const setOutput = useLabCommandOutput((s) => s.setOutput);
  const pushSnack = useSnackbar((s) => s.push);

  const ask = useMutation({
    mutationFn: ({ message, history }: { message: string; history: LabAssistRequest['history'] }) =>
      api.labAssist(sessionId, {
        message,
        // Read at send time rather than tracked in state, so typing in the shell
        // never re-renders the workspace.
        terminal: terminalTail(sessionId),
        history,
      }),
    onSuccess: (resp) => pushAssistant(resp.reply, resp.commands),
    onError: (err) => pushSnack((err as Error).message || 'Assistant request failed', 'error'),
  });

  const run = useMutation({
    mutationFn: async (entry: LabChatEntry) => {
      const commands = entry.actions ?? [];
      const lines: string[] = [];
      for (const command of commands) {
        const result = await api.runLabCommand(sessionId, command.run);
        const body = [result.stdout, result.stderr].filter(Boolean).join('').trimEnd();
        lines.push(`$ ${command.run}\n${body || '(no output)'}`);
        // Stop at the first failure: later commands usually assume the earlier
        // ones worked, so running them on would just pile up confusing errors.
        if (result.exitCode !== 0) {
          lines.push(`[exited ${result.exitCode}]`);
          break;
        }
      }
      return lines.join('\n\n');
    },
    onSuccess: (output, entry) => {
      setOutput(entry.id, output);
      markApplied(entry.id);
    },
    onError: (err) => pushSnack((err as Error).message || "Couldn't run the command", 'error'),
  });

  const send = (message: string) => {
    // Snapshot the conversation *before* adding this turn: otherwise the message
    // being sent also arrives as history, repeating the question to the model.
    const history = useLabAssistantStore
      .getState()
      .messages.map((m) => ({ role: m.role, content: m.content }));
    pushUser(message);
    ask.mutate({ message, history });
  };

  return (
    <ChatDrawer<LabCommand>
      store={useLabAssistantStore}
      title="Lab Assistant"
      isThinking={ask.isPending || run.isPending}
      onSend={send}
      onApply={(entry) => run.mutate(entry)}
      describeAction={describeCommand}
      actionsTitle="Proposed commands"
      applyLabel="Run in the lab"
      appliedLabel="Ran"
      renderExtra={(entry) => <CommandOutput entryId={entry.id} />}
      suggestions={suggestionsFor(lab)}
      welcomeTitle="Ask about this lab, or tell me what to set up"
      welcomeBody="I can see which objectives you've completed, what your last check said, and the tail of your terminal. Commands I suggest run in your workstation only after you accept them."
      placeholder="Ask a question, or describe what you want to set up…"
    />
  );
}

function CommandOutput({ entryId }: { entryId: number }) {
  const output = useLabCommandOutput((s) => s.outputs[entryId]);
  if (!output) return null;
  return (
    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-surface-line bg-surface p-2 font-mono text-[11.5px] leading-relaxed text-ink-muted">
      {output}
    </pre>
  );
}

function describeCommand(c: LabCommand): ActionDescriptor {
  return {
    icon: <TerminalSquare className="h-3.5 w-3.5" />,
    text: c.run,
    rationale: c.explain,
  };
}
