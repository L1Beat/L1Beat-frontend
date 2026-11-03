import { cleanStatus } from './AcpStatus';

// Lifecycle colors from the categorical palette: gold while proposed, blue once
// implementable, green when live. Stale, withdrawn and drafts stay gray; none is red.
export const ACP_STATUS_COLOR: Record<string, string> = {
  Activated: '#199e70',
  Active: '#199e70',
  Implementable: '#3987e5',
  Proposed: '#d4a017',
  Review: '#d4a017',
};
export const acpStatusColor = (status?: string) => ACP_STATUS_COLOR[cleanStatus(status)] ?? '#6b7280';

/** A status pill tinted in its lifecycle color. */
export function AcpStatusChip({ status, size = 'sm' }: { status?: string; size?: 'sm' | 'md' }) {
  const clean = cleanStatus(status);
  const color = acpStatusColor(status);
  return (
    <span
      // Text stays in the foreground color: gold text on a light page is too faint.
      className={`inline-flex items-center gap-1.5 rounded-[4px] font-medium whitespace-nowrap text-foreground ${
        size === 'md' ? 'h-6 px-2 text-[12px]' : 'h-5 px-1.5 text-[11px]'
      }`}
      style={{ background: `${color}24` }}
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {clean}
    </span>
  );
}
