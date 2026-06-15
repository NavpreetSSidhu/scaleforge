import { create } from 'zustand';

export interface TutorChatEntry {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

export type TutorTab = 'teacher' | 'qna';

interface LearnState {
  /** Slug (built-in) or id (user course) currently open in the player, or null. */
  activeCourse: string | null;
  /** Zero-based index of the active step within the open course. */
  stepIndex: number;
  /** When true the Learn tab shows the course editor instead of catalog/player. */
  editing: boolean;
  /** Id of the user course being edited, or null when authoring a new one. */
  editingCourseId: string | null;
  /** Tutor drawer state + which agent tab is active. */
  drawerOpen: boolean;
  tab: TutorTab;
  /** Separate conversation histories for the two agents. */
  teacherMessages: TutorChatEntry[];
  qnaMessages: TutorChatEntry[];

  openCourse: (slug: string) => void;
  closeCourse: () => void;
  openEditor: (courseId?: string) => void;
  closeEditor: () => void;
  setStep: (index: number) => void;
  openDrawer: (tab?: TutorTab) => void;
  closeDrawer: () => void;
  setTab: (tab: TutorTab) => void;
  pushMessage: (tab: TutorTab, role: 'user' | 'assistant', content: string) => void;
  resetChat: (tab: TutorTab) => void;
}

let seq = 0;

/**
 * Ephemeral state for the Learn module: which course/step is open, the tutor
 * drawer, and the two in-memory agent conversations (cleared on reload).
 * Progress itself lives server-side (DB-backed) via React Query, not here.
 */
export const useLearnStore = create<LearnState>((set) => ({
  activeCourse: null,
  stepIndex: 0,
  editing: false,
  editingCourseId: null,
  drawerOpen: false,
  tab: 'teacher',
  teacherMessages: [],
  qnaMessages: [],

  openCourse: (slug) => set({ activeCourse: slug, stepIndex: 0, editing: false }),
  closeCourse: () => set({ activeCourse: null, stepIndex: 0, drawerOpen: false }),
  openEditor: (courseId) =>
    set({ editing: true, editingCourseId: courseId ?? null, activeCourse: null }),
  closeEditor: () => set({ editing: false, editingCourseId: null }),
  setStep: (index) => set({ stepIndex: Math.max(0, index) }),
  openDrawer: (tab) => set((s) => ({ drawerOpen: true, tab: tab ?? s.tab })),
  closeDrawer: () => set({ drawerOpen: false }),
  setTab: (tab) => set({ tab }),
  pushMessage: (tab, role, content) =>
    set((s) => {
      const key = tab === 'teacher' ? 'teacherMessages' : 'qnaMessages';
      return { [key]: [...s[key], { id: ++seq, role, content }] } as Partial<LearnState>;
    }),
  resetChat: (tab) =>
    set(tab === 'teacher' ? { teacherMessages: [] } : { qnaMessages: [] }),
}));
