import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from './database.ts';

const MIGRATION_FILE_PATTERN = /^(\d{3,})_[a-z0-9_]+\.sql$/;

export const MIGRATIONS_DIRECTORY = path.join(import.meta.dirname, 'migrations');

/**
 * Applies the SQL files of `directory` that were not applied yet, in numeric order, each in its own
 * transaction. An applied migration is never edited: add a new file instead.
 * Returns the versions applied by this call.
 */
export async function runMigrations(db: Database, directory = MIGRATIONS_DIRECTORY): Promise<string[]> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version     text PRIMARY KEY,
       applied_at  timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const applied = await getAppliedVersions(db);
  const pending = (await listMigrationFiles(directory)).filter((file) => !applied.has(file));

  for (const file of pending) {
    const sql = await readFile(path.join(directory, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });
  }
  return pending;
}

async function getAppliedVersions(db: Database): Promise<Set<string>> {
  const rows = await db.query<{ version: string }>('SELECT version FROM schema_migrations');
  return new Set(rows.map((row) => row.version));
}

async function listMigrationFiles(directory: string): Promise<string[]> {
  const names = await readdir(directory);
  return names.filter((name) => MIGRATION_FILE_PATTERN.test(name)).sort();
}
