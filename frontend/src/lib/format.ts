/** Compact a number to a short, human-friendly string: 6300 -> "6.3k". */
export function compact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return trim(value / 1_000_000) + 'M';
  if (abs >= 1_000) return trim(value / 1_000) + 'k';
  return String(Math.round(value));
}

function trim(value: number): string {
  return value
    .toFixed(1)
    .replace(/\.0$/, '');
}

/** Compact a USD amount: 3300 -> "$3.3k", 270 -> "$270". */
export function compactUsd(value: number): string {
  return '$' + compact(value);
}

/** Coarse "time ago" label from an ISO timestamp: "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
