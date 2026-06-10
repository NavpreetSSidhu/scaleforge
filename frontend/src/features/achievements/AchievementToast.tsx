import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAchievementToastStore, type AchievementToast as Toast } from '@/store/achievementToastStore';
import { achievementIcon } from './icons';

/** Stacked celebration toasts shown when a simulation unlocks achievements. */
export function AchievementToaster() {
  const toasts = useAchievementToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastCard key={toast.key} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useAchievementToastStore((s) => s.dismiss);
  const [visible, setVisible] = useState(false);
  const Icon = achievementIcon(toast.achievement.icon);

  useEffect(() => {
    // Mount → animate in; auto-dismiss after a few seconds.
    const enter = window.setTimeout(() => setVisible(true), 10);
    const leave = window.setTimeout(() => setVisible(false), 5200);
    const remove = window.setTimeout(() => dismiss(toast.key), 5500);
    return () => {
      window.clearTimeout(enter);
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, [toast.key, dismiss]);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-72 items-start gap-3 rounded-xl border border-accent/30 bg-surface-panel/95 p-3 shadow-lg shadow-black/40 backdrop-blur transition-all duration-300 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">
          Achievement unlocked
        </div>
        <div className="truncate text-sm font-semibold text-ink">{toast.achievement.name}</div>
        <div className="text-[11px] text-ink-faint">{toast.achievement.description}</div>
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.key)}
        aria-label="Dismiss"
        className="shrink-0 text-ink-ghost transition hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
