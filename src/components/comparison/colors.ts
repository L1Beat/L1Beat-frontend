// Series colors for compared chains, from the categorical palette in
// DESIGN_SYSTEM.md. No red (it means down) and no green (it means up).
export const SERIES_COLORS = ['#3987e5', '#d95926', '#8b5cf6', '#d4a017'] as const;

export const seriesColor = (index: number) => SERIES_COLORS[index % SERIES_COLORS.length];
