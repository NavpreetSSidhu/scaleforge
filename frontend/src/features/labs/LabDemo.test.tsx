import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// xterm needs real layout measurement that jsdom doesn't provide; the replay
// logic and the objectives panel are what these tests are about.
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    write() {}
    writeln() {}
    open() {}
    loadAddon() {}
    dispose() {}
  },
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

import { LabDemo } from './LabDemo';

describe('LabDemo', () => {
  it('shows the S3 lab objectives, all outstanding at the start', () => {
    render(<LabDemo onClose={() => {}} />);

    expect(screen.getByText(/S3: Buckets, Objects & Versioning/)).toBeInTheDocument();
    expect(screen.getByText('0/5')).toBeInTheDocument();
    expect(screen.getByText(/1\. Create a bucket/)).toBeInTheDocument();
  });

  // The demo stands in for a real run, so it must be labelled as a replay rather
  // than passing for a live lab.
  it('is labelled a replay', () => {
    render(<LabDemo onClose={() => {}} />);

    expect(screen.getByText('replay')).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
  });

  it('ticks objectives off as the replay progresses', async () => {
    render(<LabDemo onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('1/5')).toBeInTheDocument(), { timeout: 15000 });
  }, 20000);

  it('closes', async () => {
    const onClose = vi.fn();
    render(<LabDemo onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /close the demo/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
