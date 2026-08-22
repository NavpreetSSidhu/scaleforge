import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LabGuide } from './LabGuide';

describe('LabGuide', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('explains the three things that make Labs unusual', async () => {
    render(<LabGuide onWatchDemo={() => {}} />);

    expect(screen.getByText('How Labs works')).toBeInTheDocument();
    expect(screen.getByText(/1\. Start a lab/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Work in a real shell/)).toBeInTheDocument();
    expect(screen.getByText(/3\. Objectives check the live system/)).toBeInTheDocument();
  });

  it('launches the demo', async () => {
    const onWatchDemo = vi.fn();
    render(<LabGuide onWatchDemo={onWatchDemo} />);

    await userEvent.click(screen.getByRole('button', { name: /watch a 60-second demo/i }));

    expect(onWatchDemo).toHaveBeenCalled();
  });

  it('expands to the full explanation on demand', async () => {
    render(<LabGuide onWatchDemo={() => {}} />);

    expect(screen.queryByText(/breaking things is the point/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /tell me more/i }));
    expect(screen.getByText(/breaking things is the point/i)).toBeInTheDocument();
  });

  it('stays dismissed across visits, but can be reopened', async () => {
    const { unmount } = render(<LabGuide onWatchDemo={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss the guide/i }));
    // Collapsed to the reopen button — the steps are what should disappear.
    expect(screen.queryByText(/1\. Start a lab/)).not.toBeInTheDocument();
    unmount();

    render(<LabGuide onWatchDemo={() => {}} />);
    // Collapsed on a return visit...
    expect(screen.queryByText(/1\. Start a lab/)).not.toBeInTheDocument();
    // ...but still reachable.
    await userEvent.click(screen.getByRole('button', { name: /how labs works/i }));
    expect(screen.getByText(/1\. Start a lab/)).toBeInTheDocument();
  });

  // Private browsing and some embedded webviews throw on localStorage access.
  it('still renders when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    render(<LabGuide onWatchDemo={() => {}} />);

    expect(screen.getByText('How Labs works')).toBeInTheDocument();
  });

  it('does not crash when the dismissal cannot be saved', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<LabGuide onWatchDemo={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /dismiss the guide/i }));

    expect(screen.queryByText(/1\. Start a lab/)).not.toBeInTheDocument();
  });
});
