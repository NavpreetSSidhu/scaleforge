import type {
  Achievement,
  Architecture,
  Comparison,
  CompareRequest,
  Graph,
  NodeDefinition,
  PricingProvider,
  SimulateRequest,
  SimulationResult,
  TrafficProfile,
} from '@/types/domain';
import type { AuthUser } from '@/store/authStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/** Pluggable token source — set by the app so api.ts stays free of store imports. */
let tokenProvider: () => string | null = () => null;
export function setAuthTokenProvider(provider: () => string | null) {
  tokenProvider = provider;
}

/** Thrown for 401s so callers can trigger a re-login. */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = tokenProvider();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    if (response.status === 401) {
      throw new UnauthorizedError(error.error ?? 'Authentication required');
    }
    throw new Error(error.error ?? 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const api = {
  signup: (payload: { email: string; name: string; password: string }) =>
    request<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),

  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),

  me: () => request<AuthUser>('/auth/me'),

  getCatalog: () => request<{ nodes: NodeDefinition[] }>('/catalog'),

  getPricing: () =>
    request<{ providers: PricingProvider[]; defaultProviderId: string }>('/pricing'),

  simulate: (payload: SimulateRequest) =>
    request<SimulationResult>('/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  compare: (payload: CompareRequest) =>
    request<Comparison>('/compare', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listArchitectures: () => request<Architecture[]>('/architectures'),

  createArchitecture: (payload: { name: string; graph: Graph; traffic: TrafficProfile }) =>
    request<Architecture>('/architectures', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getArchitecture: (id: string) => request<Architecture>(`/architectures/${id}`),

  updateArchitecture: (
    id: string,
    payload: { name: string; graph: Graph; traffic: TrafficProfile },
  ) =>
    request<Architecture>(`/architectures/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteArchitecture: (id: string) =>
    request<void>(`/architectures/${id}`, { method: 'DELETE' }),

  getSimulation: (id: string) => request<SimulationResult>(`/simulation/${id}`),

  listAchievements: () =>
    request<{ achievements: Achievement[] }>('/achievements').then((r) => r.achievements),
};
