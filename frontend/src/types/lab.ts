/** Types for ScaleForge Labs — real containerised environments you drive from a terminal. */

export type LabDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type LabTrack = 'storage' | 'orchestration' | 'data' | 'mesh';

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
  services: LabService[];
  tasks: LabTask[];
  /** False for labs whose environment hasn't been exercised end to end yet. */
  verified: boolean;
}

export interface LabStatus {
  enabled: boolean;
  /** Whether a Docker daemon is reachable right now. */
  docker: boolean;
  labs: Lab[];
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
