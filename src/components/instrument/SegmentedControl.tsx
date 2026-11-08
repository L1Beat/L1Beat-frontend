/**
 * Neutral segmented toggle for ranges and views. Active state is a filled
 * neutral, not brand red: red on this site means down.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
  ariaLabel,
}: {
  value: T;
  options: readonly T[] | readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: 'xs' | 'sm';
  ariaLabel?: string;
}) {
  const h = size === 'xs' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-[12px]';
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-px p-px rounded border border-border bg-background"
    >
      {options.map((o) => {
        const v = (typeof o === 'string' ? o : o.value) as T;
        const raw = typeof o === 'string' ? o : o.label;
        // Ranges read the same everywhere: 24h, 7d, 30d, 1y.
        const label = /^\d+[HDY]$/.test(raw) ? raw.toLowerCase() : raw;
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`${h} relative tap-y rounded-[3px] font-medium num whitespace-nowrap transition-colors ${
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
