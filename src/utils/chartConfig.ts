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
  ChartOptions,
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

// Watermark plugin - L1Beat logo in bottom-right corner
export const watermarkPlugin: Plugin<'line'> = {
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
    
    // Logo dimensions - smaller for corner placement
    const logoWidth = 120;
    const logoHeight = 29;
    
    // Position in bottom-right corner with padding
    const padding = 12;
    const x = chartArea.right - logoWidth - padding;
    const y = chartArea.bottom - logoHeight - padding;
    
    // Set transparency for watermark effect
    ctx.globalAlpha = 0.25;
    
    // Draw the logo
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
  gradient.addColorStop(0, color.replace(')', ', 0.4)').replace('rgb', 'rgba'));
  gradient.addColorStop(0.5, color.replace(')', ', 0.15)').replace('rgb', 'rgba'));
  gradient.addColorStop(1, color.replace(')', ', 0.02)').replace('rgb', 'rgba'));
  return gradient;
};

// Export Chart.js for use in components
export { ChartJS };

