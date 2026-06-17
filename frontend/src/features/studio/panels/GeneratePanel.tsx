import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api, UnauthorizedError } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { useAuthStore } from '@/store/authStore';
import { useSnackbar } from '@/store/snackbarStore';
import { useStudioStore } from '@/store/studioStore';

/** Scaffolds a whole workflow from a natural-language description via the LLM,
 *  loading the validated draft into the editor. */
export function GeneratePanel() {
  const [prompt, setPrompt] = useState('A customer-support agent that retrieves answers from a knowledge base and escalates to a human tool when unsure.');
  const load = useStudioStore((s) => s.load);
  const pushSnack = useSnackbar((s) => s.push);

  const gen = useMutation({
    mutationFn: () => api.generateWorkflow({ prompt }),
    onSuccess: (wf) => {
      load({ name: wf.name, description: wf.description, graph: wf.graph });
      pushSnack('Workflow generated — review and tweak it', 'success');
    },
    onError: (err) => {
      if (err instanceof UnauthorizedError) {
        useAuthStore.getState().openAuthPrompt('Sign in to generate workflows with AI.');
      } else {
        pushSnack(`Generation failed: ${(err as Error).message}`, 'error');
      }
    },
  });

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-xs text-ink-faint">
        Describe the agent you want and the AI scaffolds a full graph (steps, prompts, retrieval) you can then edit,
        simulate, and export.
      </p>
      <textarea
        className="input min-h-[120px] resize-y"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your agent…"
      />
      <button
        type="button"
        onClick={() => gen.mutate()}
        disabled={gen.isPending || prompt.trim().length === 0}
        className="btn-primary w-full justify-center"
      >
        {gen.isPending ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        {gen.isPending ? 'Designing…' : 'Generate workflow'}
      </button>
    </div>
  );
}
