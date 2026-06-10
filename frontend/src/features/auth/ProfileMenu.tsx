import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useArchitectureStore } from '@/store/architectureStore';

/** Initials for the avatar: up to two from the name, else two from the email. */
export function initialsFor(user: { name?: string; email?: string } | null): string {
  if (!user) return 'G';
  const source = user.name?.trim() || user.email || '';
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) return 'G';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ProfileMenu() {
  const { user, logout, openAuthPrompt } = useAuthStore();
  const setView = useArchitectureStore((s) => s.setView);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const isGuest = user == null;

  const handleLogout = () => {
    logout();
    setOpen(false);
    setView('builder');
    queryClient.removeQueries({ queryKey: ['architectures'] });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (isGuest ? openAuthPrompt() : setOpen((o) => !o))}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label={isGuest ? 'Sign in' : 'Account menu'}
        title={isGuest ? 'Sign in' : user?.email}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition hover:brightness-110 ${
          isGuest
            ? 'border border-dashed border-white/20 text-ink-faint'
            : 'bg-gradient-to-br from-info to-violet text-white'
        }`}
      >
        {initialsFor(user)}
      </button>

      {!isGuest && open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-surface-panel shadow-panel">
          <div className="border-b border-white/[0.06] px-3 py-3">
            <div className="truncate text-sm font-semibold text-ink">{user?.name || 'Account'}</div>
            <div className="truncate text-xs text-ink-faint">{user?.email}</div>
          </div>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleLogout();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-ink-muted transition hover:bg-surface-hover hover:text-ink"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
