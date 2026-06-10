import { beforeEach, describe, expect, it } from 'vitest';
import { useAchievementToastStore } from './achievementToastStore';
import type { Achievement } from '@/types/domain';

function ach(id: string): Achievement {
  return {
    id,
    name: id,
    description: 'desc',
    icon: 'rocket',
    hint: 'hint',
    unlocked: true,
    unlockedAt: new Date().toISOString(),
  };
}

describe('achievementToastStore', () => {
  beforeEach(() => {
    useAchievementToastStore.setState({ toasts: [] });
  });

  it('enqueues new achievements with unique keys', () => {
    useAchievementToastStore.getState().push([ach('a'), ach('b')]);
    const { toasts } = useAchievementToastStore.getState();
    expect(toasts).toHaveLength(2);
    expect(new Set(toasts.map((t) => t.key)).size).toBe(2);
  });

  it('ignores an empty push', () => {
    useAchievementToastStore.getState().push([]);
    expect(useAchievementToastStore.getState().toasts).toHaveLength(0);
  });

  it('dedupes achievements already being shown', () => {
    const store = useAchievementToastStore.getState();
    store.push([ach('a')]);
    store.push([ach('a'), ach('c')]);
    const ids = useAchievementToastStore.getState().toasts.map((t) => t.achievement.id);
    expect(ids).toEqual(['a', 'c']);
  });

  it('dismisses by key', () => {
    useAchievementToastStore.getState().push([ach('a')]);
    const { toasts, dismiss } = useAchievementToastStore.getState();
    dismiss(toasts[0].key);
    expect(useAchievementToastStore.getState().toasts).toHaveLength(0);
  });
});
