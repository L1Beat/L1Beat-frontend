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
      : { title: 'Activity is still being counted', short: 'Counting', detail: `${source} The count hasn't reached a full day yet.` };
  }
  const source = "This chain has no public RPC and isn't in Avalanche's metrics API";
  return since
    ? { title: `No activity data since ${since}`, short: `on ${since}`, detail: `${source}, so there's no data after ${since}.` }
    : { title: 'No activity data for this chain yet', short: 'No data yet', detail: `${source}, so its transactions can't be counted.` };
}
