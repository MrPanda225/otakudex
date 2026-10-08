import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../server/db/database.ts';
import type { EntryDto, PickerResultDto, SearchResultDto, StatsDto } from '../shared/domain.ts';
import { exportFileSchema } from '../server/export/schema.ts';
import {
  countRows,
  createTestApp,
  createTestDatabase,
  createTestServices,
  inviteAndJoin,
  makeSnapshot,
  signUpFirstAccount,
  type TestSession,
} from './helpers.ts';

/**
 * Two people on the same server. Whatever one does must never show in, change, or be reachable from the
 * other's library (FR-95, FR-96, FR-98, NFR-45).
 */
describe('one library per person', () => {
  let db: Database;
  let app: FastifyInstance;
  let alice: TestSession;
  let bob: TestSession;
  const frieren = makeSnapshot({ title: 'Frieren', episodeCount: 3 });
  const bebop = makeSnapshot({ title: 'Cowboy Bebop', episodeCount: 2 });

  const call = (session: TestSession, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie: session.cookie }, ...(payload ? { payload } : {}) });
  const library = async (session: TestSession) => (await call(session, 'GET', '/api/library')).json<EntryDto[]>();

  beforeEach(async () => {
    db = await createTestDatabase();
    app = await createTestApp(createTestServices(db, [frieren, bebop]));
    alice = await signUpFirstAccount(app, { displayName: 'Alice', email: 'alice@example.com' });
    bob = await inviteAndJoin(app, alice, { displayName: 'Bob', email: 'bob@example.com' });
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  async function aliceFinishesFrieren(): Promise<EntryDto> {
    const added = (await call(alice, 'POST', '/api/library', { kitsuId: frieren.kitsuId, status: 'watching' })).json<EntryDto>();
    for (let episode = 0; episode < 3; episode += 1) await call(alice, 'POST', `/api/library/${added.id}/episode`);
    await call(alice, 'PUT', `/api/ranking/${added.id}`, { bucket: 'loved', index: 0 });
    return added;
  }

  it('shows each person only their own entries', async () => {
    await aliceFinishesFrieren();
    expect(await library(alice)).toHaveLength(1);
    expect(await library(bob)).toEqual([]);
    expect((await call(bob, 'GET', '/api/stats')).json<StatsDto>()).toMatchObject({ totalEntries: 0, episodesWatched: 0, rankedCount: 0 });
    expect((await call(alice, 'GET', '/api/stats')).json<StatsDto>()).toMatchObject({ totalEntries: 1, episodesWatched: 3, rankedCount: 1 });
  });

  it('answers "not found" when one person aims at another person’s entry, on every route that takes an id', async () => {
    const entry = await aliceFinishesFrieren();
    const attempts = [
      ['PATCH', `/api/library/${entry.id}`, { note: 'mine now' }],
      ['DELETE', `/api/library/${entry.id}`, undefined],
      ['POST', `/api/library/${entry.id}/episode`, undefined],
      ['DELETE', `/api/library/${entry.id}/episode`, undefined],
      ['PUT', `/api/ranking/${entry.id}`, { bucket: 'loved', index: 0 }],
      ['DELETE', `/api/ranking/${entry.id}`, undefined],
    ] as const;
    for (const [method, url, payload] of attempts) {
      const response = await call(bob, method, url, payload);
      expect(response.statusCode, `${method} ${url}`).toBe(404);
    }
    // and nothing of it reached Alice
    const [mine] = await library(alice);
    expect(mine).toMatchObject({ id: entry.id, progress: 3, note: null, rankPosition: 1 });
  });

  it('keeps ranks, scores and duels apart: each person has their own number 1', async () => {
    await aliceFinishesFrieren();
    const bobsFrieren = (await call(bob, 'POST', '/api/library', { kitsuId: frieren.kitsuId, status: 'watching' })).json<EntryDto>();
    const bobsBebop = (await call(bob, 'POST', '/api/library', { kitsuId: bebop.kitsuId, status: 'watching' })).json<EntryDto>();
    await call(bob, 'POST', `/api/library/${bobsBebop.id}/episode`);
    await call(bob, 'PUT', `/api/ranking/${bobsBebop.id}`, { bucket: 'liked', index: 0 });
    await call(bob, 'PUT', `/api/ranking/${bobsFrieren.id}`, { bucket: 'liked', index: 1 });

    expect((await library(alice)).map((entry) => [entry.media.title, entry.rankPosition])).toEqual([['Frieren', 1]]);
    expect((await library(bob)).map((entry) => [entry.media.title, entry.rankPosition])).toEqual([['Frieren', 2], ['Cowboy Bebop', 1]]);

    const candidatesForAlice = await call(alice, 'GET', '/api/ranking/candidates?bucket=liked');
    const candidatesForBob = await call(bob, 'GET', '/api/ranking/candidates?bucket=liked');
    expect(candidatesForAlice.json()).toEqual([]);
    expect(candidatesForBob.json()).toHaveLength(2);
  });

  it('shares one copy of an anime between accounts (FR-96)', async () => {
    await aliceFinishesFrieren();
    await call(bob, 'POST', '/api/library', { kitsuId: frieren.kitsuId, status: 'planned' });
    expect(await countRows(db, 'media')).toBe(1);
    expect(await countRows(db, 'library_entry')).toBe(2);
    const [mine] = await library(alice);
    const [his] = await library(bob);
    expect(his?.media.id).toBe(mine?.media.id);
    expect(his?.id).not.toBe(mine?.id);
  });

  it('flags search results by the library of the person who searches', async () => {
    await aliceFinishesFrieren();
    const forAlice = (await call(alice, 'GET', '/api/search?q=frieren')).json<SearchResultDto[]>();
    const forBob = (await call(bob, 'GET', '/api/search?q=frieren')).json<SearchResultDto[]>();
    expect(forAlice[0]?.isInLibrary).toBe(true);
    expect(forBob[0]?.isInLibrary).toBe(false);
  });

  it('draws the evening pick only from the person’s own "to watch" list', async () => {
    await call(alice, 'POST', '/api/library', { kitsuId: frieren.kitsuId, status: 'planned' });
    expect((await call(bob, 'GET', '/api/picker')).json<PickerResultDto>()).toEqual({ candidateCount: 0, entry: null });
    expect((await call(alice, 'GET', '/api/picker')).json<PickerResultDto>().candidateCount).toBe(1);
  });

  it('exports only what the person owns, and restores only into their own empty library', async () => {
    await aliceFinishesFrieren();
    const aliceFile = (await call(alice, 'GET', '/api/export.json')).json();
    const bobFile = (await call(bob, 'GET', '/api/export.json')).json();
    expect(aliceFile.entries).toHaveLength(1);
    expect(bobFile.entries).toEqual([]);
    expect((await call(bob, 'GET', '/api/export.csv')).body).not.toContain('Frieren');

    // Bob restores Alice's file into his empty library: it does not touch hers.
    const restored = await call(bob, 'POST', '/api/import', exportFileSchema.parse(aliceFile));
    expect(restored.statusCode).toBe(200);
    expect(await library(bob)).toHaveLength(1);
    expect(await library(alice)).toHaveLength(1);
    // Alice's library is not empty, so restoring into it is refused, whatever Bob holds.
    expect((await call(alice, 'POST', '/api/import', exportFileSchema.parse(aliceFile))).statusCode).toBe(409);
    expect(await countRows(db, 'library_entry')).toBe(2);
  });

  it('never leaks another person’s notes, dates or progress through an entry id that exists for both', async () => {
    const entry = await aliceFinishesFrieren();
    await call(alice, 'PATCH', `/api/library/${entry.id}`, { note: 'secret note of Alice' });
    for (const [method, url] of [['GET', '/api/library'], ['GET', '/api/export.json'], ['GET', '/api/export.csv'], ['GET', '/api/stats']] as const) {
      expect((await call(bob, method, url)).body, url).not.toContain('secret note of Alice');
    }
  });
});
