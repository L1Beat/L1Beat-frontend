import type React from 'react';

/**
 * Props that let a bar or line chart be inspected by mouse, touch and keyboard,
 * not only by a hovering mouse.
 *
 * - Mouse: the bar under the cursor; leaving the chart clears it.
 * - Touch: tap or drag across the bars. Vertical swipes still scroll the page,
 *   and the last bar touched stays shown after the finger lifts.
 * - Keyboard: Tab to the chart, then arrow keys, Home and End; Escape clears.
 */
export function chartPointerProps<E extends SVGElement>({
  onMove,
  count,
  hover,
  setHover,
}: {
  /** Maps a pointer position to a bar and sets it; the chart's existing hover handler. */
  onMove: (e: React.MouseEvent<E>) => void;
  count: number;
  hover: number | null;
  setHover: (i: number | null) => void;
}) {
  return {
    onPointerMove: onMove,
    onPointerDown: onMove,
    onPointerLeave: (e: React.PointerEvent<E>) => {
      if (e.pointerType === 'mouse') setHover(null);
    },
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent<E>) => {
      if (!count) return;
      const at = hover ?? count;
      const next =
        e.key === 'ArrowLeft' ? Math.max(0, at - 1)
        : e.key === 'ArrowRight' ? Math.min(count - 1, hover == null ? count - 1 : at + 1)
        : e.key === 'Home' ? 0
        : e.key === 'End' ? count - 1
        : e.key === 'Escape' ? null
        : undefined;
      if (next === undefined) return;
      e.preventDefault();
      setHover(next);
    },
    onBlur: () => setHover(null),
    style: { touchAction: 'pan-y' } as React.CSSProperties,
  };
}
