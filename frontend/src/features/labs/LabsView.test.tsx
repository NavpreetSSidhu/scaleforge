import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lab, LabStatus } from '@/types/lab';
import { useLabStore } from '@/store/labStore';

const getLabStatus = vi.fn();
const startLabSession = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    getLabStatus: (...args: unknown[]) => getLabStatus(...args),
    startLabSession: (...args: unknown[]) => startLabSession(...args),
  },
  labTerminalURL: (id: string) => `ws://test/labs/sessions/${id}/terminal`,
}));

// The workspace mounts xterm.js and a WebSocket, neither of which belongs in a
// catalog test; it has its own tests.
vi.mock('./LabWorkspace', () => ({
  LabWorkspace: ({ sessionId }: { sessionId: string }) => <div>workspace:{sessionId}</div>,
}));

import { LabsView } from './LabsView';

const s3Lab: Lab = {
  id: 's3-object-storage',
  title: 'S3: Buckets, Objects & Versioning',
  track: 'storage',
  blurb: 'Drive a real S3-compatible store with the real AWS CLI.',
  difficulty: 'beginner',
  minutes: 20,
  concepts: ['Buckets & keys', 'Object versioning'],
  fidelity: 'real',
  services: [{ name: 'minio', image: 'minio/minio:latest' }],
  tasks: [
    { id: 'create-bucket', title: 'Create a bucket', brief: 'Create one.' },
    { id: 'put-object', title: 'Upload an object', brief: 'Upload one.' },
  ],
  verified: true,
};

const emulatedLab: Lab = {
  ...s3Lab,
  id: 'dynamodb-modeling',
  title: 'DynamoDB: Keys, Indexes & Conditional Writes',
  track: 'cloud-api',
  fidelity: 'emulated',
  fidelityNote: 'Runs against the floci AWS emulator, not AWS.',
};

const k8sLab: Lab = {
  ...s3Lab,
  id: 'kubernetes-workloads',
  title: 'Kubernetes: Deployments & Self-Healing',
  track: 'orchestration',
  difficulty: 'intermediate',
  services: [{ name: 'k3s', image: 'rancher/k3s:latest' }],
  verified: false,
};

function renderLabs(status: Partial<LabStatus>) {
  getLabStatus.mockResolvedValue({ enabled: true, docker: true, labs: [s3Lab], ...status });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LabsView />
    </QueryClientProvider>,
  );
}

describe('LabsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLabStore.setState({ sessionId: null, labId: null, revealedHints: {} });
  });

  it('lists labs grouped under their track', async () => {
    renderLabs({ labs: [s3Lab, k8sLab] });

    expect(await screen.findByText(s3Lab.title)).toBeInTheDocument();
    expect(screen.getByText(k8sLab.title)).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Orchestration')).toBeInTheDocument();
  });

  it('explains how to switch labs on when the feature is gated off', async () => {
    renderLabs({ enabled: false, docker: false });

    expect(await screen.findByText(/Labs are turned off/i)).toBeInTheDocument();
    expect(screen.getByText(/LABS_ENABLED=1/)).toBeInTheDocument();
  });

  it('tells the user to start Docker rather than failing at provisioning time', async () => {
    renderLabs({ enabled: true, docker: false });

    expect(await screen.findByText(/Docker isn't reachable/i)).toBeInTheDocument();
  });

  // Starting a lab without a daemon can only fail, so the entry point is disabled.
  it('disables Start lab when the runtime is unavailable', async () => {
    renderLabs({ enabled: true, docker: false });

    expect(await screen.findByRole('button', { name: /start lab/i })).toBeDisabled();
  });

  it('enables Start lab when labs and Docker are both up', async () => {
    renderLabs({});

    expect(await screen.findByRole('button', { name: /start lab/i })).toBeEnabled();
  });

  // The distinction is the honesty mechanism: a floci-backed DynamoDB lab must
  // not read as teaching production DynamoDB the way the Postgres lab teaches
  // production Postgres.
  it('marks an emulated lab as emulated', async () => {
    renderLabs({ labs: [emulatedLab] });

    expect(await screen.findByText(/emulated/i)).toBeInTheDocument();
  });

  it('does not mark a real-software lab as emulated', async () => {
    renderLabs({ labs: [s3Lab] });

    await screen.findByText(s3Lab.title);
    expect(screen.queryByText(/emulated/i)).not.toBeInTheDocument();
  });

  it('groups labs from every track, including messaging and cloud APIs', async () => {
    renderLabs({ labs: [s3Lab, emulatedLab, { ...s3Lab, id: 'k', title: 'Kafka', track: 'messaging' }] });

    expect(await screen.findByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Cloud APIs')).toBeInTheDocument();
    expect(screen.getByText('Messaging & Streaming')).toBeInTheDocument();
  });

  it('flags unverified labs as preview so rough edges are expected', async () => {
    renderLabs({ labs: [k8sLab] });

    expect(await screen.findByText(/Preview/i)).toBeInTheDocument();
  });

  it('does not flag a verified lab as preview', async () => {
    renderLabs({ labs: [s3Lab] });

    await screen.findByText(s3Lab.title);
    expect(screen.queryByText(/Preview/i)).not.toBeInTheDocument();
  });

  it('starts a lab and attaches the store to the new session', async () => {
    startLabSession.mockResolvedValue({
      id: 'sess-9',
      labId: s3Lab.id,
      status: 'starting',
      phase: 'Queued',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      endpoints: [],
      tasks: [],
    });
    renderLabs({});

    await userEvent.click(await screen.findByRole('button', { name: /start lab/i }));

    expect(startLabSession).toHaveBeenCalledWith(s3Lab.id);
    expect(await screen.findByText('workspace:sess-9')).toBeInTheDocument();
  });

  it('shows the workspace instead of the catalog when a session is attached', async () => {
    useLabStore.setState({ sessionId: 'sess-1', labId: s3Lab.id, revealedHints: {} });
    renderLabs({});

    expect(await screen.findByText('workspace:sess-1')).toBeInTheDocument();
    expect(screen.queryByText(s3Lab.title)).not.toBeInTheDocument();
  });
});
