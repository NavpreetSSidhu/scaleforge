import { Loader2 } from 'lucide-react';

/** Small inline loading spinner. Inherits text color via currentColor. */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}
