/**
 * Past about a year, daily bars get thinner than a pixel and the chart turns
 * into a shimmer, so flow charts group days into weeks instead.
 */
export const WEEKLY_AFTER_DAYS = 400;

/** The Monday (UTC) that starts the week of a YYYY-MM-DD day, as YYYY-MM-DD. */
export function weekStart(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
}
