import { create } from 'zustand';
import { createChatStore, type ChatEntry } from '@/store/createChatStore';
import type { LabCommand } from '@/types/lab';

export type LabChatEntry = ChatEntry<LabCommand>;

/** Conversation with the assistant beside a running lab. */
export const useLabAssistantStore = createChatStore<LabCommand>();

/**
 * A rolling tail of what the terminal has printed, kept so the assistant can
 * answer "why did that fail?" against the user's real output instead of guessing.
 *
 * It lives outside React state deliberately: the terminal emits on every
 * keystroke and every byte of output, and re-rendering the workspace at that rate
 * would make the shell feel sluggish. Readers pull the tail only when a message
 * is sent.
 */
const MAX_TERMINAL_TAIL = 8000;

interface TerminalBuffer {
  sessionId: string | null;
  text: string;
}

const buffer: TerminalBuffer = { sessionId: null, text: '' };

/** Appends terminal output, trimming to the most recent output. */
export function recordTerminalOutput(sessionId: string, chunk: string) {
  if (buffer.sessionId !== sessionId) {
    buffer.sessionId = sessionId;
    buffer.text = '';
  }
  buffer.text += chunk;
  if (buffer.text.length > MAX_TERMINAL_TAIL) {
    buffer.text = buffer.text.slice(-MAX_TERMINAL_TAIL);
  }
}

/** Returns the tail for a session, or '' if the buffer belongs to another one. */
export function terminalTail(sessionId: string): string {
  return buffer.sessionId === sessionId ? buffer.text : '';
}

export function clearTerminalBuffer() {
  buffer.sessionId = null;
  buffer.text = '';
}

/** Output from commands the user accepted, rendered under the chat turn. */
interface CommandOutputState {
  outputs: Record<number, string>;
  setOutput: (entryId: number, text: string) => void;
  reset: () => void;
}

export const useLabCommandOutput = create<CommandOutputState>((set) => ({
  outputs: {},
  setOutput: (entryId, text) => set((s) => ({ outputs: { ...s.outputs, [entryId]: text } })),
  reset: () => set({ outputs: {} }),
}));
