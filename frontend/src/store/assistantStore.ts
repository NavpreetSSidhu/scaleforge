import { create } from 'zustand';
import type { AssistantAction } from '@/types/domain';

export interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  /** Proposed graph actions (assistant turns only). */
  actions?: AssistantAction[];
  /** Marks actions already applied so the UI can dim the chips. */
  applied?: boolean;
}

interface AssistantState {
  open: boolean;
  messages: ChatEntry[];
  /** A prompt queued by another feature to auto-send when the drawer opens. */
  pending: string | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Open the drawer and queue a prompt to send automatically (e.g. from chaos mode). */
  openWith: (prompt: string) => void;
  clearPending: () => void;
  pushUser: (content: string) => void;
  pushAssistant: (content: string, actions?: AssistantAction[]) => number;
  markApplied: (id: number) => void;
  reset: () => void;
}

let seq = 0;

/**
 * Ephemeral chat state for the AI assistant drawer. History lives in memory only
 * (cleared on reload) — enough for a multi-turn conversation without persistence.
 */
export const useAssistantStore = create<AssistantState>((set) => ({
  open: false,
  messages: [],
  pending: null,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  openWith: (prompt) => set({ open: true, pending: prompt }),
  clearPending: () => set({ pending: null }),
  pushUser: (content) =>
    set((s) => ({ messages: [...s.messages, { id: ++seq, role: 'user', content }] })),
  pushAssistant: (content, actions) => {
    const id = ++seq;
    set((s) => ({ messages: [...s.messages, { id, role: 'assistant', content, actions }] }));
    return id;
  },
  markApplied: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, applied: true } : m)),
    })),
  reset: () => set({ messages: [] }),
}));
