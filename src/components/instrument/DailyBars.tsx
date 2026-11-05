import { useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import type { Chart, ChartData, ChartOptions, Plugin } from 'chart.js';
import { format } from 'date-fns';
import { useTheme } from '../../hooks/useTheme';
import { CHART_STYLE, prefersReducedMotion } from '../../utils/chartConfig';

/** `rgb(r, g, b)` → `rgba(r, g, b, a)`. */
function withAlpha(rgb: string, a: number) {
  return rgb.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `, ${a})`);
}

function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  const a = Math.abs(v);
  if (a >= 1e12) return `${trim(v / 1e12)}T`;
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}k`;
  if (a > 0 && a < 1) return v.toFixed(2);
  return trim(v);
}

/** Local calendar date of an ISO string or `YYYY-MM-DD`, ignoring the time part. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const hatchCache = new Map<string, CanvasPattern | string>();
/** Diagonal stripes in the series color: the bar for a day that has not finished. */
function hatch(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | string {
  const hit = hatchCache.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 6;
  const g = c.getContext('2d');
  if (!g) return withAlpha(color, 0.5);
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-1, 7);
  g.lineTo(7, -1);
  g.moveTo(-1, 1);
  g.lineTo(1, -1);
  g.moveTo(5, 7);
  g.lineTo(7, 5);
  g.stroke();
  const p = ctx.createPattern(c, 'repeat') ?? withAlpha(color, 0.5);
  hatchCache.set(color, p);
  return p;
}

/**
 * One bar per day. The headline readout lives outside (the caller owns it and
 * listens to `onHover`), so the chart itself carries no tooltip: hovering a bar
 * dims the rest and reports its index.
 */
export function DailyBars({
  values,
  dates,
  color,
  format: fmt,
  partialLast = false,
  cumulative,
  cumulativeColor = 'rgb(232, 65, 66)',
  formatCumulative,
  onHover,
  className = '',
}: {
  values: number[];
  /** ISO dates, one per value. */
  dates: string[];
  /** Series color as `rgb(r, g, b)`. */
  color: string;
  format: (v: number) => string;
  /** The last bar is today and still filling: draw it hatched and label it "Today". */
  partialLast?: boolean;
  /** Running total per day, drawn as a line on its own right-hand axis. */
  cumulative?: number[];
  cumulativeColor?: string;
  /** Tooltip text for a point on the cumulative line. */
  formatCumulative?: (v: number) => string;
  onHover?: (index: number | null) => void;
  className?: string;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [hovered, setHovered] = useState<number | null>(null);
  const [lineTip, setLineTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const lineColor = cumulativeColor;
  const formatCumulativeAxis = cumulative ? fmt : undefined;
  const stageColor = isDark ? 'rgb(14, 16, 19)' : 'rgb(250, 251, 252)';
  const hoveredRef = useRef<number | null>(null);
  const reduced = prefersReducedMotion();

  const tickColor = isDark ? CHART_STYLE.tick.dark : CHART_STYLE.tick.light;
  const gridColor = isDark ? CHART_STYLE.grid.dark : CHART_STYLE.grid.light;

  // react-chartjs-2 registers plugins only when the chart is created, so the
  // plugins below read current props from this ref at draw time.
  const live = useRef({ isDark, fmt, tickColor, partialLast, cumulative, lineColor, stageColor, lineTip });
  live.current = { isDark, fmt, tickColor, partialLast, cumulative, lineColor, stageColor, lineTip };

  // Dashed rule at the window's high, labelled at the right like a scale mark.
  const highLine = useMemo<Plugin<'bar'>>(
    () => ({
      id: 'dailyBarsHigh',
      // Under the datasets, so the cumulative line stays on top of the label.
      beforeDatasetsDraw(chart: Chart<'bar'>) {
        const { isDark, fmt, tickColor, partialLast } = live.current;
        const all = chart.data.datasets[0]?.data as number[] | undefined;
        if (!all || all.length < 2) return;
        const data = partialLast ? all.slice(0, -1) : all;
        const max = Math.max(...data.filter((v) => Number.isFinite(v)));
        if (!(max > 0)) return;
        const { ctx, chartArea, scales } = chart;
        const y = Math.round(scales.y.getPixelForValue(max)) + 0.5;
        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(201, 206, 212, 0.35)' : 'rgba(58, 63, 69, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        const label = `high ${fmt(max)}`;
        ctx.font = `11px ${ChartFont}`;
        // Left end: the right end is where the latest value and its chip live.
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        const w = ctx.measureText(label).width;
        ctx.fillStyle = isDark ? 'rgb(14, 16, 19)' : 'rgb(250, 251, 252)';
        ctx.fillRect(chartArea.left, y - 16, w + 6, 14);
        ctx.fillStyle = tickColor;
        ctx.fillText(label, chartArea.left + 2, y - 3);
        ctx.restore();
      },
    }),
    [],
  );

  // Dot on the line where the tooltip points.
  const lineDot = useMemo<Plugin<'bar'>>(
    () => ({
      id: 'dailyBarsLineDot',
      afterDatasetsDraw(chart: Chart<'bar'>) {
        const { cumulative, fmt, lineColor, stageColor, lineTip } = live.current;
        const meta = chart.getDatasetMeta(1);
        if (!cumulative || !meta?.data.length) return;
        const { ctx } = chart;
        // Latest total, marked at the end of the line.
        const end = meta.data[meta.data.length - 1];
        const endLabel = fmt(cumulative[cumulative.length - 1]);
        ctx.save();
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 3, 0, Math.PI * 2);
        ctx.fill();
        // Chip in the stage color so the label reads over the bars.
        ctx.font = `500 11px ${ChartFont}`;
        const w = ctx.measureText(endLabel).width + 10;
        const cx = Math.min(end.x - w / 2, chart.chartArea.right - w);
        const cy = end.y - 24;
        ctx.fillStyle = stageColor;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cx, cy, w, 17, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = lineColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(endLabel, cx + w / 2, cy + 9);
        ctx.restore();
        if (!lineTip) return;
        const pt = meta.data[lineTip.i];
        if (!pt) return;
        ctx.save();
        ctx.fillStyle = lineColor;
        ctx.strokeStyle = stageColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      },
    }),
    [],
  );

  const data = useMemo(() => {
    const last = values.length - 1;
    return {
      labels: dates.map((d, i) => (partialLast && i === last ? 'Today' : format(parseDay(d), 'MMM d'))),
      datasets: [
        {
          data: values,
          backgroundColor: (ctx: { chart: Chart; dataIndex: number }) => {
            const i = ctx.dataIndex;
            const h = hovered;
            const dim = h != null && h !== i;
            if (partialLast && i === last) return hatch(ctx.chart.ctx, dim ? withAlpha(color, 0.45) : color);
            return withAlpha(color, h === i ? 1 : dim ? 0.45 : 0.85);
          },
          borderRadius: { topLeft: 1.5, topRight: 1.5 },
          borderSkipped: 'bottom' as const,
          categoryPercentage: 0.86,
          barPercentage: 0.9,
          maxBarThickness: 40,
          minBarLength: 1,
        },
        ...(cumulative
          ? [
              {
                type: 'line' as const,
                data: cumulative,
                yAxisID: 'y1',
                borderColor: lineColor,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHitRadius: 0,
                tension: 0,
                order: -2,
              },
            ]
          : []),
      ],
    };
  }, [values, dates, color, partialLast, cumulative, lineColor, hovered]);

  const cumulativeRange = useMemo(() => {
    const xs = (cumulative ?? []).filter((v) => Number.isFinite(v));
    if (xs.length < 2) return {};
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const span = hi - lo || hi * 0.01 || 1;
    // Keep the line in the middle band (about 25% to 70% of the height),
    // so it neither hugs the top nor sinks into the axis.
    // Suggested, not fixed, so the axis still rounds to clean tick values.
    return { suggestedMin: Math.max(0, lo - span * 0.5), suggestedMax: hi + span * 0.6 };
  }, [cumulative]);

  const options = useMemo<ChartOptions<'bar'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: reduced ? false : { duration: 300, easing: 'easeOutQuart' },
      // Hover recolors bars through a data update; keep that instant.
      transitions: { active: { animation: { duration: 0 } } },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      onHover: (e, els, chart) => {
        const i = els.length ? els[0].index : null;
        // Pointer within a few px of the cumulative line: show its tooltip.
        const pt = i != null && cumulative ? chart.getDatasetMeta(1)?.data[i] : undefined;
        const near = pt && e.y != null && Math.abs(pt.y - e.y) <= 10;
        const tip = near && i != null ? { i, x: pt.x, y: pt.y } : null;
        if (tip?.i !== live.current.lineTip?.i) {
          live.current.lineTip = tip;
          chart.draw(); // redraw the hover dot without a data update
        }
        setLineTip(tip);
        if (i === hoveredRef.current) return;
        hoveredRef.current = i;
        setHovered(i);
        onHover?.(i);
      },
      layout: { padding: { top: 18 } },
      scales: {
        x: {
          grid: { display: false },
          border: { color: gridColor },
          ticks: { color: tickColor, maxRotation: 0, autoSkip: true, autoSkipPadding: 28 },
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          border: { display: false },
          ticks: {
            color: tickColor,
            maxTicksLimit: 5,
            padding: 8,
            // Under a stacked panel the top label would collide with the panel's own.
            callback: (v) => compact(Number(v)),
          },
        },
        y1: {
          display: !!cumulative,
          position: 'right',
          beginAtZero: false,
          ...cumulativeRange,
          grid: { display: false },
          border: { display: false },
          // Same precision as the headline; one-decimal rounding repeated labels on a narrow span.
          ticks: { color: tickColor, maxTicksLimit: 5, padding: 8, callback: (v) => (Number(v) === 0 ? '0' : (formatCumulativeAxis ?? compact)(Number(v))) },
        },
      },
    }),
    [reduced, gridColor, tickColor, onHover, cumulative, cumulativeRange, formatCumulativeAxis],
  );

  return (
    <div
      className={`h-full w-full ${className}`}
      onMouseLeave={() => {
        hoveredRef.current = null;
        setHovered(null);
        setLineTip(null);
        onHover?.(null);
      }}
      data-hovered={hovered ?? undefined}
    >
      <div className="relative h-full w-full">
        <Bar data={data as ChartData<'bar'>} options={options} plugins={[highLine, lineDot]} updateMode="none" />
        {lineTip && cumulative && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full -mt-2.5 px-2.5 py-1.5 rounded border border-border bg-popover shadow-lg whitespace-nowrap"
            style={{ left: lineTip.x, top: lineTip.y }}
          >
            <div className="text-[11px] text-muted-foreground">{format(parseDay(dates[lineTip.i]), 'MMM d, yyyy')}</div>
            <div className="num text-[12px] text-foreground">{(formatCumulative ?? fmt)(cumulative[lineTip.i])}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const ChartFont = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
