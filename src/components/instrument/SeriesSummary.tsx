/**
 * Low / average / high / latest for the series currently on screen. Sits
 * directly under a chart so the eye can check the line against numbers.
 */
export function SeriesSummary({
  values,
  format,
  className = '',
}: {
  values: number[];
  format: (v: number) => string;
  className?: string;
}) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return null;
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const latest = nums[nums.length - 1];
  const cells: [string, number][] = [
    ['Low', low],
    ['Average', avg],
    ['High', high],
    ['Latest', latest],
  ];
  return (
    <dl className={`flex flex-wrap gap-x-6 gap-y-1 text-[11px] leading-4 ${className}`}>
      {cells.map(([label, v]) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="num text-foreground">{format(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
