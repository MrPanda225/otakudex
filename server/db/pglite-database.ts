import { PGlite } from '@electric-sql/pglite';
import { TYPE_PARSERS, type Database, type Queryable, type Row } from './database.ts';

type PgliteRunner = Pick<PGlite, 'query' | 'exec'>;

/**
 * Embedded Postgres, for tests and zero-setup local development only.
 * An empty `dataDir` keeps everything in memory.
 */
export function createPgliteDatabase(dataDir = ''): Database {
  const db = new PGlite(dataDir || undefined);

  return {
    ...wrapRunner(db),
    transaction: (work) => db.transaction((tx) => work(wrapRunner(tx))),
    close: () => db.close(),
  };
}

function wrapRunner(runner: PgliteRunner): Queryable {
  return {
    async query<T extends object = Row>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      // PGlite ignores constructor-level parsers for these types, so they are passed per query.
      const result = await runner.query<T>(sql, [...params], { parsers: TYPE_PARSERS });
      return result.rows;
    },
    async exec(sql: string): Promise<void> {
      await runner.exec(sql);
    },
  };
}
