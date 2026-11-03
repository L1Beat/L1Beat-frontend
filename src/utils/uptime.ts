// ACP-267, activated with the Helicon upgrade on Sep 22, 2026 at 15:00 UTC:
// Primary Network validations that start at or after it need 90% uptime for
// staking rewards; validations that started earlier keep the 80% minimum.
// L1 validators are unaffected. Source: build.avax.network/docs/primary-network/helicon-upgrade
export const HELICON_ACTIVATION = Date.parse('2026-09-22T15:00:00Z');

/** The uptime a Primary Network validation needs for rewards, from its start time. Unknown starts get 80%. */
export function uptimeMinimum(start?: string | number | null): 80 | 90 {
  if (start == null) return 80;
  const t = typeof start === 'number' ? start : Date.parse(start);
  return Number.isFinite(t) && t >= HELICON_ACTIVATION ? 90 : 80;
}

/** Bar fill on the shared 80 to 100% uptime scale. */
export const uptimeFill = (value: number) => Math.max(0, Math.min(100, ((value - 80) / 20) * 100));
