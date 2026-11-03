/**
 * A small trend line. Colored by direction (first vs last value) unless a
 * `color` is given, e.g. a venue's own color for a volume series, where up and
 * down carry no judgement. `fill` adds a faint area under the line.
 */
export function Sparkline({
  data,
  width = 88,
  height = 22,
  color,
  fill = false,
  className = '',
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
}) {
  if (!data || data.length < 2) return null;
  const min = fill ? 0 : Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 2) - 1] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const stroke = color ?? (data[data.length - 1] >= data[0] ? 'var(--up)' : 'var(--down)');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden>
      {fill && <polygon points={`0,${height} ${line} ${width},${height}`} fill={stroke} opacity={0.14} />}
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
    </svg>
  );
}
