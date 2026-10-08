import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackdropService, MAX_BACKDROP_IMAGES } from '../server/backdrop/service.ts';
import { UpstreamError } from '../server/errors.ts';
import { createPosterProxy } from '../server/http/poster-proxy.ts';
import { createKitsuProvider } from '../server/kitsu/provider.ts';
import type { TrendingCover } from '../server/kitsu/snapshot.ts';
import type { Database } from '../server/db/database.ts';
import { createTestApp, createTestDatabase, createTestServices, signUpFirstAccount } from './helpers.ts';

const HOUR_MS = 60 * 60 * 1000;
const cover = (id: number): TrendingCover => ({ kitsuId: id, title: `Anime ${id}`, posterUrl: `https://media.kitsu.app/anime/poster_images/${id}/tiny.jpg` });
const covers = (count: number) => Array.from({ length: count }, (_, index) => cover(index + 1));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const trendingItem = (id: number, attributes: Record<string, unknown> = {}) => ({
  id: String(id),
  type: 'anime',
  attributes: {
    canonicalTitle: `Anime ${id}`,
    nsfw: false,
    ageRating: 'PG',
    posterImage: { tiny: `https://media.kitsu.app/anime/poster_images/${id}/tiny.jpg?1700000000`, small: `https://media.kitsu.app/anime/poster_images/${id}/small.jpg` },
    ...attributes,
  },
});

