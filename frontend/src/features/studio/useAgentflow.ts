import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Node-type palette for Agent Studio (cached for the session). */
export function useAgentflowCatalog() {
  return useQuery({
    queryKey: ['agentflow-catalog'],
    queryFn: () => api.getAgentflowCatalog(),
    staleTime: Infinity,
  });
}

/** Whether the live dry-run + AI generation are available (LLM key configured).
 *  Probed once; the run/generate entrypoints hide when disabled. */
export function useAgentRunEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['agentflow-run-status'],
    queryFn: () => api.getAgentRunStatus(),
    staleTime: Infinity,
  });
  return data?.enabled ?? false;
}
