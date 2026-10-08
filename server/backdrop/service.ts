import type { PosterImage, PosterProxy } from '../http/poster-proxy.ts';
import type { MetadataProvider } from '../kitsu/snapshot.ts';

/** 14 covers of about 11 KB each stay under the 200 KB the sign-in page may spend on images (NFR-55). */
export const MAX_BACKDROP_IMAGES = 14;
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

export interface BackdropServiceDeps {
  provider: Pick<MetadataProvider, 'trendingPosters'>;
  /** The same image relay as the rest of the application: allowed host only, size cap, shared cache. */
  posters: Pick<PosterProxy, 'fetchPoster'>;
  now?: () => number;
}

/**
 * The covers behind the sign-in screens. Anybody can see those screens, so they never come from a library:
 * they are the anime that are popular on Kitsu right now, the same for everyone.
 *
 * What keeps this public service harmless:
 * - it has no input that names an address: callers only ever ask for "number N" of a list it holds itself;
 * - the list is refreshed at most every six hours, and not again for ten minutes after a failure, however
 *   many visitors come;
 * - a stale list keeps being served while a new one is fetched, and an empty one is not an error: the
 *   screens have their own fallback.
 */
export function createBackdropService({ provider, posters, now = Date.now }: BackdropServiceDeps) {
  let urls: string[] = [];
  let version = '0';
  let fetchedAt = 0;
  let lastFailureAt: number | null = null;
  let inFlight: Promise<void> | null = null;

  /** Never rejects: a failure is only remembered, so retries are paced. */
  async function fetchList(): Promise<void> {
    try {
      const covers = await provider.trendingPosters(MAX_BACKDROP_IMAGES);
      if (covers.length === 0) throw new Error('no cover to show');
      urls = covers.slice(0, MAX_BACKDROP_IMAGES).map((cover) => cover.posterUrl);
      version = now().toString(36);
      fetchedAt = now();
      lastFailureAt = null;
    } catch {
      lastFailureAt = now();
    }
  }

  function refresh(): Promise<void> {
    inFlight ??= fetchList().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function ensureFresh(): Promise<void> {
    const hasList = urls.length > 0;
    if (hasList && now() - fetchedAt < REFRESH_AFTER_MS) return;
    if (inFlight) {
      if (!hasList) await inFlight;
      return;
    }
    if (lastFailureAt !== null && now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) return;
    const refreshing = refresh();
    if (!hasList) await refreshing; // nothing to show yet: the caller has to wait for the answer
  }

  return {
    /** How many covers there are, and the version that goes in their addresses (so a browser caches them for a day). */
    async list(): Promise<{ version: string; count: number }> {
      await ensureFresh();
      return { version, count: urls.length };
    },

    /** Cover number `index`, or null when there is none (or when it cannot be fetched right now). */
    async image(index: number): Promise<PosterImage | null> {
      const url = urls[index];
      if (url === undefined) return null;
      try {
        return await posters.fetchPoster(url);
      } catch {
        return null;
      }
    },

    /** Fetches the list and its images ahead of the first visitor. Errors are swallowed: this is a courtesy. */
    async warm(): Promise<void> {
      await ensureFresh();
      await Promise.allSettled(urls.map((url) => posters.fetchPoster(url)));
    },
  };
}

export type BackdropService = ReturnType<typeof createBackdropService>;
