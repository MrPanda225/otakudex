import { useEffect, useState } from 'preact/hooks';
import type { StatsDto } from '../../shared/domain.ts';
import { api, errorMessage } from './api.ts';

/** The last figures received. Coming back to the page shows them at once, then they refresh. */
let lastKnown: StatsDto | null = null;

/** Forgets the figures: after signing out, the next person on this browser must not see them. */
export function clearStatsCache(): void {
  lastKnown = null;
}

/** Statistics for the page, refreshed whenever `trigger` changes (the library changed). */
export function useStats(trigger: unknown, isEnabled: boolean) {
  const [stats, setStats] = useState<StatsDto | null>(lastKnown);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!isEnabled) return;
    let isStale = false;
    api
      .stats()
      .then((value) => {
        lastKnown = value;
        if (isStale) return;
        setStats(value);
        setErrorText(null);
      })
      .catch((error: unknown) => {
        if (!isStale) setErrorText(errorMessage(error));
      });
    return () => {
      isStale = true;
    };
  }, [trigger, isEnabled]);

  return { stats, errorText };
}
