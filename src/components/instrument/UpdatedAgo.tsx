import { useEffect, useState } from 'react';

function label(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/**
 * "Updated 14s ago" in place of a LIVE pill. Says what the pill implied and
 * also says when it stops being true.
 */
export function UpdatedAgo({
  at,
  refreshing = false,
  className = '',
}: {
  at: number | null;
  refreshing?: boolean;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [at]);
  if (at == null) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap ${className}`}>
      <span
        aria-hidden
        className={`w-1.5 h-1.5 rounded-full ${refreshing ? 'bg-muted-foreground animate-pulse' : 'bg-up'}`}
      />
      {refreshing ? 'Refreshing' : `Updated ${label(at, now)}`}
    </span>
  );
}
