export { StatStrip, Delta } from './StatStrip';
export type { StatItem } from './StatStrip';
export { SegmentedControl } from './SegmentedControl';
export { PageHeader } from './PageHeader';
export { UpdatedAgo } from './UpdatedAgo';
export { SeriesSummary } from './SeriesSummary';
// DailyBars is imported from './instrument/DailyBars' directly: it registers
// Chart.js, and re-exporting it here pulled the chart library into every page.
