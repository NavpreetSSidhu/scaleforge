import { useMutation, useQuery } from '@tanstack/react-query';
import { GitBranch, Plus, Settings2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useArchitectureStore } from '@/store/architectureStore';
import { useAssistantStore, type ChatEntry } from '@/store/assistantStore';
import { useSnackbar } from '@/store/snackbarStore';
import { ChatDrawer, type ActionDescriptor } from '@/components/ChatDrawer';
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

/** Infra Architecture Assistant: a thin adapter over the shared [[ChatDrawer]]
 *  that talks to the /assistant endpoint and applies actions to the infra graph. */
export function AssistantDrawer({ onRun }: { onRun: () => void }) {
  const { messages, pushUser, pushAssistant, markApplied } = useAssistantStore();
  const { nodes, edges, traffic, provider, simulationResult } = useArchitectureStore();
  const pushSnack = useSnackbar((s) => s.push);

  const { data: catalog = [] } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
    staleTime: Infinity,
  });

  const ask = useMutation({
    mutationFn: (message: string) => {
      const history: AssistantMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
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

  const send = (message: string) => {
    pushUser(message);
    ask.mutate(message);
  };

  const apply = (entry: ChatEntry) => {
    const { applied, skipped } = applyAssistantActions(entry.actions ?? [], catalog);
    markApplied(entry.id);
    if (applied > 0) {
      pushSnack(
        `Applied ${applied} change${applied === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`,
        'success',
      );
      onRun(); // re-simulate so metrics reflect the new architecture
    } else {
      pushSnack('No changes could be applied', 'error');
    }
  };

  return (
    <ChatDrawer<AssistantAction>
      store={useAssistantStore}
      title="Architecture Assistant"
      isThinking={ask.isPending}
      onSend={send}
      onApply={apply}
      describeAction={describeAction}
      suggestions={SUGGESTIONS}
      welcomeTitle="Ask about your architecture"
      welcomeBody="I can explain the design and propose changes you preview before applying."
      placeholder="Ask about or change your architecture…"
    />
  );
}

function describeAction(a: AssistantAction): ActionDescriptor {
  switch (a.op) {
    case 'addNode':
      return { icon: <Plus className="h-3.5 w-3.5" />, text: `Add ${a.label || a.nodeType}`, rationale: a.rationale };
    case 'removeNode':
      return { icon: <Trash2 className="h-3.5 w-3.5" />, text: `Remove ${a.nodeId}`, rationale: a.rationale };
    case 'addEdge':
      return { icon: <GitBranch className="h-3.5 w-3.5" />, text: `Connect ${a.source} → ${a.target}`, rationale: a.rationale };
    case 'removeEdge':
      return { icon: <GitBranch className="h-3.5 w-3.5" />, text: `Disconnect ${a.source} → ${a.target}`, rationale: a.rationale };
    case 'updateConfig':
      return { icon: <Settings2 className="h-3.5 w-3.5" />, text: `Update ${a.nodeId}: ${formatConfig(a.config)}`, rationale: a.rationale };
    default:
      return { icon: <Settings2 className="h-3.5 w-3.5" />, text: a.op, rationale: a.rationale };
  }
}

function formatConfig(config?: Partial<AssistantAction['config']>): string {
  if (!config) return '';
  return Object.entries(config)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}
