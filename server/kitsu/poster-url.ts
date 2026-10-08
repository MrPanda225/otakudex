/** Only this host may be fetched for covers: the image proxy must never reach arbitrary URLs (SSRF). */
export const ALLOWED_POSTER_HOST = 'media.kitsu.app';

/**
 * Canonical form of an allowed cover URL: https, the allowed host, no credentials, no port, and
 * without query or fragment (Kitsu only uses the query as a cache-busting stamp).
 * Returns null for anything else. Using this as cache key stops one image from filling the cache
 * under endlessly different query strings.
 */
export function normalizePosterUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const isAllowed =
      url.protocol === 'https:' &&
      url.hostname === ALLOWED_POSTER_HOST &&
      url.username === '' &&
      url.password === '' &&
      url.port === '';
    return isAllowed ? `https://${ALLOWED_POSTER_HOST}${url.pathname}` : null;
  } catch {
    return null;
  }
}

export function isAllowedPosterUrl(rawUrl: string): boolean {
  return normalizePosterUrl(rawUrl) !== null;
}
