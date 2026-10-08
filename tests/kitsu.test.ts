import { describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../server/errors.ts';
import { createKitsuProvider } from '../server/kitsu/provider.ts';
import { createLimiter } from '../server/lib/limiter.ts';
import { createTtlCache } from '../server/lib/ttl-cache.ts';

const FRIEREN_RESPONSE = {
  data: [
    {
      id: '46474',
      type: 'anime',
      attributes: {
        canonicalTitle: 'Sousou no Frieren',
        titles: { en: 'Frieren: Beyond Journey’s End', ja_jp: '葬送のフリーレン' },
        synopsis: 'After the party of heroes defeated the Demon King…',
        subtype: 'TV',
        status: 'finished',
        episodeCount: 28,
        episodeLength: 24,
        startDate: '2023-09-29',
        endDate: '2024-03-22',
        averageRating: '88.83',
        posterImage: { medium: 'https://media.kitsu.app/anime/46474/poster_image/medium.jpg' },
      },
      relationships: {
        categories: { data: [{ type: 'categories', id: '156' }, { type: 'categories', id: '10' }, { type: 'categories', id: '99' }] },
      },
    },
  ],
  included: [
    { type: 'categories', id: '156', attributes: { title: 'Fantasy' } },
    { type: 'categories', id: '10', attributes: { title: 'Adventure' } },
    { type: 'categories', id: '99', attributes: { title: 'Plot Continuity' } },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makeProvider(fetchFn: typeof fetch, now?: () => number) {
  return createKitsuProvider({ baseUrl: 'https://kitsu.test/api/edge', fetchFn, ...(now ? { now } : {}) });
}

describe('Kitsu provider', () => {
  it('converts a response into snapshots with genres and a poster', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(FRIEREN_RESPONSE));
    const [snapshot] = await makeProvider(fetchFn as unknown as typeof fetch).search('frieren');

    expect(snapshot).toMatchObject({
      kitsuId: 46474,
      title: 'Sousou no Frieren',
      titleEn: 'Frieren: Beyond Journey’s End',
      titleJa: '葬送のフリーレン',
      episodeCount: 28,
      episodeLengthMin: 24,
      startDate: '2023-09-29',
      genres: ['Fantasy', 'Adventure'], // the niche tag is not a genre
      communityScore: 88.83,
      posterUrl: 'https://media.kitsu.app/anime/46474/poster_image/medium.jpg',
    });
  });

  it('identifies itself and asks for at most 20 results', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: [] }));
    await makeProvider(fetchFn as unknown as typeof fetch).search('naruto');

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(decodeURIComponent(url)).toContain('page[limit]=20');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/otakudex/);
  });

  it('serves a repeated search from the cache until it expires', async () => {
    let clock = 0;
    const fetchFn = vi.fn(async () => jsonResponse(FRIEREN_RESPONSE));
    const provider = makeProvider(fetchFn as unknown as typeof fetch, () => clock);

    await provider.search('Frieren');
    await provider.search('  frieren ');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock = 11 * 60 * 1000;
    await provider.search('frieren');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns null for an unknown id', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 404 }));
    expect(await makeProvider(fetchFn as unknown as typeof fetch).getById(999999999)).toBeNull();
  });

  it('turns network and server failures into user-facing errors', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(makeProvider(down as unknown as typeof fetch).search('x1')).rejects.toBeInstanceOf(UpstreamError);

    const broken = vi.fn(async () => jsonResponse({}, 503));
    await expect(makeProvider(broken as unknown as typeof fetch).search('x2')).rejects.toThrow(/503/);
  });

  it('rejects a response with an unexpected shape', async () => {
    const odd = vi.fn(async () => jsonResponse({ data: [{ id: 1 }] }));
    await expect(makeProvider(odd as unknown as typeof fetch).search('x3')).rejects.toThrow(/de façon inattendue/);
  });
});

describe('limiter', () => {
  it('never runs more tasks at once than allowed', async () => {
    const run = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    };
    await Promise.all(Array.from({ length: 6 }, () => run(task)));
    expect(peak).toBe(2);
  });
});

describe('ttl cache', () => {
  it('drops the oldest entries when the total weight is exceeded', () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 100, maxWeight: 10, weigh: (value) => value.length });
    cache.set('a', '1234');
    cache.set('b', '5678');
    cache.set('c', '9012'); // 12 > 10, so "a" goes
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('5678');
    expect(cache.get('c')).toBe('9012');
    cache.set('d', 'x'.repeat(11)); // heavier than the whole budget: nothing can be kept
    expect(cache.get('d')).toBeUndefined();
  });

  it('drops the oldest entry when full', () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });
});
