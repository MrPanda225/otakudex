import type { z } from 'zod';
import { UpstreamError } from '../errors.ts';
import { createLimiter } from '../lib/limiter.ts';
import { createTtlCache } from '../lib/ttl-cache.ts';
import { detailResponseSchema, searchResponseSchema, toSnapshot, toTrendingCovers, trendingResponseSchema } from './schemas.ts';
import type { AnimeSnapshot, MetadataProvider } from './snapshot.ts';

export const MAX_SEARCH_RESULTS = 20; // Kitsu refuses larger pages
const TRENDING_PAGE_SIZE = 20;
const MAX_CONCURRENT_REQUESTS = 2;
const REQUEST_TIMEOUT_MS = 8_000;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 100;
const DEFAULT_USER_AGENT = 'otakudex/0.1 (personal anime tracker)';

const ANIME_FIELDS =
  'slug,canonicalTitle,titles,synopsis,subtype,status,episodeCount,episodeLength,startDate,endDate,averageRating,posterImage,categories';

export interface KitsuProviderOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
  userAgent?: string;
  now?: () => number;
}

/**
 * Metadata provider backed by the public Kitsu API (no key needed).
 * Politeness: identified by User-Agent, two requests at a time, searches cached for ten minutes.
 */
export function createKitsuProvider(options: KitsuProviderOptions): MetadataProvider {
  const { baseUrl, fetchFn = fetch, userAgent = DEFAULT_USER_AGENT, now } = options;
  const limit = createLimiter(MAX_CONCURRENT_REQUESTS);
  const searchCache = createTtlCache<AnimeSnapshot[]>({
    ttlMs: SEARCH_CACHE_TTL_MS,
    maxEntries: SEARCH_CACHE_MAX_ENTRIES,
    ...(now ? { now } : {}),
  });

  /** Returns the parsed JSON body, or null when Kitsu answers 404. */
  async function requestJson(path: string, params: Record<string, string>): Promise<unknown | null> {
    const url = `${baseUrl}${path}?${new URLSearchParams(params).toString()}`;
    return limit(async () => {
      let response: Response;
      try {
        response = await fetchFn(url, {
          headers: { Accept: 'application/vnd.api+json', 'User-Agent': userAgent },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          redirect: 'error',
        });
      } catch {
        throw new UpstreamError('kitsu.unreachable');
      }
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new UpstreamError('kitsu.error', { status: response.status });
      }
      return response.json();
    });
  }

  function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new UpstreamError('kitsu.badFormat');
    }
    return parsed.data;
  }

  return {
    async search(query) {
      const cacheKey = query.trim().toLowerCase();
      const cached = searchCache.get(cacheKey);
      if (cached) return cached;

      const body = await requestJson('/anime', {
        'filter[text]': query.trim(),
        'page[limit]': String(MAX_SEARCH_RESULTS),
        include: 'categories',
        'fields[anime]': ANIME_FIELDS,
        'fields[categories]': 'title',
      });
      const { data, included } = parseBody(searchResponseSchema, body ?? { data: [] });
      const results = data.map((resource) => toSnapshot(resource, included ?? []));
      searchCache.set(cacheKey, results);
      return results;
    },

    async trendingPosters(limit) {
      const body = await requestJson('/trending/anime', { limit: String(TRENDING_PAGE_SIZE) });
      return toTrendingCovers(parseBody(trendingResponseSchema, body ?? { data: [] }), limit);
    },

    async getById(kitsuId) {
      const body = await requestJson(`/anime/${kitsuId}`, {
        include: 'categories',
        'fields[anime]': ANIME_FIELDS,
        'fields[categories]': 'title',
      });
      if (body === null) return null;
      const { data, included } = parseBody(detailResponseSchema, body);
      return toSnapshot(data, included ?? []);
    },
  };
}
