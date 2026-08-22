import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lab } from '@/types/lab';
import {
  clearTerminalBuffer,
  recordTerminalOutput,
  useLabAssistantStore,
  useLabCommandOutput,
} from '@/store/labAssistantStore';

const labAssist = vi.fn();
const runLabCommand = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    labAssist: (...a: unknown[]) => labAssist(...a),
    runLabCommand: (...a: unknown[]) => runLabCommand(...a),
  },
  labTerminalURL: (id: string) => `ws://test/${id}`,
}));

import { LabAssistantDrawer } from './LabAssistantDrawer';

const lab = { id: 's3-object-storage', title: 'S3: Buckets & Versioning' } as Lab;

function renderDrawer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LabAssistantDrawer sessionId="sess-1" lab={lab} />
    </QueryClientProvider>,
  );
}

async function ask(text: string) {
  const box = screen.getByPlaceholderText(/ask a question/i);
  await userEvent.type(box, text);
  await userEvent.keyboard('{Enter}');
}

describe('LabAssistantDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTerminalBuffer();
    useLabAssistantStore.setState({ open: true, messages: [], pending: null });
    useLabCommandOutput.getState().reset();
  });

  it('sends the question and shows the reply', async () => {
    labAssist.mockResolvedValue({ reply: 'A bucket holds keys.', commands: [] });
    renderDrawer();

    await ask('what is a bucket?');

    expect(await screen.findByText('A bucket holds keys.')).toBeInTheDocument();
    expect(labAssist).toHaveBeenCalledWith('sess-1', expect.objectContaining({ message: 'what is a bucket?' }));
  });

  // Answering "why did that fail?" needs the real error, not a description of it.
  it('sends the terminal tail as context', async () => {
    recordTerminalOutput('sess-1', '$ aws s3 ls\nNoSuchBucket: the bucket does not exist');
    labAssist.mockResolvedValue({ reply: 'The bucket is missing.', commands: [] });
    renderDrawer();

    await ask('why did that fail?');

    await waitFor(() =>
      expect(labAssist).toHaveBeenCalledWith(
        'sess-1',
        expect.objectContaining({ terminal: expect.stringContaining('NoSuchBucket') }),
      ),
    );
  });

  it('does not leak another session’s terminal output', async () => {
    recordTerminalOutput('other-session', 'secret output from a different lab');
    labAssist.mockResolvedValue({ reply: 'ok', commands: [] });
    renderDrawer();

    await ask('hello');

    await waitFor(() => expect(labAssist).toHaveBeenCalled());
    expect(labAssist.mock.calls[0][1].terminal).toBe('');
  });

  it('carries the conversation as history', async () => {
    labAssist.mockResolvedValue({ reply: 'first answer', commands: [] });
    renderDrawer();
    await ask('first question');
    await screen.findByText('first answer');

    labAssist.mockResolvedValue({ reply: 'second answer', commands: [] });
    await ask('second question');

    await waitFor(() => expect(labAssist).toHaveBeenCalledTimes(2));
    expect(labAssist.mock.calls[1][1].history).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
    ]);
  });

  // Regression: replies are markdown, and rendering them raw showed the user
  // literal "**" and backticks instead of formatting.
  it('renders the reply as markdown, not raw text', async () => {
    labAssist.mockResolvedValue({
      reply: '**Explanation**\n\n- A bucket holds `keys`.\n- Keys can contain slashes.',
      commands: [],
    });
    renderDrawer();

    await ask('what is a bucket?');

    // Bold, list items and inline code become elements rather than literal syntax.
    const bold = await screen.findByText('Explanation');
    expect(bold.tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('keys').tagName).toBe('CODE');
    expect(screen.queryByText(/\*\*Explanation\*\*/)).not.toBeInTheDocument();
  });

  // The user's own message is shown as typed — it is not model output.
  it('leaves the user message as literal text', async () => {
    labAssist.mockResolvedValue({ reply: 'ok', commands: [] });
    renderDrawer();

    await ask('what does **this** mean?');

    expect(await screen.findByText('what does **this** mean?')).toBeInTheDocument();
  });

  // The point of proposing rather than doing: nothing runs until accepted.
  it('proposes commands without running them', async () => {
    labAssist.mockResolvedValue({
      reply: 'Try this.',
      commands: [{ run: 'aws s3 mb s3://demo', explain: 'creates the bucket' }],
    });
    renderDrawer();

    await ask('make me a bucket');

    expect(await screen.findByText('aws s3 mb s3://demo')).toBeInTheDocument();
    expect(screen.getByText('creates the bucket')).toBeInTheDocument();
    expect(runLabCommand).not.toHaveBeenCalled();
  });

  it('runs the commands once accepted and shows their output', async () => {
    labAssist.mockResolvedValue({ reply: 'Try this.', commands: [{ run: 'aws s3 mb s3://demo' }] });
    runLabCommand.mockResolvedValue({ stdout: 'make_bucket: demo\n', stderr: '', exitCode: 0 });
    renderDrawer();

    await ask('make me a bucket');
    await userEvent.click(await screen.findByRole('button', { name: /run in the lab/i }));

    await waitFor(() => expect(runLabCommand).toHaveBeenCalledWith('sess-1', 'aws s3 mb s3://demo'));
    expect(await screen.findByText(/make_bucket: demo/)).toBeInTheDocument();
  });

  // Later commands usually assume the earlier ones worked.
  it('stops at the first failing command', async () => {
    labAssist.mockResolvedValue({
      reply: 'Two steps.',
      commands: [{ run: 'first' }, { run: 'second' }],
    });
    runLabCommand.mockResolvedValueOnce({ stdout: '', stderr: 'boom', exitCode: 1 });
    renderDrawer();

    await ask('do it');
    await userEvent.click(await screen.findByRole('button', { name: /run in the lab/i }));

    await waitFor(() => expect(runLabCommand).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/exited 1/)).toBeInTheDocument();
  });

  it('runs the remaining commands when the first succeeds', async () => {
    labAssist.mockResolvedValue({ reply: 'Two steps.', commands: [{ run: 'first' }, { run: 'second' }] });
    runLabCommand.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    renderDrawer();

    await ask('do it');
    await userEvent.click(await screen.findByRole('button', { name: /run in the lab/i }));

    await waitFor(() => expect(runLabCommand).toHaveBeenCalledTimes(2));
  });
});
