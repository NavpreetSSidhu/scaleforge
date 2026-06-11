import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Cached runtime-catalog query, shared by the inspector dropdown and Compare. */
export function useRuntimes() {
  return useQuery({
    queryKey: ['runtimes'],
    queryFn: api.getRuntimes,
    staleTime: Infinity,
  });
}
