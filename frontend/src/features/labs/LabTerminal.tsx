import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AlertTriangle } from 'lucide-react';
import { labTerminalURL } from '@/lib/api';
import '@xterm/xterm/css/xterm.css';

/**
 * A real shell attached to the lab's workstation container.
 *
 * Keystrokes go out as binary frames and control messages (resize) as text, so
 * the two never need an in-band escape. The backend runs `docker exec` under a
 * PTY, which is why the prompt, echo, colour and line editing all behave.
 */
export function LabTerminal({ sessionId }: { sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'connecting' | 'open' | 'closed'>('connecting');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: 13,
      cursorBlink: true,
      // Matches the app's surface palette so the terminal reads as part of the
      // panel rather than a pasted-in black box.
      theme: {
        background: '#0c0e13',
        foreground: '#eef0f4',
        cursor: '#2fd39e',
        selectionBackground: '#232936',
        black: '#08090c',
        red: '#ff6058',
        green: '#2fd39e',
        yellow: '#f5b14b',
        blue: '#4aa3ff',
        magenta: '#7c74ff',
        cyan: '#45e3b0',
        white: '#aeb2bd',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const socket = new WebSocket(labTerminalURL(sessionId));
    socket.binaryType = 'arraybuffer';

    const sendResize = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    socket.onopen = () => {
      setState('open');
      sendResize();
      term.focus();
    };
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') return; // control frames (e.g. exit)
      term.write(new Uint8Array(event.data));
    };
    socket.onclose = () => {
      setState('closed');
      term.write('\r\n\x1b[38;5;244m— session closed —\x1b[0m\r\n');
    };
    socket.onerror = () => setState('closed');

    const encoder = new TextEncoder();
    const keys = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(encoder.encode(data));
    });

    // Refit on container resize (panel drag, window resize) and tell the PTY,
    // so full-screen programs and wrapping stay correct.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
        sendResize();
      } catch {
        // The observer can fire while the node is detached; nothing to do.
      }
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      keys.dispose();
      socket.close();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-surface-line px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
          workstation shell
        </span>
        <ConnectionBadge state={state} />
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden bg-surface p-2" />
    </div>
  );
}

function ConnectionBadge({ state }: { state: 'connecting' | 'open' | 'closed' }) {
  if (state === 'open') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
        connected
      </span>
    );
  }
  if (state === 'connecting') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        <span className="h-1.5 w-1.5 animate-pulse-line rounded-full bg-amber" />
        connecting
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-danger">
      <AlertTriangle className="h-3 w-3" />
      disconnected
    </span>
  );
}
