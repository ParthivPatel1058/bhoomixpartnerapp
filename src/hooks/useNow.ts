import { useEffect, useState } from 'react';

/**
 * A clock that re-renders on a fixed cadence.
 *
 * SLA countdowns are derived from `created_at`, so nothing re-fetches when a
 * deadline approaches — without a ticking `now` the timers would sit frozen
 * until the next poll. Shared here so every countdown in the app advances
 * together rather than drifting apart.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());

    const timer = window.setInterval(tick, intervalMs);

    // A backgrounded tab throttles timers, so the clock can be minutes stale on
    // return. Re-sync the moment the partner looks at the app again.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}
