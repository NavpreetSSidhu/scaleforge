import { useMutation } from '@tanstack/react-query';
import { GitBranch, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { api, UnauthorizedError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useSnackbar } from '@/store/snackbarStore';
import { useStudioStore } from '@/store/studioStore';
import { useStudioAssistantStore, type StudioChatEntry } from '@/store/studioAssistantStore';
import { ChatDrawer, type ActionDescriptor } from '@/components/ChatDrawer';
import { applyAgentActions } from '@/features/studio/applyAgentActions';
import { useAgentflowCatalog } from '@/features/studio/useAgentflow';
import type { AgentChatAction, AgentChatMessage } from '@/types/agentflow';

const SUGGESTIONS = [
  'Explain what this workflow does',
  'Add a retriever so it can ground answers in a knowledge base',
  'Add a router that escalates to a human tool when the model is unsure',
  'How can I make this cheaper or faster?',
];

/** Agent Studio assistant: a thin adapter over the shared [[ChatDrawer]] that
 *  talks to /agentflow/chat and applies incremental edits to the studio graph. */
export function StudioAssistantDrawer() {
  const { messages, pushUser, pushAssistant, markApplied } = useStudioAssistantStore();
  const { graph, input } = useStudioStore();
  const { data: catalog = [] } = useAgentflowCatalog();
  const pushSnack = useSnackbar((s) => s.push);

  const ask = useMutation({
    mutationFn: (message: string) => {
      const history: AgentChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
      return api.agentChat({ message, graph: graph(), input, history });
    },
    onSuccess: (resp) => pushAssistant(resp.reply, resp.actions),
    onError: (err) => {
      if (err instanceof UnauthorizedError) {
        useAuthStore.getState().openAuthPrompt('Sign in to use the workflow assistant.');
      } else {
        pushSnack((err as Error).message || 'Assistant request failed', 'error');
      }
    },
  });

  const send = (message: string) => {
    pushUser(message);
    ask.mutate(message);
  };

  const apply = (entry: StudioChatEntry) => {
    const { applied, skipped } = applyAgentActions(entry.actions ?? [], catalog);
    markApplied(entry.id);
    if (applied > 0) {
      pushSnack(
        `Applied ${applied} change${applied === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`,
        'success',
      );
    } else {
      pushSnack('No changes could be applied', 'error');
    }
  };

  return (
    <ChatDrawer<AgentChatAction>
      store={useStudioAssistantStore}
      title="Agent Studio Assistant"
      isThinking={ask.isPending}
      onSend={send}
      onApply={apply}
      describeAction={describeAction}
      suggestions={SUGGESTIONS}
      welcomeTitle="Design your agent with AI"
      welcomeBody="I can explain this workflow and propose steps, connections, and config you preview before applying."
      placeholder="Ask about or change your agent workflow…"
    />
  );
}

function describeAction(a: AgentChatAction): ActionDescriptor {
  switch (a.op) {
    case 'addNode':
      return { icon: <Plus className="h-3.5 w-3.5" />, text: `Add ${a.label || a.nodeType} step`, rationale: a.rationale };
    case 'removeNode':
      return { icon: <Trash2 className="h-3.5 w-3.5" />, text: `Remove ${a.nodeId}`, rationale: a.rationale };
    case 'addEdge':
      return { icon: <GitBranch className="h-3.5 w-3.5" />, text: `Connect ${a.source} → ${a.target}`, rationale: a.rationale };
    case 'removeEdge':
      return { icon: <GitBranch className="h-3.5 w-3.5" />, text: `Disconnect ${a.source} → ${a.target}`, rationale: a.rationale };
    case 'updateConfig':
      return { icon: <Settings2 className="h-3.5 w-3.5" />, text: `Update ${a.nodeId}: ${formatConfig(a.config)}`, rationale: a.rationale };
    case 'setLabel':
      return { icon: <Pencil className="h-3.5 w-3.5" />, text: `Rename ${a.nodeId} → “${a.label}”`, rationale: a.rationale };
    default:
      return { icon: <Settings2 className="h-3.5 w-3.5" />, text: a.op, rationale: a.rationale };
  }
}

function formatConfig(config?: AgentChatAction['config']): string {
  if (!config) return '';
  return Object.entries(config)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}
