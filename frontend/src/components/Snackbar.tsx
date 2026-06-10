import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useSnackbar, type Snack } from '@/store/snackbarStore';

const VARIANT = {
  success: { icon: CheckCircle2, color: '#2fd39e' },
  error: { icon: XCircle, color: '#ff6058' },
  info: { icon: Info, color: '#4aa3ff' },
} as const;

const AUTO_DISMISS_MS = 3200;

/** Renders the global snackbar queue, bottom-right, auto-dismissing each entry. */
export function Snackbar() {
  const snacks = useSnackbar((s) => s.snacks);
  const dismiss = useSnackbar((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {snacks.map((s) => (
          <SnackRow key={s.id} snack={s} onDismiss={() => dismiss(s.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function SnackRow({ snack, onDismiss }: { snack: Snack; onDismiss: () => void }) {
  const { icon: Icon, color } = VARIANT[snack.variant];

  useEffect(() => {
    const handle = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      role="status"
      className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-white/[0.08] bg-surface-panel/95 px-3.5 py-2.5 shadow-panel backdrop-blur"
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color }} />
      <span className="text-sm text-ink">{snack.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-ghost transition hover:bg-surface-hover hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}
