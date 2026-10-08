import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../server/db/database.ts';
import { MIGRATIONS_DIRECTORY, runMigrations } from '../server/db/migrate.ts';
import { countRows, createTestDatabase, createTestServices, createTestUser, makeSnapshot, TEST_PASSWORD } from './helpers.ts';

describe('what the database itself refuses', () => {
  let db: Database;
  beforeEach(async () => {
    db = await createTestDatabase();
  });
  afterEach(() => db.close());

  async function insertMedia(title = 'Anime'): Promise<number> {
    const [row] = await db.query<{ id: number }>('INSERT INTO media (title) VALUES ($1) RETURNING id', [title]);
    return row!.id;
  }
  const insertEntry = (userId: number | null, mediaId: number, extra = 'NULL, NULL') =>
    db.query(`INSERT INTO library_entry (user_id, media_id, status, bucket, rank_position) VALUES ($1, $2, 'completed', ${extra})`, [userId, mediaId]);

  it('refuses an entry without an owner', async () => {
    const media = await insertMedia();
    await expect(insertEntry(null, media)).rejects.toThrow();
  });

  it('lets two people hold the same anime and the same rank, but not one person twice', async () => {
    const [alice, bob] = [await createTestUser(db), await createTestUser(db)];
    const media = await insertMedia();
    await insertEntry(alice, media, "'loved', 1");
    await insertEntry(bob, media, "'loved', 1"); // same anime, same rank, another owner: fine
    expect(await countRows(db, 'library_entry')).toBe(2);

    await expect(insertEntry(alice, media, "'loved', 2")).rejects.toThrow(); // the same anime twice for one person
    const other = await insertMedia('Other');
    await expect(
      db.transaction(async (tx) => {
        await tx.query(`INSERT INTO library_entry (user_id, media_id, status, bucket, rank_position) VALUES ($1, $2, 'completed', 'loved', 1)`, [alice, other]);
      }),
    ).rejects.toThrow(); // two entries of one person at rank 1, refused when the transaction ends
  });

  it('allows at most one administrator', async () => {
    await createTestUser(db, { role: 'admin' });
    await expect(createTestUser(db, { role: 'admin' })).rejects.toThrow();
    await createTestUser(db, { role: 'member' });
  });

  it('keeps e-mails unique and written in lower case', async () => {
    await db.query(`INSERT INTO app_user (email, display_name, password_hash, role) VALUES ('a@example.com', 'A', 'h', 'member')`);
    await expect(db.query(`INSERT INTO app_user (email, display_name, password_hash, role) VALUES ('a@example.com', 'B', 'h', 'member')`)).rejects.toThrow();
    await expect(db.query(`INSERT INTO app_user (email, display_name, password_hash, role) VALUES ('B@Example.com', 'B', 'h', 'member')`)).rejects.toThrow();
    await expect(db.query(`INSERT INTO app_user (email, display_name, password_hash, role) VALUES (' b@example.com', 'B', 'h', 'member')`)).rejects.toThrow();
  });

  it('keeps an account either complete (e-mail and password) or an empty placeholder', async () => {
    await expect(db.query(`INSERT INTO app_user (email, display_name, role) VALUES ('a@example.com', 'A', 'member')`)).rejects.toThrow();
    await expect(db.query(`INSERT INTO app_user (display_name, password_hash, role) VALUES ('A', 'h', 'member')`)).rejects.toThrow();
    await expect(db.query(`INSERT INTO app_user (email, display_name, password_hash, role) VALUES ('a@example.com', '', 'h', 'member')`)).rejects.toThrow();
    await expect(db.query(`INSERT INTO app_user (email, display_name, password_hash, role) VALUES ('a@example.com', 'A', 'h', 'owner')`)).rejects.toThrow();
  });

  it('accepts a session or a link secret only as a 32-byte hash, and a reset link only with its account', async () => {
    const user = await createTestUser(db);
    const [expires] = ["now() + interval '1 day'"];
    await expect(db.query(`INSERT INTO app_session (user_id, token_hash, expires_at) VALUES ($1, '\\x00ff', ${expires})`, [user])).rejects.toThrow();
    await db.query(`INSERT INTO app_session (user_id, token_hash, expires_at) VALUES ($1, decode(repeat('ab', 32), 'hex'), ${expires})`, [user]);
    await expect(db.query(`INSERT INTO app_session (user_id, token_hash, expires_at) VALUES ($1, decode(repeat('ab', 32), 'hex'), ${expires})`, [user])).rejects.toThrow(); // unique

    await expect(
      db.query(`INSERT INTO account_link (kind, token_hash, created_by, expires_at) VALUES ('reset', decode(repeat('cd', 32), 'hex'), $1, ${expires})`, [user]),
    ).rejects.toThrow(); // a reset must name an account
    await expect(
      db.query(`INSERT INTO account_link (kind, token_hash, user_id, created_by, expires_at) VALUES ('invitation', decode(repeat('ce', 32), 'hex'), $1, $1, ${expires})`, [user]),
    ).rejects.toThrow(); // an invitation names nobody
    await db.query(`INSERT INTO account_link (kind, token_hash, user_id, created_by, expires_at) VALUES ('reset', decode(repeat('cf', 32), 'hex'), $1, $1, ${expires})`, [user]);
  });

  it('removes sessions and links with their account, and refuses to delete an account that owns entries', async () => {
    const user = await createTestUser(db);
    await db.query(`INSERT INTO app_session (user_id, token_hash, expires_at) VALUES ($1, decode(repeat('ab', 32), 'hex'), now() + interval '1 day')`, [user]);
    await db.query('DELETE FROM app_user WHERE id = $1', [user]);
    expect(await countRows(db, 'app_session')).toBe(0);

    const owner = await createTestUser(db);
    await insertEntry(owner, await insertMedia());
    await expect(db.query('DELETE FROM app_user WHERE id = $1', [owner])).rejects.toThrow(); // a library is never wiped as a side effect
  });
});

