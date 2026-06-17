import { useTheme } from '../hooks/useTheme';
import { CHART_STYLE } from '../utils/chartConfig';

/**
 * Faint, centered L1Beat logo over a chart, matching the Chart.js
 * `watermarkPlugin`. For hand-drawn SVG charts where the canvas plugin can't
 * reach. Centered (not cornered) so it reads as branding and survives a
 * shared screenshot crop without colliding with axis labels.
 *
 * Render inside a `position: relative` container (the chart plot area).
 */
export function ChartWatermark() {
  const { theme } = useTheme();
  const src = theme === 'dark' ? '/logo-dark.svg' : '/logo-light.svg';
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
      style={{ width: CHART_STYLE.watermark.width, opacity: CHART_STYLE.watermark.opacity }}
    />
  );
}
