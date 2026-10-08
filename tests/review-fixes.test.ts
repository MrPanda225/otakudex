import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPasswordHasher } from '../server/auth/password.ts';
import { createRequestRateLimiter } from '../server/auth/throttle.ts';
import type { Database } from '../server/db/database.ts';
import { acquireDirectoryLock } from '../server/db/directory-lock.ts';
import { openDatabase } from '../server/db/index.ts';
import { MAX_EPISODES, MAX_LIBRARY_ENTRIES } from '../shared/limits.ts';
import type { AuthStateDto, EntryDto, StatsDto } from '../shared/domain.ts';
import {
  countRows,
  createTestApp,
  createTestClock,
  createTestDatabase,
  createTestServices,
  inviteAndJoin,
  makeSnapshot,
  signIn,
  signUpFirstAccount,
  TEST_PASSWORD,
  TEST_SCRYPT_PARAMS,
  type TestSession,
} from './helpers.ts';

/** Regression tests for what the independent security review found. Each fails without its fix. */
describe('after the independent review', () => {
  let db: Database;
  let app: FastifyInstance;
  let alice: TestSession;
  let bob: TestSession;
  const frieren = makeSnapshot({ title: 'Frieren', episodeCount: 12, episodeLengthMin: 24 });

  const call = (session: TestSession, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie: session.cookie }, ...(payload ? { payload } : {}) });

  beforeEach(async () => {
    db = await createTestDatabase();
    app = await createTestApp(createTestServices(db, [frieren]));
    alice = await signUpFirstAccount(app, { displayName: 'Alice', email: 'alice@example.com' });
    bob = await inviteAndJoin(app, alice, { displayName: 'Bob', email: 'bob@example.com' });
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  describe('a file cannot rewrite what everybody sees', () => {
    const fileClaiming = (kitsuId: number | null, title: string) => ({
      format: 'otakudex-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: [
        {
          media: { kitsuId, title, titleEn: null, titleJa: null, synopsis: 'invented', subtype: 'TV', airingStatus: 'finished', episodeCount: 2, episodeLengthMin: 1, startDate: null, endDate: null, genres: ['Hacked'], posterUrl: null, communityScore: null },
          status: 'planned', progress: 0, rewatchCount: 0, bucket: null, rankPosition: null, startedOn: null, completedOn: null, note: null, createdAt: new Date().toISOString(), log: [],
        },
      ],
    });

    it('keeps the title, the length and the statistics of an anime another account tracks', async () => {
      await call(alice, 'POST', '/api/library', { kitsuId: frieren.kitsuId, status: 'watching' });
      const before = (await call(alice, 'GET', '/api/stats')).json<StatsDto>();

      expect((await call(bob, 'POST', '/api/import', fileClaiming(frieren.kitsuId, 'DEFACED BY BOB'))).statusCode).toBe(200);

      const [mine] = (await call(alice, 'GET', '/api/library')).json<EntryDto[]>();
      expect(mine?.media).toMatchObject({ title: 'Frieren', episodeCount: 12, episodeLengthMin: 24, genres: ['Action'] });
      expect((await call(alice, 'GET', '/api/stats')).json<StatsDto>()).toEqual(before);
      expect((await call(alice, 'POST', `/api/library/${mine!.id}/episode`)).statusCode).toBe(200); // still 12 episodes, not 2
      // Bob's entry exists and points at the same, untouched, anime
      const [his] = (await call(bob, 'GET', '/api/library')).json<EntryDto[]>();
      expect(his?.media.id).toBe(mine?.media.id);
      expect(his?.media.title).toBe('Frieren');
    });

    it('still lets a file bring an anime nobody has, and an anime added by hand', async () => {
      expect((await call(bob, 'POST', '/api/import', fileClaiming(987_654, 'Brand new'))).statusCode).toBe(200);
      expect((await call(bob, 'GET', '/api/library')).json<EntryDto[]>().map((entry) => entry.media.title)).toEqual(['Brand new']);
    });

    it('lets the provider refresh a row an import created, so invented data does not stay', async () => {
      const kitsuId = frieren.kitsuId!;
      await call(bob, 'POST', '/api/import', fileClaiming(kitsuId, 'Invented title'));
      await call(alice, 'POST', '/api/library', { kitsuId, status: 'planned' }); // goes through the provider
      const [mine] = (await call(alice, 'GET', '/api/library')).json<EntryDto[]>();
      expect(mine?.media.title).toBe('Frieren');
    });
  });

  describe('guesses are counted before they are waited for', () => {
    it('lets only five of forty simultaneous wrong passwords through', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 40 }, () => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: 'un mauvais mot de passe' } })),
      );
      const codes = attempts.map((response) => response.statusCode);
      expect(codes.filter((code) => code === 401)).toHaveLength(5);
      expect(codes.filter((code) => code === 429)).toHaveLength(35);
    });

    it('does the same for the current password of the change-password form', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 20 }, () => call(alice, 'POST', '/api/auth/password', { currentPassword: 'pas le bon mot de passe', newPassword: 'un nouveau mot de passe tout neuf' })),
      );
      const codes = attempts.map((response) => response.statusCode);
      expect(codes.filter((code) => code === 400).length).toBeLessThanOrEqual(5);
      expect(codes.filter((code) => code === 429).length).toBeGreaterThanOrEqual(15);
    });

    it('does not punish the right password: a success wipes the count', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: 'un mauvais mot de passe' } });
      expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: TEST_PASSWORD } })).statusCode).toBe(200);
      for (let attempt = 0; attempt < 4; attempt += 1) await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: 'un mauvais mot de passe' } });
      expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: TEST_PASSWORD } })).statusCode).toBe(200);
    });
  });

  describe('the per-address limit', () => {
    it('never counts nor refuses signing out', async () => {
      const limited = await createTestApp(createTestServices(db), ['localhost'], { rateLimiter: createRequestRateLimiter({ limit: 1, windowMs: 60_000 }) });
      const login = () => limited.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'nobody@example.com', password: 'un mauvais mot de passe' } });
      expect((await login()).statusCode).toBe(401);
      expect((await login()).statusCode).toBe(429);
      const session = await signIn(app, 'alice@example.com');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await limited.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: session.cookie } })).statusCode).toBe(204);
      }
      expect((await call(session, 'GET', '/api/library')).statusCode).toBe(401); // and the logout did close the session
      await limited.close();
    });

    it('counts every client behind a proxy as one unless the proxy is trusted', async () => {
      const through = (trustProxy: boolean) =>
        createTestApp(createTestServices(db), ['localhost'], { trustProxy, rateLimiter: createRequestRateLimiter({ limit: 2, windowMs: 60_000 }) });
      const attempt = (target: FastifyInstance, client: string) =>
        target.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-forwarded-for': client }, payload: { email: 'nobody@example.com', password: 'un mauvais mot de passe' } });

      const blind = await through(false);
      expect([(await attempt(blind, '203.0.113.1')).statusCode, (await attempt(blind, '203.0.113.2')).statusCode, (await attempt(blind, '203.0.113.3')).statusCode]).toEqual([401, 401, 429]);
      const aware = await through(true);
      expect([(await attempt(aware, '203.0.113.1')).statusCode, (await attempt(aware, '203.0.113.2')).statusCode, (await attempt(aware, '203.0.113.3')).statusCode]).toEqual([401, 401, 401]);
      expect((await attempt(aware, '203.0.113.1')).statusCode).toBe(401);
      expect((await attempt(aware, '203.0.113.1')).statusCode).toBe(429);
      await blind.close();
      await aware.close();
    });
  });

  describe('reset links', () => {
    const issue = async () => (await call(alice, 'POST', `/api/admin/members/${bob.user.id}/reset-link`)).json<{ token: string }>();
    const use = (token: string, password = 'un tout nouveau mot de passe ici') => app.inject({ method: 'POST', url: '/api/auth/reset', payload: { token, password } });

    it('keeps one live link per account: a new one cancels the previous', async () => {
      const first = await issue();
      const second = await issue();
      expect((await use(first.token)).statusCode).toBe(403);
      expect((await use(second.token)).statusCode).toBe(200);
    });

    it('cancels the other pending links once one is used', async () => {
      const first = await issue();
      // a second live link, as if it had been issued before links replaced each other
      await db.query(
        `INSERT INTO account_link (kind, token_hash, user_id, created_by, expires_at)
         VALUES ('reset', decode(repeat('ab', 32), 'hex'), $1, $2, now() + interval '1 day')`,
        [bob.user.id, alice.user.id],
      );
      expect((await use(first.token)).statusCode).toBe(200);
      const live = await db.query("SELECT 1 FROM account_link WHERE kind = 'reset' AND used_at IS NULL AND revoked_at IS NULL");
      expect(live).toHaveLength(0);
    });

    it('does not survive a change of password made another way', async () => {
      const link = await issue();
      expect((await call(bob, 'POST', '/api/auth/password', { currentPassword: TEST_PASSWORD, newPassword: 'le mot de passe que Bob a choisi' })).statusCode).toBe(200);
      expect((await use(link.token)).statusCode).toBe(403);
    });
  });

  describe('limits on what one person stores', () => {
    it('refuses an anime beyond the library ceiling, with a message', async () => {
      await db.query(`INSERT INTO media (title) SELECT 'Filler ' || n FROM generate_series(1, ${MAX_LIBRARY_ENTRIES}) AS n`);
      await db.query(
        `INSERT INTO library_entry (user_id, media_id, status) SELECT $1, id, 'planned' FROM media ORDER BY id LIMIT ${MAX_LIBRARY_ENTRIES}`,
        [bob.user.id],
      );
      const refused = await call(bob, 'POST', '/api/library', { kitsuId: frieren.kitsuId, status: 'planned' });
      expect(refused.statusCode).toBe(409);
      expect(refused.json().code).toBe('library.limitReached');
      expect((await call(alice, 'POST', '/api/library', { kitsuId: frieren.kitsuId, status: 'planned' })).statusCode).toBe(201); // others are unaffected
    });

    it('refuses the episode beyond the ceiling when the total is unknown', async () => {
      const longRunner = makeSnapshot({ title: 'Endless', episodeCount: null });
      const endless = await createTestApp(createTestServices(db, [longRunner]));
      const added = (await endless.inject({ method: 'POST', url: '/api/library', headers: { cookie: bob.cookie }, payload: { kitsuId: longRunner.kitsuId, status: 'watching' } })).json<EntryDto>();
      await db.query('UPDATE library_entry SET progress = $2 WHERE id = $1', [added.id, MAX_EPISODES - 1]);
      const mark = () => endless.inject({ method: 'POST', url: `/api/library/${added.id}/episode`, headers: { cookie: bob.cookie } });
      expect((await mark()).statusCode).toBe(200);
      const refused = await mark();
      expect(refused.statusCode).toBe(409);
      expect(refused.json().message).toContain('Limite atteinte');
      await endless.close();
    });
  });

  describe('restoring', () => {
    it('does not hold up another account: two restores for different accounts both finish', async () => {
      const file = (await call(alice, 'GET', '/api/export.json')).json();
      await call(alice, 'POST', '/api/library', { kitsuId: frieren.kitsuId, status: 'watching' });
      const withEntry = (await call(alice, 'GET', '/api/export.json')).json();
      expect(file.entries).toHaveLength(0);
      const carol = await inviteAndJoin(app, alice, { displayName: 'Carol', email: 'carol@example.com' });
      const [forBob, forCarol] = await Promise.all([call(bob, 'POST', '/api/import', withEntry), call(carol, 'POST', '/api/import', withEntry)]);
      expect([forBob.statusCode, forCarol.statusCode]).toEqual([200, 200]);
      expect(await countRows(db, 'library_entry')).toBe(3);
    });

    it('lets only one of two simultaneous restores of the same account in', async () => {
      await call(alice, 'POST', '/api/library', { kitsuId: frieren.kitsuId, status: 'watching' });
      const file = (await call(alice, 'GET', '/api/export.json')).json();
      const results = await Promise.all([call(bob, 'POST', '/api/import', file), call(bob, 'POST', '/api/import', file)]);
      expect(results.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      expect((await call(bob, 'GET', '/api/library')).json<EntryDto[]>()).toHaveLength(1);
    });
  });

  describe('the first account', () => {
    it('is not hashed for when an account already exists: the cheap check comes first', async () => {
      let hashes = 0;
      const real = createPasswordHasher({ params: TEST_SCRYPT_PARAMS });
      const counting = { ...real, hash: async (password: string) => (hashes += 1, real.hash(password)) };
      const other = await createTestDatabase();
      const counted = await createTestApp(createTestServices(other, [], undefined, { hasher: counting }));
      await signUpFirstAccount(counted);
      expect(hashes).toBe(1);
      const again = await counted.inject({ method: 'POST', url: '/api/auth/setup', payload: { displayName: 'Intruder', email: 'x@example.com', password: TEST_PASSWORD } });
      expect(again.statusCode).toBe(409);
      expect(hashes).toBe(1); // no second 128 MiB computation for nothing
      await counted.close();
      await other.close();
    });

    describe('with a setup code', () => {
      let guarded: FastifyInstance;
      let guardedDb: Database;
      const setup = (setupCode?: string) =>
        guarded.inject({ method: 'POST', url: '/api/auth/setup', payload: { displayName: 'Marie', email: 'marie@example.com', password: TEST_PASSWORD, ...(setupCode === undefined ? {} : { setupCode }) } });

      beforeEach(async () => {
        guardedDb = await createTestDatabase();
        guarded = await createTestApp(createTestServices(guardedDb, [], createTestClock(), { setupCode: 'le code du serveur' }));
      });
      afterEach(async () => {
        await guarded.close();
        await guardedDb.close();
      });

      it('tells the interface to ask for it', async () => {
        const state = (await guarded.inject({ method: 'GET', url: '/api/auth/state' })).json<AuthStateDto>();
        expect(state).toEqual({ phase: 'setup', legacyEntryCount: 0, needsSetupCode: true });
      });

      it('refuses a missing or wrong code, creates nothing, and accepts the right one once', async () => {
        for (const code of [undefined, '', 'pas le bon code']) {
          const refused = await setup(code);
          expect(refused.statusCode, String(code)).toBe(403);
          expect(refused.json().message).toBe('Code de création incorrect.');
        }
        expect(await countRows(guardedDb, 'app_user')).toBe(0);
        expect((await setup('  le code du serveur ')).statusCode).toBe(201);
        expect((await setup('le code du serveur')).statusCode).toBe(409);
      });

      it('slows down guessing the code, for the whole server', async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) await setup(`essai numero ${attempt}`);
        const blocked = await setup('le code du serveur');
        expect(blocked.statusCode).toBe(429);
      });
    });

    it('does not ask for a code when none is set', async () => {
      const fresh = await createTestDatabase();
      const open = await createTestApp(createTestServices(fresh));
      expect((await open.inject({ method: 'GET', url: '/api/auth/state' })).json()).toEqual({ phase: 'setup', legacyEntryCount: 0, needsSetupCode: false });
      await open.close();
      await fresh.close();
    });
  });
});

