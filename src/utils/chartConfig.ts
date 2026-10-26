import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  Plugin
} from 'chart.js';

// Register Chart.js components once globally (only core components, not custom plugins)
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// One font for every chart: tick labels and tooltips are numbers, so they
// get the mono face and tabular figures like the rest of the UI.
ChartJS.defaults.font.family = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
ChartJS.defaults.font.size = 11;

// NOTE: Custom plugins (crosshair, watermark, averageLine) are NOT registered globally
// They should be passed to individual chart components via the plugins prop to avoid
// affecting other chart types like Pie charts

// --- Canonical chart house style -------------------------------------------
// Single source of truth for chart visuals so the Chart.js charts and the
// hand-drawn SVG charts read identically. Values chosen to match what most
// charts already used; see CHART_STYLE consumers across the app.
export const CHART_STYLE = {
  // Brand red: UI only (logo, active rule). Never a data series. On a chart,
  // red always means down.
  accent: '#e84142',
  accentRgb: '232, 65, 66',
  // Default single-series ink, per theme. Neutral so the page reads graphite
  // and off-white rather than black and red.
  ink: { dark: '#c9ced4', darkRgb: '201, 206, 212', light: '#3a3f45', lightRgb: '58, 63, 69' },
  up: '#3dbe7a',
  upRgb: '61, 190, 122',
  down: '#e84142',
  downRgb: '232, 65, 66',
  line: { width: 1.5, sparkWidth: 1.25, tension: 0.2 },
  // Area fill under a line, top to bottom. Kept faint: a hint of weight, not a glow.
  gradient: { top: 0.1, mid: 0.04, bottom: 0 },
  grid: { dark: 'rgba(148, 163, 184, 0.08)', light: 'rgba(0, 0, 0, 0.06)', svgOpacity: 0.08 },
  tick: { dark: '#8b939c', light: '#687078', size: 11 },
  crosshair: { color: 'rgba(148, 163, 184, 0.5)', width: 1, dash: [4, 4] as number[], svgDash: '4 4' },
  hover: { radius: 3, strokeWidth: 1.5 },
  animation: { duration: 400, easing: 'easeOutQuart' as const },
  // Watermark retired: a logo in the plot area competes with the data.
  // Kept at 0 so remaining callers render nothing without a code change.
  watermark: { width: 0, opacity: 0, aspect: 29 / 120 },
} as const;

/** Theme-aware default series color, e.g. for a single line chart. */
export const getInkColor = (isDark: boolean) => (isDark ? CHART_STYLE.ink.dark : CHART_STYLE.ink.light);
export const getInkRgb = (isDark: boolean) => (isDark ? CHART_STYLE.ink.darkRgb : CHART_STYLE.ink.lightRgb);

