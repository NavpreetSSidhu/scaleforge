import { useId, useState } from 'react';

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

/**
 * Minimal hover/focus tooltip. Wraps a single interactive child and shows a
 * styled label — accessible (described-by) and keyboard-reachable, unlike a bare
 * title attribute. Keep labels short.
 */
export function Tooltip({ label, children, side = 'bottom', className = '' }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[0.08] bg-surface-panel px-2 py-1 text-[11px] font-medium text-ink shadow-panel ${
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
          }`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
