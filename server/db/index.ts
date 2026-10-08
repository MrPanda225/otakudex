import { mkdir } from 'node:fs/promises';
import type { Database } from './database.ts';
import { acquireDirectoryLock } from './directory-lock.ts';

const PGLITE_PREFIX = 'pglite://';

export type DatabaseKind = 'postgres' | 'pglite';

export function databaseKindOf(url: string): DatabaseKind {
  return url.startsWith(PGLITE_PREFIX) ? 'pglite' : 'postgres';
}

/**
 * Human-readable target for startup logs. Never includes the user name or password.
 */
export function describeDatabase(url: string): string {
  if (databaseKindOf(url) === 'pglite') {
    return `embedded PGlite (${url.slice(PGLITE_PREFIX.length) || 'memory'}) - development only`;
  }
  try {
    const { hostname, pathname } = new URL(url);
    return `Postgres ${hostname}${pathname}`;
  } catch {
    return 'Postgres (unparseable URL)';
  }
}

/**
 * Opens the database named by `url`: `postgres://...` for Neon or the homelab,
 * `pglite://<dir>` for the embedded development database.
 */
export async function openDatabase(url: string): Promise<Database> {
  if (databaseKindOf(url) === 'pglite') {
    const { createPgliteDatabase } = await import('./pglite-database.ts');
    const dataDir = url.slice(PGLITE_PREFIX.length);
    if (dataDir === '') return createPgliteDatabase(dataDir); // in memory: nothing to share
    await mkdir(dataDir, { recursive: true });
    const releaseLock = await acquireDirectoryLock(`${dataDir.replace(/\/+$/, '')}.lock`);
    try {
      const db = createPgliteDatabase(dataDir);
      return {
        ...db,
        close: async () => {
          await db.close();
          await releaseLock();
        },
      };
    } catch (error) {
      await releaseLock();
      throw error;
    }
  }
  const { createPostgresDatabase } = await import('./postgres-database.ts');
  return createPostgresDatabase(url);
}
