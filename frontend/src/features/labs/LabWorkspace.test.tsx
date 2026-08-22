import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lab, LabSession } from '@/types/lab';
import { useLabStore } from '@/store/labStore';

const getLabStatus = vi.fn();
const getLabSession = vi.fn();
const verifyLabSession = vi.fn();
const stopLabSession = vi.fn();
const getLabHint = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    getLabStatus: (...a: unknown[]) => getLabStatus(...a),
    getLabSession: (...a: unknown[]) => getLabSession(...a),
    verifyLabSession: (...a: unknown[]) => verifyLabSession(...a),
    stopLabSession: (...a: unknown[]) => stopLabSession(...a),
    getLabHint: (...a: unknown[]) => getLabHint(...a),
  },
  labTerminalURL: (id: string) => `ws://test/labs/sessions/${id}/terminal`,
}));

// xterm.js needs a real canvas/measurement context that jsdom doesn't provide.
vi.mock('./LabTerminal', () => ({
  LabTerminal: ({ sessionId }: { sessionId: string }) => <div>terminal:{sessionId}</div>,
}));

import { LabWorkspace } from './LabWorkspace';

const lab: Lab = {
  id: 's3-object-storage',
  title: 'S3: Buckets, Objects & Versioning',
  track: 'storage',
  blurb: 'blurb',
  difficulty: 'beginner',
  minutes: 20,
  concepts: [],
  services: [{ name: 'minio', image: 'minio/minio:latest' }],
  tasks: [
    { id: 'create-bucket', title: 'Create a bucket', brief: 'Create a bucket named `x`.' },
    { id: 'put-object', title: 'Upload an object', brief: 'Upload one.' },
  ],
  verified: true,
};

function session(overrides: Partial<LabSession> = {}): LabSession {
  return {
    id: 'sess-1',
    labId: lab.id,
    status: 'ready',
    phase: 'Ready',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 45 * 60_000).toISOString(),
    endpoints: [{ label: 'S3 API', address: '127.0.0.1:1234', url: 'http://127.0.0.1:1234' }],
    tasks: [
      { id: 'create-bucket', done: false },
      { id: 'put-object', done: false },
    ],
    ...overrides,
  };
}

function renderWorkspace(s: LabSession) {
  getLabStatus.mockResolvedValue({ enabled: true, docker: true, labs: [lab] });
  getLabSession.mockResolvedValue(s);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LabWorkspace sessionId="sess-1" />
    </QueryClientProvider>,
  );
}

describe('LabWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLabStore.setState({ sessionId: 'sess-1', labId: lab.id, revealedHints: {} });
  });

  it('shows the objectives and the terminal once ready', async () => {
    renderWorkspace(session());

    expect(await screen.findByText('1. Create a bucket')).toBeInTheDocument();
    expect(screen.getByText('2. Upload an object')).toBeInTheDocument();
    expect(screen.getByText('terminal:sess-1')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  // Provisioning legitimately takes minutes on a cold image cache; the phase is
  // shown verbatim so the wait is legible rather than a frozen spinner.
  it('surfaces the provisioning phase while starting', async () => {
    renderWorkspace(session({ status: 'starting', phase: 'Starting minio (minio/minio:latest)…' }));

    expect(await screen.findByText(/Starting minio/)).toBeInTheDocument();
    expect(screen.queryByText('terminal:sess-1')).not.toBeInTheDocument();
  });

  it('shows the container logs when provisioning failed', async () => {
    renderWorkspace(session({ status: 'failed', error: 'starting minio: no such image' }));

    expect(await screen.findByText(/couldn't start/i)).toBeInTheDocument();
    expect(screen.getByText(/no such image/)).toBeInTheDocument();
  });

  // Regression: Go marshals an empty slice as null, and the first session
  // response arrives before any endpoint has been published.
  it('renders without crashing when the API omits endpoints and tasks', async () => {
    renderWorkspace(
      session({
        endpoints: null as unknown as LabSession['endpoints'],
        tasks: null as unknown as LabSession['tasks'],
      }),
    );

    expect(await screen.findByText('terminal:sess-1')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('counts completed objectives and reports each check result', async () => {
    renderWorkspace(
      session({
        tasks: [
          { id: 'create-bucket', done: true, message: 'Bucket `x` exists.' },
          { id: 'put-object', done: false, message: 'No object at that key.' },
        ],
      }),
    );

    expect(await screen.findByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('Bucket `x` exists.')).toBeInTheDocument();
    expect(screen.getByText('No object at that key.')).toBeInTheDocument();
  });

  it('links out to a published endpoint', async () => {
    renderWorkspace(session());

    const link = await screen.findByRole('link', { name: /S3 API/ });
    expect(link).toHaveAttribute('href', 'http://127.0.0.1:1234');
  });

  it('runs the checks against the live environment on demand', async () => {
    verifyLabSession.mockResolvedValue({
      tasks: [
        { id: 'create-bucket', done: true, message: 'Bucket `x` exists.' },
        { id: 'put-object', done: false, message: 'Not yet.' },
      ],
      completed: 1,
      total: 2,
    });
    renderWorkspace(session());

    await userEvent.click(await screen.findByRole('button', { name: /verify objectives/i }));

    expect(verifyLabSession).toHaveBeenCalledWith('sess-1');
    expect(await screen.findByText('1/2')).toBeInTheDocument();
  });

  // The hint is the answer, so it is fetched only when asked for.
  it('withholds the hint until the user asks for it', async () => {
    getLabHint.mockResolvedValue({ hint: 'aws s3 mb s3://x' });
    renderWorkspace(session());

    expect(await screen.findByText('1. Create a bucket')).toBeInTheDocument();
    expect(screen.queryByText('aws s3 mb s3://x')).not.toBeInTheDocument();
    expect(getLabHint).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole('button', { name: /show the command/i })[0]);

    expect(await screen.findByText('aws s3 mb s3://x')).toBeInTheDocument();
    expect(getLabHint).toHaveBeenCalledWith('sess-1', 'create-bucket');
  });

  it('offers no hint for an objective already met', async () => {
    renderWorkspace(session({ tasks: [{ id: 'create-bucket', done: true }, { id: 'put-object', done: false }] }));

    await screen.findByText('1. Create a bucket');
    // Only the outstanding objective offers a hint.
    expect(screen.getAllByRole('button', { name: /show the command/i })).toHaveLength(1);
  });

  it('tears the environment down and detaches the store', async () => {
    stopLabSession.mockResolvedValue({ stopped: true });
    renderWorkspace(session());

    await userEvent.click(await screen.findByRole('button', { name: /tear down/i }));

    expect(stopLabSession).toHaveBeenCalledWith('sess-1');
  });

  it('goes back to the catalog without stopping the containers', async () => {
    renderWorkspace(session());

    await userEvent.click(await screen.findByRole('button', { name: /^labs$/i }));

    expect(useLabStore.getState().sessionId).toBeNull();
    expect(stopLabSession).not.toHaveBeenCalled();
  });
});
