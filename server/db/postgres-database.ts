import pg from 'pg';
import { TYPE_PARSERS, type Database, type Queryable, type Row } from './database.ts';

const MAX_CONNECTIONS = 5;
const CONNECTION_TIMEOUT_MS = 15_000; // a sleeping Neon compute can take a few seconds to wake
const IDLE_TIMEOUT_MS = 30_000;

type QueryRunner = Pick<pg.Pool | pg.PoolClient, 'query'>;

export function createPostgresDatabase(connectionString: string): Database {
  const pool = new pg.Pool({
    connectionString,
    max: MAX_CONNECTIONS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    types: {
      getTypeParser: ((oid: number, format?: string) =>
        TYPE_PARSERS[oid] ?? pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser,
    },
  });

  // Serverless Postgres closes idle sockets; without a listener Node would crash on the event.
  pool.on('error', (error) => console.error('Idle Postgres client error:', error.message));

  return {
    ...wrapRunner(pool),
    async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(wrapRunner(client));
        await client.query('COMMIT');
        client.release();
        return result;
      } catch (error) {
        // If even ROLLBACK fails the connection is unusable: destroy it instead of recycling it.
        const rollbackError = await client.query('ROLLBACK').then(() => undefined, (failure: Error) => failure);
        client.release(rollbackError);
        throw error;
      }
    },
    close: () => pool.end(),
  };
}

function wrapRunner(runner: QueryRunner): Queryable {
  return {
    async query<T extends object = Row>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const result = await runner.query(sql, [...params]);
      return result.rows as T[];
    },
    async exec(sql: string): Promise<void> {
      await runner.query(sql);
    },
  };
}