// Build a smooth SVG path (Catmull-Rom → cubic bézier) through points, so the
// hand-drawn SVG line charts curve like the Chart.js ones (tension 0.35) and
// the d3 curveMonotoneX charts — without pulling d3 into those routes.
export function smoothLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) {
    return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

// Tooltip styling shared by all Chart.js charts (line, bar, pie).
export const chartTooltipStyle = (isDark: boolean) => ({
  backgroundColor: isDark ? 'rgba(26, 29, 33, 0.98)' : 'rgba(255, 255, 255, 0.98)',
  titleColor: isDark ? '#e8eaed' : '#17191c',
  bodyColor: isDark ? '#c9ced4' : '#3a3f45',
  borderColor: isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(0, 0, 0, 0.12)',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 4,
  titleFont: { size: 12, weight: 500 as const },
  bodyFont: { size: 12 },
  displayColors: false,
});

// Crosshair plugin for interactive cursor tracking
export const crosshairPlugin: Plugin<'line'> = {
  id: 'crosshair',
  afterDraw: (chart) => {
    const activeElements = chart.getActiveElements();
    if (activeElements.length > 0) {
      const ctx = chart.ctx;
      const x = activeElements[0].element.x;
      const topY = chart.scales.y.top;
      const bottomY = chart.scales.y.bottom;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.lineWidth = CHART_STYLE.crosshair.width;
      ctx.strokeStyle = CHART_STYLE.crosshair.color;
      ctx.setLineDash(CHART_STYLE.crosshair.dash);
      ctx.stroke();
      ctx.restore();
    }
  }
};

// Line glow retired: instrument output has no drop shadow. Kept as a no-op so
// existing `plugins={[lineShadowPlugin, ...]}` call sites stay valid.
export const lineShadowPlugin: Plugin<'line'> = { id: 'lineShadow' };

// Cache for the logo images (dark and light versions)
let logoDark: HTMLImageElement | null = null;
let logoLight: HTMLImageElement | null = null;
let logoDarkLoaded = false;
let logoLightLoaded = false;

// Pre-load both logos (using static versions since canvas can't animate SVGs)
if (typeof window !== 'undefined') {
  logoDark = new Image();
  logoDark.onload = () => { logoDarkLoaded = true; };
  logoDark.src = '/logo-dark.svg';
  
  logoLight = new Image();
  logoLight.onload = () => { logoLightLoaded = true; };
  logoLight.src = '/logo-light.svg';
}

// Helper to detect if dark mode is active
const isDarkMode = (): boolean => {
  if (typeof document === 'undefined') return true;
  return document.documentElement.classList.contains('dark');
};

// Watermark plugin - L1Beat logo in bottom-right corner.
// Typed generically (not Plugin<'line'>) so it works on line and bar charts.
export const watermarkPlugin: Plugin = {
  id: 'watermark',
  afterDraw: (chart) => {
    const dark = isDarkMode();
    const logo = dark ? logoDark : logoLight;
    const loaded = dark ? logoDarkLoaded : logoLightLoaded;
    
    if (!loaded || !logo || CHART_STYLE.watermark.opacity === 0) return;
    
    const ctx = chart.ctx;
    const { chartArea } = chart;
    if (!chartArea) return;
    
    ctx.save();

    // Centered watermark (see CHART_STYLE.watermark).
    const logoWidth = CHART_STYLE.watermark.width;
    const logoHeight = logoWidth * CHART_STYLE.watermark.aspect;
    const x = (chartArea.left + chartArea.right) / 2 - logoWidth / 2;
    const y = (chartArea.top + chartArea.bottom) / 2 - logoHeight / 2;

    ctx.globalAlpha = CHART_STYLE.watermark.opacity;
    ctx.drawImage(logo, x, y, logoWidth, logoHeight);

    ctx.restore();
  }
};

// Average line plugin
export const averageLinePlugin: Plugin<'line'> = {
  id: 'averageLine',
  afterDraw: (chart) => {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || meta.data.length === 0) return;
    
    const dataset = chart.data.datasets[0];
    if (!dataset || !dataset.data || dataset.data.length === 0) return;
    
    const values = dataset.data.filter((v): v is number => typeof v === 'number');
    if (values.length === 0) return;
    
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const yScale = chart.scales.y;
    const yPos = yScale.getPixelForValue(avg);
    
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(chart.chartArea.left, yPos);
    ctx.lineTo(chart.chartArea.right, yPos);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.setLineDash([8, 4]);
    ctx.stroke();
    
    // Draw average label
    ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('AVG', chart.chartArea.right - 5, yPos - 3);
    
    ctx.restore();
  }
};

// Helper to detect reduced motion preference
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Get animation config based on reduced motion preference
export const getAnimationConfig = (reducedMotion: boolean) => ({
  duration: reducedMotion ? 0 : CHART_STYLE.animation.duration,
  easing: CHART_STYLE.animation.easing,
});

// Create gradient fill for chart
export const createGradient = (
  ctx: CanvasRenderingContext2D,
  chartArea: { top: number; bottom: number },
  color: string
) => {
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, color.replace(')', `, ${CHART_STYLE.gradient.top})`).replace('rgb', 'rgba'));
  gradient.addColorStop(0.5, color.replace(')', `, ${CHART_STYLE.gradient.mid})`).replace('rgb', 'rgba'));
  gradient.addColorStop(1, color.replace(')', `, ${CHART_STYLE.gradient.bottom})`).replace('rgb', 'rgba'));
  return gradient;
};

// Export Chart.js for use in components
export { ChartJS };

