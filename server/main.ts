import { buildApp } from './app.ts';
import { createAdminService } from './auth/admin.ts';
import { createPasswordHasher } from './auth/password.ts';
import { createAuthService } from './auth/service.ts';
import { createBackdropService } from './backdrop/service.ts';
import { createLoginThrottle } from './auth/throttle.ts';
import { loadConfig, securityWarnings } from './config.ts';
import { loadEnvFile } from './load-env.ts';
import { describeDatabase, openDatabase } from './db/index.ts';
import { runMigrations } from './db/migrate.ts';
import { createExportService } from './export/service.ts';
import { createPosterProxy } from './http/poster-proxy.ts';
import { createKitsuProvider } from './kitsu/provider.ts';
import { createLibraryService } from './library/service.ts';
import { createPickerService } from './picker/service.ts';
import { createRankingService } from './ranking/service.ts';
import { createStatsService } from './stats/service.ts';
import { createTranslatorFromSettings } from './translate/providers.ts';
import { createTranslationService } from './translate/service.ts';

loadEnvFile();
const config = loadConfig();
console.log(`Database: ${describeDatabase(config.databaseUrl)}`);

const db = await openDatabase(config.databaseUrl).catch((error: unknown) => failFast('Cannot open the database', error));

// The application role has no right to change the schema, so migrations run on their own command
// (`npm run migrate`). The embedded dev database has no such role, so it migrates itself.
if (config.databaseUrl.startsWith('pglite://')) {
  const applied = await runMigrations(db);
  if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);
}
await db.query('SELECT 1 FROM library_entry LIMIT 1').catch((error: unknown) =>
  failFast('The database is unreachable or not migrated (run `npm run migrate`)', error),
);

const provider = createKitsuProvider({ baseUrl: config.kitsuBaseUrl });
const posters = createPosterProxy(); // one relay, one cache: covers of libraries and of the sign-in backdrop share it
const library = createLibraryService({ db, provider, timezone: config.timezone });
const backdrop = createBackdropService({ provider, posters });

const translator = createTranslatorFromSettings(config.translation);
console.log(translator ? `Synopsis translation: ${translator.name}` : 'Synopsis translation: none (texts stay in English; see docs/07)');
const translation = createTranslationService({ db, translator });

const hasher = createPasswordHasher();
await hasher.verifyAgainstNothing(''); // warm-up: the first unknown-account sign-in must not take twice as long as the others
const auth = createAuthService({ db, hasher, throttle: createLoginThrottle(), setupCode: config.setupCode });
await auth.purgeStale();

const [accounts] = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM app_user WHERE email IS NOT NULL');
for (const warning of securityWarnings(config, { hasAccount: (accounts?.count ?? 0) > 0 })) console.warn(`WARNING: ${warning}`);

const app = await buildApp({
  allowedHosts: config.allowedHosts,
  isCookieSecure: config.isCookieSecure,
  trustProxy: config.trustProxy,
  // Cookies hold the session secret: they never reach a log line.
  logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] },
  services: {
    backdrop,
    auth,
    admin: createAdminService({ db }),
    library,
    ranking: createRankingService(db),
    stats: createStatsService(db, config.timezone),
    picker: createPickerService(library),
    exporter: createExportService(db),
    posters,
    translation,
  },
});

async function shutdown(): Promise<void> {
  await app.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: config.host, port: config.port });
console.log(`Otakudex is running on http://${config.host}:${config.port}`);
void backdrop.warm(); // the first visitor finds the sign-in covers ready; a failure only means the fallback is shown

function failFast(message: string, error: unknown): never {
  console.error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
