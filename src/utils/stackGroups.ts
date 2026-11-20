// Stacked supply bands, styled like Lending's chart: one blue and one teal,
// each at full and half strength, so the bands read as one family and red
// stays reserved for falls. Largest issuer first.
export const STACK_STYLES = [
  { color: '#3987e5', opacity: 1 },
  { color: '#3987e5', opacity: 0.55 },
  { color: '#22a6c9', opacity: 1 },
  { color: '#22a6c9', opacity: 0.5 },
];
export const STACK_OTHERS = { color: '#6b7280', opacity: 0.6 };

/** Name of the band that collects the smaller issuers. */
export const OTHERS = 'Others';

/**
 * Which issuers get their own band, from each one's value today: up to four,
 * and only those big enough to read (5% of the total); the rest fold into
 * Others. The RWA page uses the same split, so a band picked in the legend
 * matches the rows it filters to.
 */
export function stackGroups(latest: [string, number][]): { own: string[]; others: string[] } {
  const ranked = [...latest].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((acc, [, v]) => acc + v, 0);
  const own = ranked.filter(([, v], i) => i < STACK_STYLES.length && (i === 0 || v >= total * 0.05)).map(([n]) => n);
  return { own, others: ranked.map(([n]) => n).filter((n) => !own.includes(n)) };
}
