import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../branding/ui/tooltip';

export interface StatItem {
  label: string;
  /** Already formatted. Use '—' when unknown. A node is allowed for live-updating values. */
  value: string | ReactNode;
  /** Percent change. null/undefined hides the delta line. */
  delta?: number | null;
  /** e.g. "vs prior 7d". Rendered after the delta. */
  deltaLabel?: string;
  /** Secondary line when there is no delta, e.g. a unit or a reason for '—'. */
  sub?: string;
  tooltip?: string;
}

/**
 * One row of headline numbers divided by hairlines. Replaces the four-card
 * KPI grid: no icons, no per-card chrome, numbers in the mono face so they
 * line up across cells.
 */
export function StatStrip({
  items,
  footnote,
  className = '',
  floating = false,
}: {
  items: StatItem[];
  /** Source or method note under the strip, e.g. "Source: L1Beat indexer". */
  footnote?: ReactNode;
  className?: string;
  /** Translucent panel for overlaying on a visual (the Overview hero). */
  floating?: boolean;
}) {
  const cols =
    items.length >= 4
      ? 'grid-cols-2 md:grid-cols-4'
      : items.length === 3
        ? 'grid-cols-3'
        : items.length === 2
          ? 'grid-cols-2'
          : 'grid-cols-1';
  return (
    <TooltipProvider delayDuration={150}>
      <div className={className}>
        <dl
          className={`grid ${cols} border border-border rounded-md overflow-hidden ${
            floating ? 'bg-card/85 supports-[backdrop-filter]:bg-card/70 backdrop-blur-md shadow-lg' : 'bg-card'
          } [&>div]:border-border [&>div:not(:first-child)]:border-l ${
            items.length >= 4 ? '[&>div:nth-child(3)]:border-l-0 md:[&>div:nth-child(3)]:border-l [&>div:nth-child(n+3)]:border-t md:[&>div:nth-child(n+3)]:border-t-0' : ''
          }`}
        >
          {items.map((it) => (
            <div key={it.label} className="px-4 py-3 min-w-0">
              <dt className="flex items-center gap-1.5 text-[12px] text-muted-foreground leading-4">
                <span className="truncate">{it.label}</span>
                {it.tooltip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`About ${it.label}`}
                        className="shrink-0 text-muted-foreground/70 hover:text-foreground transition-colors"
                      >
                        <Info className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="start"
                      className="max-w-[260px] bg-popover border border-border text-foreground text-[11px] leading-relaxed px-3 py-2 shadow-lg [&>span]:hidden"
                    >
                      {it.tooltip}
                    </TooltipContent>
                  </Tooltip>
                )}
              </dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                <span className="num text-[22px] leading-7 font-medium text-foreground truncate">{it.value}</span>
                {it.delta != null && Number.isFinite(it.delta) && (
                  <Delta value={it.delta} label={it.deltaLabel} />
                )}
              </dd>
              {it.delta == null && it.sub && (
                <div className="mt-0.5 text-[11px] text-muted-foreground leading-4 truncate">{it.sub}</div>
              )}
            </div>
          ))}
        </dl>
        {footnote && <p className="mt-1.5 text-[11px] text-muted-foreground leading-4">{footnote}</p>}
      </div>
    </TooltipProvider>
  );
}

/** Signed percent in up/down ink. Flat reads muted. */
export function Delta({ value, label, className = '' }: { value: number; label?: string; className?: string }) {
  const flat = Math.abs(value) < 0.05;
  const tone = flat ? 'text-muted-foreground' : value > 0 ? 'text-up' : 'text-down';
  const text = flat ? '0.0%' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`;
  return (
    <span className={`num text-[11px] leading-4 ${className}`}>
      <span className={tone}>{text}</span>
      {label && <span className="text-muted-foreground"> {label}</span>}
    </span>
  );
}
