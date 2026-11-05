/**
 * Past about a year, daily bars get thinner than a pixel and the chart turns
 * into a shimmer, so flow charts group days into weeks instead.
 */
export const WEEKLY_AFTER_DAYS = 400;

/**
 * The Sunday (UTC) that starts the week of a YYYY-MM-DD day, as YYYY-MM-DD.
 * Sunday, because the indexer's weekly series (burn, stablecoins) start there.
 */
export function weekStart(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  const dow = new Date(t).getUTCDay();
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
}
