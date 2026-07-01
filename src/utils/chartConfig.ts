import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
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
  Title,
  Tooltip,
  Legend,
  Filler
);

// NOTE: Custom plugins (crosshair, watermark, averageLine) are NOT registered globally
// They should be passed to individual chart components via the plugins prop to avoid
// affecting other chart types like Pie charts

// --- Canonical chart house style -------------------------------------------
// Single source of truth for chart visuals so the Chart.js charts and the
// hand-drawn SVG charts read identically. Values chosen to match what most
// charts already used; see CHART_STYLE consumers across the app.
export const CHART_STYLE = {
  accent: '#ef4444',
  accentRgb: '239, 68, 68',
  line: { width: 1.75, sparkWidth: 1.25, tension: 0.35 },
  // Area gradient (top → bottom) in accent red.
  gradient: { top: 0.28, mid: 0.12, bottom: 0 },
  grid: { dark: 'rgba(148, 163, 184, 0.08)', light: 'rgba(0, 0, 0, 0.05)', svgOpacity: 0.08 },
  tick: { dark: '#94a3b8', light: '#64748b', size: 11 },
  crosshair: { color: 'rgba(239, 68, 68, 0.4)', width: 1, dash: [6, 4] as number[], svgDash: '6 4' },
  hover: { radius: 4, strokeWidth: 2 },
  animation: { duration: 750, easing: 'easeInOutQuart' as const },
  // Centered watermark — reads as branding and survives a shared screenshot
  // crop, vs a corner logo that collides with axis labels.
  watermark: { width: 160, opacity: 0.18, aspect: 29 / 120 },
} as const;

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
  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.97)' : 'rgba(255, 255, 255, 0.98)',
  titleColor: isDark ? '#f1f5f9' : '#0f172a',
  bodyColor: isDark ? '#cbd5e1' : '#334155',
  borderColor: isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)',
  borderWidth: 1,
  padding: 12,
  cornerRadius: 12,
  titleFont: { size: 14, weight: 'bold' as const },
  bodyFont: { size: 13 },
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
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }
  }
};

// Line shadow plugin for a subtle glow effect
export const lineShadowPlugin: Plugin<'line'> = {
  id: 'lineShadow',
  beforeDatasetsDraw: (chart) => {
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(239, 68, 68, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
  },
  afterDatasetsDraw: (chart) => {
    chart.ctx.restore();
  }
};

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
    
    if (!loaded || !logo) return;
    
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
    ctx.font = '10px Inter, system-ui, sans-serif';
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
  duration: reducedMotion ? 0 : 750,
  easing: 'easeInOutQuart' as const,
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

