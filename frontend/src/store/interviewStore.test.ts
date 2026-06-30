import { beforeEach, describe, expect, it } from 'vitest';
import { useInterviewStore } from './interviewStore';
import type { InterviewStartResponse } from '@/types/domain';

const session: InterviewStartResponse = {
  sessionId: 's1',
  topic: { id: 'url_shortener', title: 'URL Shortener', prompt: 'Design it.', constraints: ['10k rps'] },
};

describe('interviewStore', () => {
  beforeEach(() => useInterviewStore.getState().reset());

  it('begin seeds the session with the opening prompt as the first turn', () => {
    useInterviewStore.getState().begin(session);
    const s = useInterviewStore.getState();
    expect(s.phase).toBe('designing');
    expect(s.sessionId).toBe('s1');
    expect(s.transcript).toHaveLength(1);
    expect(s.transcript[0]).toEqual({ role: 'interviewer', content: 'Design it.' });
  });

  it('accumulates the transcript and latches ready', () => {
    useInterviewStore.getState().begin(session);
    useInterviewStore.getState().pushUser('I add an API and DB');
    useInterviewStore.getState().pushInterviewer('Your DB is a SPOF.', ['add replica'], false);
    expect(useInterviewStore.getState().transcript).toHaveLength(3);
    expect(useInterviewStore.getState().ready).toBe(false);

    useInterviewStore.getState().pushInterviewer('Looks good.', [], true);
    expect(useInterviewStore.getState().ready).toBe(true);
    // ready stays latched even if a later turn says false.
    useInterviewStore.getState().pushInterviewer('one more thing', [], false);
    expect(useInterviewStore.getState().ready).toBe(true);
  });

  it('setGrade moves to done', () => {
    useInterviewStore.getState().begin(session);
    useInterviewStore.getState().setGrade({ summary: 'ok', overall: 80, rubric: [] });
    expect(useInterviewStore.getState().phase).toBe('done');
    expect(useInterviewStore.getState().grade?.overall).toBe(80);
  });
});