describe('a library that existed before accounts', () => {
  let db: Database;
  let scratch: string;

  beforeEach(async () => {
    db = await createTestDatabase({ migrate: false });
    scratch = await mkdtemp(path.join(os.tmpdir(), 'otakudex-migrations-'));
  });
  afterEach(async () => {
    await db.close();
    await rm(scratch, { recursive: true, force: true });
  });

  async function migrateInTwoSteps(seed: () => Promise<void>): Promise<void> {
    await copyFile(path.join(MIGRATIONS_DIRECTORY, '001_init.sql'), path.join(scratch, '001_init.sql'));
    expect(await runMigrations(db, scratch)).toEqual(['001_init.sql']); // the database as it was before accounts
    await seed();
    expect(await runMigrations(db)).toEqual(['002_accounts.sql', '003_translations.sql']);
  }

  it('is handed to an unclaimed placeholder, and the first account takes it over with everything in it', async () => {
    await migrateInTwoSteps(async () => {
      const media = await db.query<{ id: number }>(`INSERT INTO media (title, episode_count) VALUES ('Old A', 12), ('Old B', 12) RETURNING id`);
      await db.query(
        `INSERT INTO library_entry (media_id, status, progress, bucket, rank_position, note)
         VALUES ($1, 'completed', 12, 'loved', 1, 'from before'), ($2, 'watching', 4, NULL, NULL, NULL)`,
        [media[0]!.id, media[1]!.id],
      );
    });

    const [placeholder] = await db.query<{ id: number; email: string | null; password_hash: string | null; role: string }>('SELECT id, email, password_hash, role FROM app_user');
    expect(placeholder).toMatchObject({ email: null, password_hash: null, role: 'admin' });
    expect(await db.query('SELECT 1 FROM library_entry WHERE user_id = $1', [placeholder!.id])).toHaveLength(2);

    const services = createTestServices(db);
    expect(await services.auth.getState(undefined)).toEqual({ phase: 'setup', legacyEntryCount: 2, needsSetupCode: false });
    await expect(services.auth.login({ email: 'anything@example.com', password: TEST_PASSWORD })).rejects.toThrow(); // the placeholder cannot sign in

    const { user } = await services.auth.setup({ displayName: 'Marie', email: 'marie@example.com', password: TEST_PASSWORD });
    expect(user.id).toBe(placeholder!.id); // claimed, not duplicated
    expect(await countRows(db, 'app_user')).toBe(1);
    const entries = await services.library.list(user.id);
    expect(entries.map((entry) => [entry.media.title, entry.progress, entry.rankPosition, entry.note])).toEqual([
      ['Old A', 12, 1, 'from before'],
      ['Old B', 4, null, null],
    ]);
  });

  it('creates nobody when the library was empty, so the first account is a plain insert', async () => {
    await migrateInTwoSteps(async () => undefined);
    expect(await countRows(db, 'app_user')).toBe(0);
    const services = createTestServices(db, [makeSnapshot()]);
    expect(await services.auth.getState(undefined)).toEqual({ phase: 'setup', legacyEntryCount: 0, needsSetupCode: false });
    const { user } = await services.auth.setup({ displayName: 'Marie', email: 'marie@example.com', password: TEST_PASSWORD });
    expect(user.role).toBe('admin');
    expect(await countRows(db, 'app_user')).toBe(1);
  });

  it('refuses two first accounts created at once', async () => {
    await migrateInTwoSteps(async () => undefined);
    const services = createTestServices(db);
    const results = await Promise.allSettled([
      services.auth.setup({ displayName: 'One', email: 'one@example.com', password: TEST_PASSWORD }),
      services.auth.setup({ displayName: 'Two', email: 'two@example.com', password: TEST_PASSWORD }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await countRows(db, 'app_user')).toBe(1);
  });
});
