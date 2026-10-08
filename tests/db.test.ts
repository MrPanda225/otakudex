import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../server/db/database.ts';
import { runMigrations } from '../server/db/migrate.ts';
import { createTestDatabase, createTestUser } from './helpers.ts';

describe('database layer', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
  });
  afterEach(async () => {
    await db.close();
  });

  it('applies migrations once and records them', async () => {
    const secondRun = await runMigrations(db);
    expect(secondRun).toEqual([]);
    const rows = await db.query<{ version: string }>('SELECT version FROM schema_migrations');
    expect(rows.map((row) => row.version)).toEqual(['001_init.sql', '002_accounts.sql', '003_translations.sql']);
  });

  it('returns numbers for bigint and numeric, strings for dates', async () => {
    await db.query(
      `INSERT INTO media (title, community_score, start_date) VALUES ($1, $2, $3)`,
      ['Parser check', 87.5, '2023-09-29'],
    );
    const [row] = await db.query<{ id: number; community_score: number; start_date: string }>(
      'SELECT id, community_score, start_date FROM media',
    );
    expect(typeof row?.id).toBe('number');
    expect(row?.community_score).toBe(87.5);
    expect(row?.start_date).toBe('2023-09-29');
  });

  it('rolls back a transaction that throws', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query(`INSERT INTO media (title) VALUES ('will vanish')`);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await db.query('SELECT id FROM media');
    expect(rows).toHaveLength(0);
  });

  it('lets ranks shift inside one transaction thanks to the deferred unique constraint', async () => {
    const userId = await createTestUser(db);
    const media = await db.query<{ id: number }>(
      `INSERT INTO media (title) VALUES ('a'), ('b') RETURNING id`,
    );
    for (const [index, row] of media.entries()) {
      await db.query(
        `INSERT INTO library_entry (user_id, media_id, status, bucket, rank_position)
         VALUES ($1, $2, 'completed', 'loved', $3)`,
        [userId, row.id, index + 1],
      );
    }
    await db.transaction(async (tx) => {
      await tx.query('UPDATE library_entry SET rank_position = rank_position + 1');
    });
    const ranks = await db.query<{ rank_position: number }>(
      'SELECT rank_position FROM library_entry ORDER BY rank_position',
    );
    expect(ranks.map((row) => row.rank_position)).toEqual([2, 3]);
  });

  it('refuses a bucket without a rank', async () => {
    const userId = await createTestUser(db);
    const [media] = await db.query<{ id: number }>(`INSERT INTO media (title) VALUES ('x') RETURNING id`);
    await expect(
      db.query(`INSERT INTO library_entry (user_id, media_id, status, bucket) VALUES ($1, $2, 'completed', 'loved')`, [
        userId,
        media?.id,
      ]),
    ).rejects.toThrow();
  });
});