describe('the embedded database folder', () => {
  let scratch: string;
  beforeEach(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), 'otakudex-lock-'));
  });
  afterEach(() => rm(scratch, { recursive: true, force: true }));

  it('cannot be opened twice, and can be again once released', async () => {
    const lockPath = path.join(scratch, 'data.lock');
    const release = await acquireDirectoryLock(lockPath);
    // the lock is held by this very process, so a second request from "another process" is simulated with another pid
    await writeFile(lockPath, String(process.ppid)); // the parent process is alive and is not us
    await expect(acquireDirectoryLock(lockPath)).rejects.toThrow(/already using this data folder/);
    await release();
    const again = await acquireDirectoryLock(lockPath);
    await again();
  });

  it('ignores a lock left by a process that is gone', async () => {
    const lockPath = path.join(scratch, 'data.lock');
    const finished = spawnSync(process.execPath, ['-e', '0']);
    await writeFile(lockPath, String(finished.pid));
    const release = await acquireDirectoryLock(lockPath);
    await release();
  });

  it('is enforced by openDatabase on a real folder, and is not left behind after close', async () => {
    const url = `pglite://${path.join(scratch, 'dev')}`;
    const first = await openDatabase(url);
    await writeFile(`${path.join(scratch, 'dev')}.lock`, String(process.ppid)); // another live process claims the folder
    await expect(openDatabase(url)).rejects.toThrow(/already using this data folder/);
    await writeFile(`${path.join(scratch, 'dev')}.lock`, String(process.pid)); // ours again, so close() can give it back
    await first.close();
    const reopened = await openDatabase(url);
    await reopened.close();
  }, 30_000);

  it('does not lock an in-memory database', async () => {
    const one = await openDatabase('pglite://');
    const two = await openDatabase('pglite://');
    await one.close();
    await two.close();
  });
});
