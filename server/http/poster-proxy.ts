import { UpstreamError, ValidationError } from '../errors.ts';
import { normalizePosterUrl } from '../kitsu/poster-url.ts';
import { createLimiter } from '../lib/limiter.ts';
import { createTtlCache } from '../lib/ttl-cache.ts';

export { ALLOWED_POSTER_HOST, isAllowedPosterUrl } from '../kitsu/poster-url.ts';

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const MAX_POSTER_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_CONCURRENT_FETCHES = 4;
const POSTER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const POSTER_CACHE_MAX_ENTRIES = 300;
const POSTER_CACHE_MAX_BYTES = 64 * 1024 * 1024;

export interface PosterImage {
  contentType: string;
  body: Buffer;
}

/**
 * Fetches a poster on behalf of the browser, so the page never talks to a third-party domain and
 * the image is same-origin (which also makes canvas export possible).
 */
export function createPosterProxy(fetchFn: typeof fetch = fetch) {
  const limit = createLimiter(MAX_CONCURRENT_FETCHES);
  const cache = createTtlCache<PosterImage>({
    ttlMs: POSTER_CACHE_TTL_MS,
    maxEntries: POSTER_CACHE_MAX_ENTRIES,
    maxWeight: POSTER_CACHE_MAX_BYTES,
    weigh: (poster) => poster.body.length,
  });

  return {
    async fetchPoster(rawUrl: string): Promise<PosterImage> {
      const url = normalizePosterUrl(rawUrl);
      if (url === null) throw new ValidationError('poster.addressNotAllowed');
      const cached = cache.get(url);
      if (cached) return cached;

      return limit(async () => {
        const response = await requestImage(fetchFn, url);
        const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
        if (!ALLOWED_CONTENT_TYPES.has(contentType)) throw new UpstreamError('poster.formatUnsupported');

        const declaredLength = Number(response.headers.get('content-length') ?? 0);
        if (declaredLength > MAX_POSTER_BYTES) throw new UpstreamError('poster.tooBig');

        const poster = { contentType, body: await readLimited(response, MAX_POSTER_BYTES) };
        cache.set(url, poster);
        return poster;
      });
    },
  };
}

async function requestImage(fetchFn: typeof fetch, url: string): Promise<Response> {
  let response: Response;
  try {
    // redirect: 'error' so an allowed host can never bounce us to a forbidden one.
    response = await fetchFn(url, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new UpstreamError('poster.fetchFailed');
  }
  if (!response.ok) throw new UpstreamError('poster.fetchFailed');
  return response;
}

/** Reads a body chunk by chunk and gives up as soon as it exceeds `maxBytes`, instead of buffering it all. */
async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new UpstreamError('poster.fetchFailed');
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > maxBytes) {
      await reader.cancel();
      throw new UpstreamError('poster.tooBig');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export type PosterProxy = ReturnType<typeof createPosterProxy>;
