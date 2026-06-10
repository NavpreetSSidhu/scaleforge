import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, Mail, User, X } from 'lucide-react';
import { api, type AuthResponse } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

type Mode = 'login' | 'signup';

export function AuthModal() {
  const { promptOpen, promptReason, promptMode, closeAuthPrompt, setSession } = useAuthStore();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  // Reset fields and adopt the requested tab whenever the modal reopens.
  useEffect(() => {
    if (promptOpen) {
      setMode(promptMode);
      setEmail('');
      setName('');
      setPassword('');
    }
  }, [promptOpen, promptMode]);

  const submit = useMutation<AuthResponse, Error>({
    mutationFn: () =>
      mode === 'signup'
        ? api.signup({ email, name, password })
        : api.login({ email, password }),
    onSuccess: ({ token, user }) => {
      setSession(token, user);
      queryClient.invalidateQueries({ queryKey: ['architectures'] });
    },
  });

  // Close on Escape.
  useEffect(() => {
    if (!promptOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAuthPrompt();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [promptOpen, closeAuthPrompt]);

  if (!promptOpen) return null;

  const switchMode = (next: Mode) => {
    setMode(next);
    submit.reset();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={closeAuthPrompt}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-surface-panel shadow-panel">
        <button
          type="button"
          aria-label="Close"
          onClick={closeAuthPrompt}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-6 pt-7">
          <h2 className="text-lg font-bold text-ink">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            {promptReason ??
              (mode === 'signup'
                ? 'Save, sync and share your architectures.'
                : 'Sign in to access your saved architectures.')}
          </p>

          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            {mode === 'signup' && (
              <Field icon={<User className="h-4 w-4" />}>
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-ghost"
                  autoComplete="name"
                />
              </Field>
            )}
            <Field icon={<Mail className="h-4 w-4" />}>
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-ghost"
                autoComplete="email"
              />
            </Field>
            <Field icon={<Lock className="h-4 w-4" />}>
              <input
                type="password"
                required
                minLength={mode === 'signup' ? 8 : undefined}
                placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-ghost"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </Field>

            {submit.isError && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {submit.error.message}
              </p>
            )}

            <button
              type="submit"
              disabled={submit.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-ink-faint">
            {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
              className="font-semibold text-accent hover:underline"
            >
              {mode === 'signup' ? 'Sign in' : 'Create one'}
            </button>
          </p>

          <button
            type="button"
            onClick={closeAuthPrompt}
            className="mt-2 w-full text-center text-[11px] text-ink-ghost transition hover:text-ink-faint"
          >
            Continue as guest
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-surface/60 px-3 py-2.5 focus-within:border-accent/50">
      <span className="text-ink-faint">{icon}</span>
      {children}
    </label>
  );
}
