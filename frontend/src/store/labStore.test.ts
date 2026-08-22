import { beforeEach, describe, expect, it } from 'vitest';
import { useLabStore } from './labStore';

describe('labStore', () => {
  beforeEach(() => {
    useLabStore.setState({ sessionId: null, labId: null, revealedHints: {} });
  });

  it('starts with no attached session', () => {
    const { sessionId, labId } = useLabStore.getState();
    expect(sessionId).toBeNull();
    expect(labId).toBeNull();
  });

  it('attaches to a session', () => {
    useLabStore.getState().setSession('sess-1', 's3-object-storage');
    expect(useLabStore.getState().sessionId).toBe('sess-1');
    expect(useLabStore.getState().labId).toBe('s3-object-storage');
  });

  it('reveals hints per task without disturbing the others', () => {
    const { revealHint } = useLabStore.getState();
    revealHint('create-bucket', 'aws s3 mb s3://scaleforge-lab');
    revealHint('put-object', 'aws s3 cp ...');

    expect(useLabStore.getState().revealedHints).toEqual({
      'create-bucket': 'aws s3 mb s3://scaleforge-lab',
      'put-object': 'aws s3 cp ...',
    });
  });

  // Hints are per-run help. Carrying them into the next lab would hand the user
  // answers to objectives they haven't attempted.
  it('drops revealed hints when a new session starts', () => {
    useLabStore.getState().setSession('sess-1', 's3-object-storage');
    useLabStore.getState().revealHint('create-bucket', 'aws s3 mb ...');
    useLabStore.getState().setSession('sess-2', 'redis-caching');

    expect(useLabStore.getState().revealedHints).toEqual({});
    expect(useLabStore.getState().labId).toBe('redis-caching');
  });

  it('clears everything on teardown', () => {
    useLabStore.getState().setSession('sess-1', 's3-object-storage');
    useLabStore.getState().revealHint('create-bucket', 'aws s3 mb ...');
    useLabStore.getState().clearSession();

    expect(useLabStore.getState()).toMatchObject({
      sessionId: null,
      labId: null,
      revealedHints: {},
    });
  });
});
