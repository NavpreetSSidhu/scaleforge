import { useQuery } from '@tanstack/react-query';
import { Lock, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { Achievement } from '@/types/domain';
import { achievementIcon } from './icons';

/**
 * Dashboard panel showing every achievement with the user's unlock state.
 * Signed-in users get live data from the API; guests see the locked catalog as a
 * teaser (achievements only persist once you have an account).
 */
export function AchievementsPanel() {
  const isGuest = useAuthStore((s) => s.user == null);

  const { data: achievements = [], isLoading } = useQuery({
    queryKey: ['achievements'],
    queryFn: api.listAchievements,
    enabled: !isGuest,
  });

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const showSkeleton = !isGuest && isLoading && achievements.length === 0;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-surface/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Trophy className="h-4 w-4 text-amber" /> Achievements
        </h2>
        {!isGuest && (
          <span className="text-xs text-ink-faint">
            {unlockedCount}/{achievements.length || '—'} unlocked
          </span>
        )}
      </div>

      {isGuest && (
        <p className="mb-3 text-[11px] text-ink-faint">
          Sign in to earn and track achievements as you run simulations.
        </p>
      )}

      {showSkeleton ? (
        <p className="px-1 py-4 text-sm text-ink-faint">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {achievements.map((a) => (
            <AchievementBadge key={a.id} achievement={a} />
          ))}
        </div>
      )}
    </section>
  );
}

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const Icon = achievement.unlocked ? achievementIcon(achievement.icon) : Lock;

  return (
    <div
      title={achievement.unlocked ? achievement.description : achievement.hint}
      className={`flex items-start gap-2.5 rounded-xl border px-2.5 py-2 transition ${
        achievement.unlocked
          ? 'border-accent/25 bg-accent/[0.06]'
          : 'border-white/[0.05] bg-surface-panel/40'
      }`}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          achievement.unlocked ? 'bg-accent/15 text-accent' : 'bg-surface-line/60 text-ink-ghost'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div
          className={`truncate text-xs font-semibold ${
            achievement.unlocked ? 'text-ink' : 'text-ink-faint'
          }`}
        >
          {achievement.name}
        </div>
        <div className="truncate text-[11px] text-ink-faint">
          {achievement.unlocked ? achievement.description : achievement.hint}
        </div>
      </div>
    </div>
  );
}
