// Status and complexity marks shared by the ACP list, cards and detail page.

const statusDot: Record<string, string> = {
  Activated: 'bg-up',
  Active: 'bg-up',
  Implementable: 'bg-[#3987e5]',
  Proposed: 'bg-[#d4a017]',
  Review: 'bg-[#d4a017]',
  Draft: 'bg-muted-foreground/60',
  Stale: 'bg-muted-foreground/40',
  Withdrawn: 'bg-muted-foreground/40',
  Rejected: 'bg-muted-foreground/40',
};

/** "Activated (in Durango)" -> "Activated". */
export function cleanStatus(status?: string): string {
  return status?.match(/^[a-zA-Z]+/)?.[0] ?? 'Unknown';
}

export function AcpStatus({ status, className = 'text-[11px] text-muted-foreground' }: { status?: string; className?: string }) {
  const clean = cleanStatus(status);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${statusDot[clean] ?? 'bg-muted-foreground/40'}`} />
      {clean}
    </span>
  );
}

export function ComplexityDots({ level }: { level?: string }) {
  const n = level === 'Very High' ? 4 : level === 'High' ? 3 : level === 'Medium' ? 2 : level === 'Low' ? 1 : 0;
  return (
    <span className="inline-flex items-center gap-0.5" title={level ? `${level} complexity` : 'Unknown complexity'} aria-label={level ? `${level} complexity` : undefined}>
      {Array.from({ length: 4 }).map((_, i) => (
        <span key={i} aria-hidden className={`w-1.5 h-1.5 rounded-full ${i < n ? 'bg-foreground/70' : 'bg-muted'}`} />
      ))}
    </span>
  );
}