describe('trending covers from Kitsu', () => {
  it('asks the official endpoint and keeps the small cover of each title', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: [trendingItem(7442), trendingItem(12)] }));
    const provider = createKitsuProvider({ baseUrl: 'https://kitsu.test/api/edge', fetchFn });
    const found = await provider.trendingPosters(16);
    expect(found).toEqual([
      { kitsuId: 7442, title: 'Anime 7442', posterUrl: 'https://media.kitsu.app/anime/poster_images/7442/tiny.jpg' },
      { kitsuId: 12, title: 'Anime 12', posterUrl: 'https://media.kitsu.app/anime/poster_images/12/tiny.jpg' },
    ]);
    const [calledUrl] = fetchFn.mock.calls[0] as unknown as [string];
    expect(calledUrl).toMatch(/^https:\/\/kitsu\.test\/api\/edge\/trending\/anime\?limit=20$/);
  });

  it('leaves out what must not appear on a screen anybody can see', async () => {
    const body = {
      data: [
        trendingItem(1),
        trendingItem(2, { nsfw: true }),
        trendingItem(3, { ageRating: 'R18' }),
        trendingItem(4, { posterImage: null }),
        trendingItem(5, { posterImage: { tiny: 'https://evil.example/a.jpg' } }), // not on the allowed image host
        trendingItem(6, { ageRating: 'R' }), // rated R is kept: many mainstream series are
        trendingItem(1), // the same title twice
        { id: 'abc', type: 'anime', attributes: { canonicalTitle: 'Bad id', posterImage: { tiny: 'https://media.kitsu.app/x.jpg' } } },
      ],
    };
    const provider = createKitsuProvider({ baseUrl: 'https://kitsu.test/api/edge', fetchFn: async () => jsonResponse(body) });
    expect((await provider.trendingPosters(16)).map((found) => found.kitsuId)).toEqual([1, 6]);
  });

  it('stops at the requested number', async () => {
    const provider = createKitsuProvider({ baseUrl: 'https://kitsu.test/api/edge', fetchFn: async () => jsonResponse({ data: Array.from({ length: 20 }, (_, index) => trendingItem(index + 1)) }) });
    expect(await provider.trendingPosters(5)).toHaveLength(5);
  });

  it('says so when Kitsu cannot be reached or answers something unexpected', async () => {
    const down = createKitsuProvider({ baseUrl: 'https://kitsu.test/api/edge', fetchFn: async () => { throw new Error('offline'); } });
    await expect(down.trendingPosters(16)).rejects.toBeInstanceOf(UpstreamError);
    const odd = createKitsuProvider({ baseUrl: 'https://kitsu.test/api/edge', fetchFn: async () => jsonResponse({ nope: true }) });
    await expect(odd.trendingPosters(16)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe('the backdrop service', () => {
  let clock: number;
  const setup = (trending: () => Promise<TrendingCover[]>) => {
    const trendingPosters = vi.fn(trending);
    const fetchPoster = vi.fn(async (url: string) => ({ contentType: 'image/jpeg', body: Buffer.from(url) }));
    const service = createBackdropService({ provider: { trendingPosters }, posters: { fetchPoster }, now: () => clock });
    return { service, trendingPosters, fetchPoster };
  };
  beforeEach(() => {
    clock = Date.parse('2026-10-08T10:00:00Z');
  });

  it('asks Kitsu once however many visitors come, for six hours', async () => {
    const { service, trendingPosters } = setup(async () => covers(10));
    const answers = await Promise.all(Array.from({ length: 100 }, () => service.list()));
    expect(answers.every((answer) => answer.count === 10)).toBe(true);
    expect(trendingPosters).toHaveBeenCalledTimes(1); // simultaneous visitors share one request
    clock += 5 * HOUR_MS;
    await service.list();
    expect(trendingPosters).toHaveBeenCalledTimes(1);
  });

  it('refreshes after six hours without making the visitor wait: the old list is served meanwhile', async () => {
    let release: (value: TrendingCover[]) => void = () => undefined;
    let calls = 0;
    const { service, trendingPosters } = setup(() => (++calls === 1 ? Promise.resolve(covers(3)) : new Promise((resolve) => (release = resolve))));
    expect((await service.list()).count).toBe(3);
    clock += 7 * HOUR_MS;
    const during = await service.list(); // would hang if it waited for the refresh
    expect(during.count).toBe(3);
    expect(trendingPosters).toHaveBeenCalledTimes(2);
    release(covers(8));
    await vi.waitFor(async () => expect((await service.list()).count).toBe(8));
    expect((await service.list()).version).not.toBe(during.version);
  });

  it('keeps at most 14 covers', async () => {
    const { service } = setup(async () => covers(40));
    expect((await service.list()).count).toBe(MAX_BACKDROP_IMAGES);
  });

  it('has nothing to show, and no error, when Kitsu fails; and waits ten minutes before trying again', async () => {
    let healthy = false;
    const { service, trendingPosters } = setup(async () => {
      if (!healthy) throw new UpstreamError('kitsu.unreachable');
      return covers(4);
    });
    expect((await service.list()).count).toBe(0);
    await service.list();
    expect(trendingPosters).toHaveBeenCalledTimes(1); // no hammering a service that is down
    clock += 11 * 60 * 1000;
    healthy = true;
    expect((await service.list()).count).toBe(4);
    expect(trendingPosters).toHaveBeenCalledTimes(2);
  });

  it('treats an empty answer as a failure, and keeps the last good list when a refresh fails', async () => {
    let step = 0;
    const { service } = setup(async () => (++step === 1 ? covers(5) : []));
    expect((await service.list()).count).toBe(5);
    clock += 7 * HOUR_MS;
    await service.list(); // starts a refresh that comes back empty
    await vi.waitFor(async () => expect((await service.list()).count).toBe(5));
  });

  it('serves a cover by its number only, and nothing else', async () => {
    const { service, fetchPoster } = setup(async () => covers(3));
    await service.list();
    expect((await service.image(1))?.body.toString()).toBe('https://media.kitsu.app/anime/poster_images/2/tiny.jpg');
    expect(await service.image(3)).toBeNull();
    expect(await service.image(-1)).toBeNull();
    expect(fetchPoster).toHaveBeenCalledTimes(1);
  });

  it('answers null for a cover that cannot be fetched right now', async () => {
    const { service, fetchPoster } = setup(async () => covers(2));
    await service.list();
    fetchPoster.mockRejectedValueOnce(new UpstreamError('kitsu.unreachable'));
    expect(await service.image(0)).toBeNull();
  });

  it('warms the list and its images ahead of the first visitor, and swallows failures', async () => {
    const { service, fetchPoster } = setup(async () => covers(4));
    await service.warm();
    expect(fetchPoster).toHaveBeenCalledTimes(4);
    const failing = setup(async () => { throw new Error('down'); });
    await expect(failing.service.warm()).resolves.toBeUndefined();
  });
});

describe('the public backdrop routes', () => {
  let db: Database;
  let app: FastifyInstance;
  const TRENDING = covers(5);

  beforeEach(async () => {
    db = await createTestDatabase();
    app = await createTestApp(createTestServices(db, [], undefined, { trending: TRENDING }));
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  it('give the list of covers to a visitor with no session, with addresses of this same origin', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/backdrop' });
    expect(response.statusCode).toBe(200);
    const { images } = response.json<{ images: string[] }>();
    expect(images).toHaveLength(5);
    for (const [index, address] of images.entries()) expect(address).toMatch(new RegExp(`^/api/backdrop/${index}\\?v=[a-z0-9]+$`));
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('contain nothing from any library, before and after accounts exist', async () => {
    const session = await signUpFirstAccount(app);
    await app.inject({ method: 'POST', url: '/api/library/manual', headers: { cookie: session.cookie }, payload: { title: 'My Private Anime', episodeCount: 12, episodeLengthMin: 24, status: 'watching' } });
    const visitor = await app.inject({ method: 'GET', url: '/api/backdrop' });
    expect(visitor.body).not.toContain('Private');
    expect(visitor.json<{ images: string[] }>().images).toHaveLength(5);
  });

  it('answers an empty list, not an error, when there is nothing to show', async () => {
    const quiet = await createTestApp(createTestServices(db));
    const response = await quiet.inject({ method: 'GET', url: '/api/backdrop' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ images: [] });
    await quiet.close();
  });

  it('answer 404 for a number with no cover, 400 for anything that is not a small number', async () => {
    await app.inject({ method: 'GET', url: '/api/backdrop' });
    for (const url of ['/api/backdrop/5', `/api/backdrop/${MAX_BACKDROP_IMAGES - 1}`]) expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    for (const url of [`/api/backdrop/${MAX_BACKDROP_IMAGES}`, '/api/backdrop/-1', '/api/backdrop/abc', '/api/backdrop/1.5', '/api/backdrop/https%3A%2F%2Fevil.example%2Fa.jpg']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(400);
    }
  });

  it('serve a cover through the allowed-host relay, cacheable for a day, and nothing the visitor chose', async () => {
    const seen: string[] = [];
    const services = createTestServices(db, [], undefined, { trending: TRENDING });
    const relay = createPosterProxy(async (input) => {
      seen.push(String(input));
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    });
    const withRelay = await createTestApp({ ...services, backdrop: createBackdropService({ provider: { trendingPosters: async () => TRENDING }, posters: relay }) });
    await withRelay.inject({ method: 'GET', url: '/api/backdrop' });
    const image = await withRelay.inject({ method: 'GET', url: '/api/backdrop/2?v=abc&url=https://evil.example/x.jpg' });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.headers['cache-control']).toBe('public, max-age=86400');
    expect([...image.rawPayload]).toEqual([1, 2, 3]);
    expect(seen).toEqual(['https://media.kitsu.app/anime/poster_images/3/tiny.jpg']); // the extra "url" parameter was ignored
    await withRelay.close();
  });
});

describe('what the browser may keep of the client files', () => {
  let scratch: string;
  let app: FastifyInstance;
  let db: Database;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), 'otakudex-web-'));
    await mkdir(path.join(scratch, 'assets'));
    await writeFile(path.join(scratch, 'index.html'), '<!doctype html><title>x</title>');
    await writeFile(path.join(scratch, 'assets', 'index-AbC123.js'), 'console.log("a script that is long enough to be worth compressing");\n'.repeat(400));
    await writeFile(path.join(scratch, 'assets', 'cover-AbC123.jpg'), Buffer.alloc(4000, 7));
    await writeFile(path.join(scratch, 'favicon.txt'), 'x');
    db = await createTestDatabase();
    app = await createTestApp(createTestServices(db), ['localhost'], { webRoot: scratch });
  });
  afterEach(async () => {
    await app.close();
    await db.close();
    await rm(scratch, { recursive: true, force: true });
  });

  it('keeps hashed files for a year, and always re-checks the page that names them', async () => {
    const asset = await app.inject({ method: 'GET', url: '/assets/index-AbC123.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const url of ['/', '/index.html', '/favicon.txt']) {
      const page = await app.inject({ method: 'GET', url });
      expect(page.statusCode, url).toBe(200);
      expect(page.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('compresses text answers when the browser accepts it, and leaves images and unaccepting browsers alone', async () => {
    const plain = await app.inject({ method: 'GET', url: '/assets/index-AbC123.js', headers: { 'accept-encoding': 'identity' } });
    expect(plain.headers['content-encoding']).toBeUndefined();
    for (const encoding of ['gzip', 'br']) {
      const packed = await app.inject({ method: 'GET', url: '/assets/index-AbC123.js', headers: { 'accept-encoding': encoding } });
      expect(packed.statusCode, encoding).toBe(200);
      expect(packed.headers['content-encoding'], encoding).toBe(encoding);
      expect(packed.rawPayload.length, encoding).toBeLessThan(plain.rawPayload.length / 10);
      expect(String(packed.headers['vary']).toLowerCase()).toContain('accept-encoding');
      expect(packed.headers['cache-control']).toBe('public, max-age=31536000, immutable'); // compression changes nothing about caching
    }
    const picture = await app.inject({ method: 'GET', url: '/assets/cover-AbC123.jpg', headers: { 'accept-encoding': 'gzip, br' } });
    expect(picture.headers['content-encoding']).toBeUndefined();
  });
});
