import { create } from 'zustand';
import type {
  InterviewGradeResponse,
  InterviewMessage,
  InterviewStartResponse,
  InterviewTopic,
} from '@/types/domain';

export type InterviewPhase = 'idle' | 'designing' | 'grading' | 'done';

interface InterviewState {
  sessionId: string | null;
  topic: InterviewTopic | null;
  transcript: InterviewMessage[];
  /** Latest follow-up suggestions from the interviewer. */
  followUps: string[];
  /** The interviewer signalled the design is complete enough to grade. */
  ready: boolean;
  phase: InterviewPhase;
  grade: InterviewGradeResponse | null;

  begin: (session: InterviewStartResponse) => void;
  pushUser: (content: string) => void;
  pushInterviewer: (content: string, followUps: string[], ready: boolean) => void;
  setGrade: (grade: InterviewGradeResponse) => void;
  setPhase: (phase: InterviewPhase) => void;
  reset: () => void;
}

const cleared = {
  sessionId: null,
  topic: null,
  transcript: [] as InterviewMessage[],
  followUps: [] as string[],
  ready: false,
  phase: 'idle' as InterviewPhase,
  grade: null as InterviewGradeResponse | null,
};

/** State for the AI System Design Interviewer. The candidate designs on the real
 *  architecture store; this only holds the interview session + transcript. */
export const useInterviewStore = create<InterviewState>((set) => ({
  ...cleared,

  begin: (session) =>
    set({
      ...cleared,
      sessionId: session.sessionId,
      topic: session.topic,
      phase: 'designing',
      // The opening prompt is the interviewer's first turn.
      transcript: [{ role: 'interviewer', content: session.topic.prompt }],
    }),

  pushUser: (content) =>
    set((s) => ({ transcript: [...s.transcript, { role: 'user', content }] })),

  pushInterviewer: (content, followUps, ready) =>
    set((s) => ({
      transcript: [...s.transcript, { role: 'interviewer', content }],
      followUps,
      ready: s.ready || ready,
    })),

  setGrade: (grade) => set({ grade, phase: 'done' }),
  setPhase: (phase) => set({ phase }),
  reset: () => set({ ...cleared }),
}));
