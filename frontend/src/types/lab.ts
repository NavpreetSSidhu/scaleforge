/** Types for ScaleForge Labs — real containerised environments you drive from a terminal. */

export type LabDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type LabTrack = 'storage' | 'orchestration' | 'data' | 'mesh' | 'messaging' | 'cloud-api';

/**
 * Whether a lab runs the genuine software or an emulation of it. What you learn
 * from real Postgres holds in production; an emulated AWS API is faithful to the
 * interface but not to performance, quotas, or failure behaviour.
 */
export type LabFidelity = 'real' | 'emulated';

export interface LabService {
  name: string;
  image: string;
}

export interface LabTask {
  id: string;
  title: string;
  /** Markdown instructions for the objective. */
  brief: string;
}

export interface Lab {
  id: string;
  title: string;
  track: LabTrack;
  blurb: string;
  difficulty: LabDifficulty;
  minutes: number;
  concepts: string[];
  /** What's on the workstation's PATH and how it's already configured. */
  toolchain: string;
  fidelity: LabFidelity;
  /** For an emulated lab, what the emulator is and isn't faithful to. */
  fidelityNote?: string;
  services: LabService[];
  tasks: LabTask[];
  /** False for labs whose environment hasn't been exercised end to end yet. */
  verified: boolean;
}

export interface LabStatus {
  enabled: boolean;
  /** Whether a Docker daemon is reachable right now. */
  docker: boolean;
  /** Whether an LLM provider is configured. Labs work fully without one. */
  assistant: boolean;
  labs: Lab[];
}

/** One command the assistant proposes. Nothing runs until the user accepts it. */
export interface LabCommand {
  run: string;
  explain?: string;
}

export interface LabAssistRequest {
  message: string;
  /** Tail of the user's terminal, so errors can be answered against the real output. */
  terminal?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface LabAssistResponse {
  reply: string;
  commands: LabCommand[];
}

export interface LabRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type LabSessionStatus = 'starting' | 'ready' | 'failed' | 'stopped';

export interface LabEndpoint {
  label: string;
  address: string;
  url?: string;
}

export interface LabTaskState {
  id: string;
  done: boolean;
  message?: string;
  checkedAt?: string;
}

export interface LabSession {
  id: string;
  labId: string;
  status: LabSessionStatus;
  /** Human-readable provisioning step, e.g. "Starting minio (minio/minio:latest)…". */
  phase: string;
  error?: string;
  createdAt: string;
  expiresAt: string;
  endpoints: LabEndpoint[];
  tasks: LabTaskState[];
}

export interface LabVerifyResult {
  tasks: LabTaskState[];
  completed: number;
  total: number;
}
