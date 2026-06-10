import { create } from 'zustand';
import type { Achievement } from '@/types/domain';

/** A queued unlock toast — `key` makes each appearance unique for animations. */
export interface AchievementToast {
  key: string;
  achievement: Achievement;
}

interface AchievementToastState {
  toasts: AchievementToast[];
  /** Enqueue newly-unlocked achievements (deduped against what's already showing). */
  push: (achievements: Achievement[]) => void;
  dismiss: (key: string) => void;
}

let counter = 0;

export const useAchievementToastStore = create<AchievementToastState>((set, get) => ({
  toasts: [],

  push: (achievements) => {
    if (achievements.length === 0) return;
    const showing = new Set(get().toasts.map((t) => t.achievement.id));
    const next = achievements
      .filter((a) => !showing.has(a.id))
      .map((achievement) => ({ key: `${achievement.id}-${counter++}`, achievement }));
    if (next.length === 0) return;
    set((state) => ({ toasts: [...state.toasts, ...next] }));
  },

  dismiss: (key) => set((state) => ({ toasts: state.toasts.filter((t) => t.key !== key) })),
}));
