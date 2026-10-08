import path from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../server/db/database.ts';
import { createPosterProxy, isAllowedPosterUrl } from '../server/http/poster-proxy.ts';
import { hostnameOf, isSameOrigin } from '../server/http/security.ts';
import { createTestApp, createTestDatabase, createTestServices, makeSnapshot, signIn, signUpFirstAccount } from './helpers.ts';

describe('security helpers', () => {
  it('extracts the host name without port, including IPv6', () => {
    expect(hostnameOf('localhost:3000')).toBe('localhost');
    expect(hostnameOf('127.0.0.1')).toBe('127.0.0.1');
    expect(hostnameOf('[::1]:3000')).toBe('[::1]');
    expect(hostnameOf('LocalHost:80')).toBe('localhost');
    expect(hostnameOf(undefined)).toBeNull();
    expect(hostnameOf('not a host')).toBeNull();
  });

  it('accepts a missing Origin and an Origin equal to the Host only', () => {
    expect(isSameOrigin(undefined, 'localhost:3000')).toBe(true);
    expect(isSameOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isSameOrigin('http://evil.example', 'localhost:3000')).toBe(false);
    expect(isSameOrigin('http://localhost:5173', 'localhost:3000')).toBe(false);
    expect(isSameOrigin('null', 'localhost:3000')).toBe(false);
  });
});

describe('poster proxy', () => {
  it('only allows https URLs on the Kitsu media host', () => {
    expect(isAllowedPosterUrl('https://media.kitsu.app/anime/1/poster_image/medium.jpg')).toBe(true);
    expect(isAllowedPosterUrl('http://media.kitsu.app/a.jpg')).toBe(false);
    expect(isAllowedPosterUrl('https://evil.example/a.jpg')).toBe(false);
    expect(isAllowedPosterUrl('https://media.kitsu.app.evil.example/a.jpg')).toBe(false);
    expect(isAllowedPosterUrl('https://user@media.kitsu.app/a.jpg')).toBe(false);
    expect(isAllowedPosterUrl('https://:secret@media.kitsu.app/a.jpg')).toBe(false);
    expect(isAllowedPosterUrl('https://media.kitsu.app:8443/a.jpg')).toBe(false);
    expect(isAllowedPosterUrl('http://127.0.0.1/admin')).toBe(false);
    expect(isAllowedPosterUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedPosterUrl('not a url')).toBe(false);
  });

  it('returns the image and refuses non-image or oversized answers', async () => {
    const image = createPosterProxy(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }));
    expect(await image.fetchPoster('https://media.kitsu.app/a.jpg')).toEqual({
      contentType: 'image/jpeg',
      body: Buffer.from([1, 2, 3]),
    });

    let calls = 0;
    const counted = createPosterProxy(async () => {
      calls += 1;
      return new Response(new Uint8Array([9]), { headers: { 'content-type': 'image/png' } });
    });
    await counted.fetchPoster('https://media.kitsu.app/same.png');
    await counted.fetchPoster('https://media.kitsu.app/same.png?n=2'); // another query, same image
    await counted.fetchPoster('https://media.kitsu.app/same.png#fragment');
    expect(calls).toBe(1); // the cache key ignores query and fragment, so they cannot fill the cache

    const svg = createPosterProxy(async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }));
    await expect(svg.fetchPoster('https://media.kitsu.app/a.svg')).rejects.toThrow(/Format d’image/);

    const html = createPosterProxy(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    await expect(html.fetchPoster('https://media.kitsu.app/a.jpg')).rejects.toThrow();

    const declaredHuge = createPosterProxy(
      async () => new Response(new Uint8Array(10), { headers: { 'content-type': 'image/png', 'content-length': String(6 * 1024 * 1024) } }),
    );
    await expect(declaredHuge.fetchPoster('https://media.kitsu.app/b.png')).rejects.toThrow(/volumineuse/);

    const huge = createPosterProxy(
      async () => new Response(new Uint8Array(6 * 1024 * 1024), { headers: { 'content-type': 'image/png' } }),
    );
    await expect(huge.fetchPoster('https://media.kitsu.app/a.png')).rejects.toThrow(/volumineuse/);
  });
});

