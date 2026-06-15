import { useEffect, useRef, type DependencyList } from 'react';

/**
 * Runs `callback` once immediately, then every `intervalMs` — but skips ticks
 * while the tab is hidden, and runs once more as soon as the tab becomes
 * visible again (so data isn't stale when the user returns). This keeps
 * background tabs from polling the API indefinitely.
 *
 * The callback is held in a ref, so passing a fresh inline function each render
 * does not restart the timer. Pass `deps` for values the callback reads that
 * should trigger an immediate refetch + timer restart when they change
 * (mirrors a normal useEffect dependency array).
 *
 * The callback receives an `alive()` checker that returns false once this run
 * has been cleaned up (unmount or deps change). Guard post-await setState with
 * it to avoid stale responses overwriting fresh data after deps change.
 *
 * Pass `intervalMs <= 0` to disable polling entirely.
 */
export function usePolling(
  callback: (alive: () => boolean) => void,
  intervalMs: number,
  deps: DependencyList = [],
) {
  const savedCallback = useRef(callback);

  // Keep the ref pointing at the latest closure. Declared before the polling
  // effect so it runs first — the immediate tick below uses fresh values.
  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    if (intervalMs <= 0) return;

    let active = true;
    const alive = () => active;
    const tick = () => savedCallback.current(alive);

    // Fire immediately on mount and whenever deps change.
    tick();

    const interval = setInterval(() => {
      if (!document.hidden) tick();
    }, intervalMs);

    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
