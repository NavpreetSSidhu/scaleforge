import { create, type StoreApi, type UseBoundStore } from 'zustand';

/**
 * One turn of an AI chat, generic over the action type a given assistant
 * proposes (infra graph actions vs. agentic-workflow actions). Assistant turns
 * may carry previewable actions; `applied` dims them once the user accepts.
 */
export interface ChatEntry<A> {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  actions?: A[];
  applied?: boolean;
}

export interface ChatState<A> {
  open: boolean;
  messages: ChatEntry<A>[];
  /** A prompt queued by another feature to auto-send when the drawer opens. */
  pending: string | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Open the drawer and queue a prompt to send automatically (e.g. from chaos mode). */
  openWith: (prompt: string) => void;
  clearPending: () => void;
  pushUser: (content: string) => void;
  pushAssistant: (content: string, actions?: A[]) => number;
  markApplied: (id: number) => void;
  reset: () => void;
}

let seq = 0;

/**
 * Builds an ephemeral chat store for an AI drawer. History lives in memory only
 * (cleared on reload) — enough for a multi-turn conversation without persistence.
 * The same shape powers the infra Architecture Assistant and the Agent Studio
 * assistant; only the action type `A` differs, so the shared ChatDrawer renders
 * both. Kept as a factory (one store per surface) so the two conversations never
 * bleed into each other.
 */
export function createChatStore<A>(): UseBoundStore<StoreApi<ChatState<A>>> {
  return create<ChatState<A>>((set) => ({
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
}