describe('http api', () => {
  let db: Database;
  let app: FastifyInstance;
  let cookie: string;
  const frieren = makeSnapshot({ title: 'Frieren', episodeCount: 2 });

  /** Calls the API as the signed-in administrator; the headers of the test come on top of the cookie. */
  const api = (options: InjectOptions) => app.inject({ ...options, headers: { cookie, ...options.headers } });

  beforeEach(async () => {
    db = await createTestDatabase();
    app = await createTestApp(createTestServices(db, [frieren]));
    cookie = (await signUpFirstAccount(app)).cookie;
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  it('serves the library with strict security headers', async () => {
    const response = await api({ method: 'GET', url: '/api/library' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).not.toContain('unsafe-inline'); // no inline script or style allowed
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin'); // NFR-65
  });

  it('refuses a Host that is not on the allow-list (DNS rebinding)', async () => {
    const response = await api({ method: 'GET', url: '/api/library', headers: { host: 'attacker.example' } });
    expect(response.statusCode).toBe(403);
  });

  it('refuses state-changing requests coming from another origin', async () => {
    const forged = await api({
      method: 'POST',
      url: '/api/library/1/episode',
      headers: { origin: 'http://attacker.example' },
    });
    expect(forged.statusCode).toBe(403);

    const crossSite = await api({
      method: 'POST',
      url: '/api/library/1/episode',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(crossSite.statusCode).toBe(403);
  });

  it('refuses reads from another origin or another local port, but allows the app itself', async () => {
    const attempts = [
      { origin: 'http://attacker.example' },
      { origin: 'http://localhost:3001' },
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
    ];
    for (const headers of attempts) {
      const response = await api({ method: 'GET', url: '/api/library', headers });
      expect(response.statusCode, JSON.stringify(headers)).toBe(403);
    }
    const poster = await api({
      method: 'GET',
      url: '/api/poster?url=https://media.kitsu.app/a.jpg',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(poster.statusCode).toBe(403);

    for (const headers of [{}, { 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-site': 'none' }, { origin: 'http://localhost', host: 'localhost' }]) {
      const response = await api({ method: 'GET', url: '/api/library', headers });
      expect(response.statusCode, JSON.stringify(headers)).toBe(200);
    }
  });

  it('does not block a page opened from a link on another site, only the API', async () => {
    const page = await api({ method: 'GET', url: '/', headers: { 'sec-fetch-site': 'cross-site' } });
    expect(page.statusCode).not.toBe(403);
  });

  it('keeps personal API answers out of the browser cache', async () => {
    const library = await api({ method: 'GET', url: '/api/library' });
    expect(library.headers['cache-control']).toBe('no-store');
    const csv = await api({ method: 'GET', url: '/api/export.csv' });
    expect(csv.headers['cache-control']).toBe('no-store');
  });

  it('adds an anime, marks episodes and ranks it end to end', async () => {
    const added = await api({
      method: 'POST',
      url: '/api/library',
      payload: { kitsuId: frieren.kitsuId, status: 'watching' },
      headers: { origin: 'http://localhost' , host: 'localhost' },
    });
    expect(added.statusCode).toBe(201);
    const { id } = added.json<{ id: number }>();

    await api({ method: 'POST', url: `/api/library/${id}/episode` });
    const last = await api({ method: 'POST', url: `/api/library/${id}/episode` });
    expect(last.json()).toMatchObject({ justCompleted: true, entry: { status: 'completed', progress: 2 } });

    const ranked = await api({ method: 'PUT', url: `/api/ranking/${id}`, payload: { bucket: 'loved', index: 0 } });
    expect(ranked.json()).toMatchObject({ rankPosition: 1, score: 100, tier: 'S' });

    const stats = await api({ method: 'GET', url: '/api/stats' });
    expect(stats.json()).toMatchObject({ totalEntries: 1, episodesWatched: 2, rankedCount: 1 });

    const csv = await api({ method: 'GET', url: '/api/export.csv' });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('attachment');
  });

  it('answers invalid input with a clear 400 and no internals', async () => {
    const invalid = await api({ method: 'POST', url: '/api/library', payload: { kitsuId: 'abc', status: 'nope' } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ message: 'Certaines valeurs ne conviennent pas. Vérifie le formulaire.', code: 'error.invalidRequest' });

    const shortQuery = await api({ method: 'GET', url: '/api/search?q=a' });
    expect(shortQuery.statusCode).toBe(400);

    const extraField = await api({ method: 'PATCH', url: '/api/library/1', payload: { rank_position: 1 } });
    expect(extraField.statusCode).toBe(400);
  });

  it('maps expected failures to their status and hides unexpected ones', async () => {
    const missing = await api({ method: 'DELETE', url: '/api/library/999' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().message).toMatch(/introuvable/);

    const unknownRoute = await api({ method: 'GET', url: '/api/nope' });
    expect(unknownRoute.statusCode).toBe(404);

    const faulty = createTestServices(db);
    faulty.library.list = async () => {
      throw new Error('secret SQL detail: password=hunter2');
    };
    const faultyApp = await createTestApp(faulty);
    const faultySession = await signIn(faultyApp, 'admin@example.com');
    const crash = await faultyApp.inject({ method: 'GET', url: '/api/library', headers: { cookie: faultySession.cookie } });
    expect(crash.statusCode).toBe(500);
    expect(crash.body).not.toContain('hunter2');
    expect(crash.json()).toEqual({ message: 'Une erreur est survenue. Réessaie dans un instant.', code: 'error.internal' });
    await faultyApp.close();
  });

  it('serves robots.txt as plain text that keeps crawlers off the API (NFR-64)', async () => {
    const publicFiles = await createTestApp(createTestServices(db), ['localhost'], { webRoot: path.resolve(import.meta.dirname, '..', 'web', 'public') });
    const response = await publicFiles.inject({ method: 'GET', url: '/robots.txt' });
    await publicFiles.close();
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('User-agent: *');
    expect(response.body).toContain('Disallow: /api/');
    expect(response.body).not.toMatch(/^Disallow:\s*\/\s*$/m); // the sign-in page itself stays crawlable
  });

  it('refuses a poster from a forbidden host before any network call', async () => {
    const response = await api({ method: 'GET', url: '/api/poster?url=http://169.254.169.254/latest/meta-data' });
    expect(response.statusCode).toBe(400);
  });
});
