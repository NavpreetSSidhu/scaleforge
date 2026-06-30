import type {
  Achievement,
  Architecture,
  AssistantRequest,
  AssistantResponse,
  ChaosRequest,
  ChaosResult,
  Comparison,
  CompareRequest,
  Course,
  CourseDraft,
  CourseProgress,
  GenerateCourseRequest,
  Graph,
  InterviewGradeRequest,
  InterviewGradeResponse,
  InterviewStartResponse,
  InterviewTopic,
  InterviewTurnRequest,
  InterviewTurnResponse,
  LiveSimRequest,
  LiveTick,
  NodeDefinition,
  PricingProvider,
  ReviewRequest,
  ReviewResponse,
  RuntimeCatalog,
  SandboxEvent,
  SandboxRequest,
  SimulateRequest,
  SimulationResult,
  TrafficProfile,
  TutorAskRequest,
  TutorExplainRequest,
  TutorReply,
} from '@/types/domain';
import type {
  AgentChatRequest,
  AgentChatResponse,
  AgentGraph,
  AgentNodeKind,
  ExportBundle,
  ExportTarget,
  RunEvent,
  SimResult,
  VectorBenchResult,
  Workflow,
} from '@/types/agentflow';
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

  getRuntimes: () => request<RuntimeCatalog>('/runtimes'),

  getAssistantStatus: () => request<{ enabled: boolean }>('/assistant'),

  assistant: (payload: AssistantRequest) =>
    request<AssistantResponse>('/assistant', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getInterviewStatus: () =>
    request<{ enabled: boolean; topics: InterviewTopic[] }>('/interview'),

  startInterview: (topic?: string) =>
    request<InterviewStartResponse>('/interview/start', {
      method: 'POST',
      body: JSON.stringify({ topic: topic ?? '' }),
    }),

  interviewTurn: (payload: InterviewTurnRequest) =>
    request<InterviewTurnResponse>('/interview/turn', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  interviewGrade: (payload: InterviewGradeRequest) =>
    request<InterviewGradeResponse>('/interview/grade', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSandboxStatus: () => request<{ enabled: boolean }>('/sandbox'),

  getReviewStatus: () => request<{ enabled: boolean }>('/review'),

  review: (payload: ReviewRequest) =>
    request<ReviewResponse>('/review', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

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

  chaos: (payload: ChaosRequest) =>
    request<ChaosResult>('/chaos', {
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

  // --- Learn module ---

  getTutorStatus: () => request<{ enabled: boolean }>('/tutor'),

  tutorExplain: (payload: TutorExplainRequest) =>
    request<TutorReply>('/tutor/explain', { method: 'POST', body: JSON.stringify(payload) }),

  tutorAsk: (payload: TutorAskRequest) =>
    request<TutorReply>('/tutor/ask', { method: 'POST', body: JSON.stringify(payload) }),

  getProgress: () =>
    request<{ progress: CourseProgress[] }>('/tutor/progress').then((r) => r.progress),

  updateProgress: (slug: string, payload: { completedSteps: number[]; completed: boolean }) =>
    request<CourseProgress>(`/tutor/progress/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // --- User-created courses ---

  listCourses: () => request<{ courses: Course[] }>('/courses').then((r) => r.courses),

  getCourse: (id: string) => request<Course>(`/courses/${id}`),

  createCourse: (payload: CourseDraft) =>
    request<Course>('/courses', { method: 'POST', body: JSON.stringify(payload) }),

  updateCourse: (id: string, payload: CourseDraft) =>
    request<Course>(`/courses/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  deleteCourse: (id: string) => request<void>(`/courses/${id}`, { method: 'DELETE' }),

  generateCourse: (payload: GenerateCourseRequest) =>
    request<Course>('/courses/generate', { method: 'POST', body: JSON.stringify(payload) }),

  // --- Agent Studio (agentic workflows) ---

  getAgentflowCatalog: () =>
    request<{ nodeTypes: AgentNodeKind[] }>('/agentflow/catalog').then((r) => r.nodeTypes),

  simulateWorkflow: (payload: { graph: AgentGraph; trials?: number; seed?: number }) =>
    request<SimResult>('/agentflow/simulate', { method: 'POST', body: JSON.stringify(payload) }),

  vectorBench: (payload: { corpusSize?: number; dim?: number; k?: number; queries?: number }) =>
    request<VectorBenchResult>('/agentflow/vector-bench', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  exportWorkflow: (payload: {
    name: string;
    description?: string;
    graph: AgentGraph;
    targets?: ExportTarget[];
  }) =>
    request<ExportBundle>('/agentflow/export', { method: 'POST', body: JSON.stringify(payload) }),

  getAgentRunStatus: () => request<{ enabled: boolean }>('/agentflow/run'),

  generateWorkflow: (payload: { prompt: string }) =>
    request<Workflow>('/workflows/generate', { method: 'POST', body: JSON.stringify(payload) }),

  agentChat: (payload: AgentChatRequest) =>
    request<AgentChatResponse>('/agentflow/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listWorkflows: () =>
    request<{ workflows: Workflow[] }>('/workflows').then((r) => r.workflows),

  getWorkflow: (id: string) => request<Workflow>(`/workflows/${id}`),

  createWorkflow: (payload: { name: string; description?: string; graph: AgentGraph }) =>
    request<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(payload) }),

  updateWorkflow: (id: string, payload: { name: string; description?: string; graph: AgentGraph }) =>
    request<Workflow>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  deleteWorkflow: (id: string) => request<void>(`/workflows/${id}`, { method: 'DELETE' }),
};

/**
 * runWorkflowStream POSTs a workflow and reads the Server-Sent Events the Go
 * runtime emits (one per executed step), invoking onEvent for each. Returns when
 * the stream ends. Uses fetch streaming rather than EventSource because the run
 * is a POST with a body and an Authorization header.
 */
export async function runWorkflowStream(
  payload: { graph: AgentGraph; input?: string },
  onEvent: (ev: RunEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = tokenProvider();
  const response = await fetch(`${API_BASE}/agentflow/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error ?? 'Run failed');
  }

  await readSSE(response, onEvent);
}

/**
 * runLiveSimStream POSTs an architecture + traffic to the discrete-event
 * simulator and reads the Server-Sent Events it emits (one Tick per simulated
 * time slice), invoking onTick for each. Same fetch-streaming approach as
 * runWorkflowStream (POST with a body, so not EventSource).
 */
export async function runLiveSimStream(
  payload: LiveSimRequest,
  onTick: (tick: LiveTick) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = tokenProvider();
  const response = await fetch(`${API_BASE}/simulate/live`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error ?? 'Live simulation failed');
  }
  await readSSE(response, onTick);
}

/**
 * runSandboxStream POSTs a design to the Real Sandbox and reads the Server-Sent
 * Events it emits (phase, progress, done) as it stands the design up and load-
 * tests it. Same fetch-streaming approach as the other streams.
 */
export async function runSandboxStream(
  payload: SandboxRequest,
  onEvent: (ev: SandboxEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = tokenProvider();
  const response = await fetch(`${API_BASE}/sandbox/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error ?? 'Sandbox run failed');
  }
  await readSSE(response, onEvent);
}

/**
 * readSSE drains a streaming fetch Response, parsing each SSE `data:` line as one
 * JSON event of type T. Shared by the workflow-run, live-sim, and sandbox streams.
 */
async function readSSE<T>(response: Response, onEvent: (ev: T) => void): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; each `data:` line is one JSON event.
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split('\n')) {
        const trimmed = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (trimmed) {
          try {
            onEvent(JSON.parse(trimmed) as T);
          } catch {
            /* ignore keep-alives / malformed frames */
          }
        }
      }
    }
  }
}
