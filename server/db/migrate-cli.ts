import { loadConfig } from '../config.ts';
import { loadEnvFile } from '../load-env.ts';
import { describeDatabase, openDatabase } from './index.ts';
import { runMigrations } from './migrate.ts';

loadEnvFile();
const config = loadConfig();
console.log(`Migrating ${describeDatabase(config.migrationDatabaseUrl)}`);

const db = await openDatabase(config.migrationDatabaseUrl);
try {
  const applied = await runMigrations(db);
  console.log(applied.length === 0 ? 'Already up to date.' : `Applied: ${applied.join(', ')}`);
} finally {
  await db.close();
}
