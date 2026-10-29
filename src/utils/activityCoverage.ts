import { format } from 'date-fns';
import type { Chain } from '../types';

const STALE_AFTER_DAYS = 3;

/** True when a chain's newest daily point is several days old. */
export function isStale(lastTimestamp: number | null | undefined, now = Date.now()) {
  return lastTimestamp != null && now / 1000 - lastTimestamp > STALE_AFTER_DAYS * 86400;
}

/**
 * Why a chain has no recent activity numbers. Chains outside Avalanche's
 * metrics API are counted block by block from their public RPC, which can take
 * days for a busy chain; chains without an RPC can't be counted at all.
 * `lastTimestamp` is the newest point the chain does have, if any.
 */
export function missingActivity(chain: Pick<Chain, 'rpcUrl'>, lastTimestamp?: number | null) {
  const since = lastTimestamp != null ? format(new Date(lastTimestamp * 1000), 'MMM d') : null;
  if (chain.rpcUrl) {
    const source = "This chain isn't in Avalanche's metrics API, so its transactions are counted from its public RPC.";
    return since
      ? { title: `No activity data since ${since}`, short: `on ${since}`, detail: `${source} Days after ${since} are still being counted.` }
      : { title: 'Activity is still being counted', short: 'Counting', detail: `${source} No full day has been counted yet.` };
  }
  const source = "This chain has no public RPC and isn't in Avalanche's metrics API";
  return since
    ? { title: `No activity data since ${since}`, short: `on ${since}`, detail: `${source}, so there's no data after ${since}.` }
    : { title: 'No activity data for this chain yet', short: 'No data yet', detail: `${source}, so its transactions can't be counted.` };
}

type Counted = { chainCount?: number | null };

/**
 * Network totals add up whichever chains had data each day, so two periods
 * counting different chains can't be compared: a chain joining or dropping out
 * moves the total more than real activity does. Returns why the change is
 * withheld, or null when both periods count the same number of chains.
 * Points without a count are ignored.
 */
export function coverageChanged(current: Counted[], prior: Counted[]): string | null {
  const counts = (xs: Counted[]) => xs.map((p) => p.chainCount).filter((n): n is number => typeof n === 'number' && n > 0);
  const now = counts(current);
  const then = counts(prior);
  if (now.length === 0 || then.length === 0) return null;
  if (new Set([...now, ...then]).size === 1) return null;
  const describe = (ns: number[]) => {
    const lo = Math.min(...ns);
    const hi = Math.max(...ns);
    return lo === hi ? `${lo}` : `${lo} to ${hi}`;
  };
  return `Not compared with the prior period: it counts ${describe(now)} chains, the prior period ${describe(then)}.`;
}
