import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Neutral segmented toggle for ranges and views. Active state is a filled
 * neutral, not brand red: red on this site means down.
 *
 * `glass` is for controls floating over a hero visual: a liquid-glass capsule
 * whose active segment is a lens that slides between options.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
  ariaLabel,
  glass = false,
}: {
  value: T;
  options: readonly T[] | readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: 'xs' | 'sm';
  ariaLabel?: string;
  glass?: boolean;
}) {
  const h = size === 'xs' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-[12px]';
  const items = options.map((o) => ({
    v: (typeof o === 'string' ? o : o.value) as T,
    label: typeof o === 'string' ? o : o.label,
  }));
  const activeIndex = items.findIndex((it) => it.v === value);

  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [lens, setLens] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    if (!glass) return;
    const place = () => {
      const el = btnRefs.current[activeIndex];
      setLens(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    place();
    const ro = new ResizeObserver(place);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [glass, activeIndex]);

  if (glass) {
    return (
      <div
        ref={wrapRef}
        role="tablist"
        aria-label={ariaLabel}
        className="liquid-glass relative inline-flex items-center p-1 rounded-full"
      >
        {lens && (
          <span
            aria-hidden
            className="liquid-glass-lens absolute top-1 bottom-1 left-0 rounded-full transition-[transform,width] duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)] motion-reduce:transition-none"
            style={{ width: lens.w, transform: `translateX(${lens.x}px)` }}
          />
        )}
        {items.map(({ v, label }, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={v}
              ref={(el) => (btnRefs.current[i] = el)}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(v)}
              className={`relative z-10 ${size === 'xs' ? 'h-6 px-2.5 text-[11px]' : 'h-7 px-3 text-[12px]'} rounded-full font-medium num transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 ${
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-px p-px rounded border border-border bg-background"
    >
      {items.map(({ v, label }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`${h} rounded-[3px] font-medium num transition-colors ${
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
