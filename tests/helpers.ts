import { randomBytes } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { AccountUserDto } from '../shared/domain.ts';
import { buildApp, type AppOptions } from '../server/app.ts';
import { createAdminService } from '../server/auth/admin.ts';
import { createPasswordHasher, type PasswordHasher, type ScryptParams } from '../server/auth/password.ts';
import { createAuthService } from '../server/auth/service.ts';
import { createLoginThrottle } from '../server/auth/throttle.ts';
import type { Database, Queryable } from '../server/db/database.ts';
import { runMigrations } from '../server/db/migrate.ts';
import { createPgliteDatabase } from '../server/db/pglite-database.ts';
import { createPostgresDatabase } from '../server/db/postgres-database.ts';
import { createExportService } from '../server/export/service.ts';
import { createPosterProxy } from '../server/http/poster-proxy.ts';
import type { Services } from '../server/http/routes.ts';
import type { AnimeSnapshot, MetadataProvider, TrendingCover } from '../server/kitsu/snapshot.ts';
import type { TextTranslator } from '../server/translate/providers.ts';
import { createTranslationService } from '../server/translate/service.ts';
import { createBackdropService } from '../server/backdrop/service.ts';
import { createLibraryService } from '../server/library/service.ts';
import { createPickerService } from '../server/picker/service.ts';
import { createRankingService } from '../server/ranking/service.ts';
import { createStatsService } from '../server/stats/service.ts';

export const TEST_TIMEZONE = 'Europe/Paris';

/**
 * A fresh database with every migration applied.
 * By default it is embedded PGlite (no setup). When TEST_DATABASE_URL points at a Postgres server
 * allowed to create databases, each test gets its own throwaway database there instead, so the
 * whole suite can run against the real engine used in production.
 */
export async function createTestDatabase(options: { migrate?: boolean } = {}): Promise<Database> {
  const serverUrl = process.env['TEST_DATABASE_URL'];
  const db = serverUrl ? await createThrowawayPostgresDatabase(serverUrl) : createPgliteDatabase();
  if (options.migrate !== false) await runMigrations(db);
  return db;
}

async function createThrowawayPostgresDatabase(serverUrl: string): Promise<Database> {
  // The name is generated here (hex only), never taken from outside, so it is safe to inline.
  const name = `otakudex_test_${randomBytes(6).toString('hex')}`;
  const admin = createPostgresDatabase(serverUrl);
  await admin.exec(`CREATE DATABASE ${name}`);

  const testUrl = new URL(serverUrl);
  testUrl.pathname = `/${name}`;
  const db = createPostgresDatabase(testUrl.toString());
  return {
    ...db,
    async close() {
      await db.close();
      await admin.exec(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.close();
    },
  };
}

let nextKitsuId = 1000;

export function makeSnapshot(overrides: Partial<AnimeSnapshot> = {}): AnimeSnapshot {
  nextKitsuId += 1;
  return {
    kitsuId: nextKitsuId,
    title: `Test Anime ${nextKitsuId}`,
    titleEn: null,
    titleJa: null,
    synopsis: null,
    subtype: 'TV',
    airingStatus: 'finished',
    episodeCount: 12,
    episodeLengthMin: 24,
    startDate: '2020-01-01',
    endDate: '2020-03-31',
    genres: ['Action'],
    posterUrl: null,
    communityScore: 80,
    raw: null,
    ...overrides,
  };
}

/** A provider that serves a fixed catalogue instead of calling the network. */
export function createFakeProvider(catalogue: AnimeSnapshot[], trending: TrendingCover[] = []): MetadataProvider {
  return {
    trendingPosters: async (limit) => trending.slice(0, limit),
    search: async (query) =>
      catalogue.filter((snapshot) => snapshot.title.toLowerCase().includes(query.trim().toLowerCase())),
    getById: async (kitsuId) => catalogue.find((snapshot) => snapshot.kitsuId === kitsuId) ?? null,
  };
}

/** Cheap scrypt settings: the real ones (128 MiB, ~0.3 s) would make a suite of hundreds of sign-ins crawl. */
export const TEST_SCRYPT_PARAMS: ScryptParams = { cost: 2 ** 10, blockSize: 8, parallelization: 1 };

export interface TestClock {
  now: () => Date;
  advance: (ms: number) => void;
}

/** A clock the test moves by hand, starting at a fixed instant. */
export function createTestClock(start = new Date('2026-10-08T10:00:00.000Z')): TestClock {
  let current = start.getTime();
  return { now: () => new Date(current), advance: (ms) => void (current += ms) };
}

export function createTestServices(
  db: Database,
  catalogue: AnimeSnapshot[] = [],
  clock?: TestClock,
  options: { hasher?: PasswordHasher; setupCode?: string | null; trending?: TrendingCover[]; translator?: TextTranslator | null; translationBudget?: { perHour?: number; perAccount?: number } } = {},
): Services {
  const provider = createFakeProvider(catalogue, options.trending);
  const posters = createPosterProxy(async () => new Response('not used in tests', { status: 500 }));
  const library = createLibraryService({ db, provider, timezone: TEST_TIMEZONE });
  const hasher = options.hasher ?? createPasswordHasher({ params: TEST_SCRYPT_PARAMS });
  const now = clock?.now;
  return {
    backdrop: createBackdropService({ provider, posters, ...(now ? { now: () => now().getTime() } : {}) }),
    auth: createAuthService({ db, hasher, throttle: createLoginThrottle(), setupCode: options.setupCode ?? null, ...(now ? { now } : {}) }),
    admin: createAdminService({ db, ...(now ? { now } : {}) }),
    library,
    ranking: createRankingService(db),
    stats: createStatsService(db, TEST_TIMEZONE),
    picker: createPickerService(library),
    exporter: createExportService(db),
    posters,
    translation: createTranslationService({ db, translator: options.translator ?? null, ...(options.translationBudget?.perHour ? { maxCharactersPerHour: options.translationBudget.perHour } : {}), ...(options.translationBudget?.perAccount ? { maxCharactersPerAccountPerHour: options.translationBudget.perAccount } : {}), ...(now ? { now: () => now().getTime() } : {}) }),
  };
}

export function createTestApp(services: Services, allowedHosts: string[] = ['localhost'], extra: Partial<AppOptions> = {}) {
  return buildApp({ services, allowedHosts, ...extra });
}

let nextTestUser = 0;

/**
 * Inserts an account directly (no sign-in possible: its password hash is a placeholder) and returns its id.
 * For tests of data services, which only need an owner. Use the auth service when a test must sign in.
 */
export async function createTestUser(db: Queryable, overrides: { displayName?: string; role?: 'admin' | 'member' } = {}): Promise<number> {
  nextTestUser += 1;
  const [row] = await db.query<{ id: number }>(
    `INSERT INTO app_user (email, display_name, password_hash, role) VALUES ($1, $2, 'scrypt$1024$8$1$c2FsdA$a2V5', $3) RETURNING id`,
    [`person${nextTestUser}@example.com`, overrides.displayName ?? `Person ${nextTestUser}`, overrides.role ?? 'member'],
  );
  if (!row) throw new Error('createTestUser: no row returned');
  return row.id;
}

export async function countRows(db: Queryable, table: string): Promise<number> {
  const rows = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0]?.count ?? 0;
}

// ---- Signing in over HTTP -----------------------------------------------------------------------------

/** Long enough (15+ characters) and not on the blocklist; used by every test that signs in. */
export const TEST_PASSWORD = 'une phrase de passe pour les tests';

export interface TestSession {
  /** Value for a request's `cookie` header. */
  cookie: string;
  user: AccountUserDto;
}

/** "name=value" of the cookie a response sets, ready to send back. */
export function sessionCookieOf(response: LightMyRequestResponse): string {
  const cookie = response.cookies.find((candidate) => candidate.name.endsWith('otakudex_session'));
  if (!cookie) throw new Error(`no session cookie in the response (status ${response.statusCode}): ${response.body}`);
  return `${cookie.name}=${cookie.value}`;
}

/** Creates the administrator through the real first-launch route. */
export async function signUpFirstAccount(
  app: FastifyInstance,
  account: { displayName?: string; email?: string; password?: string } = {},
): Promise<TestSession> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { displayName: 'Admin', email: 'admin@example.com', password: TEST_PASSWORD, ...account },
  });
  if (response.statusCode !== 201) throw new Error(`setup failed: ${response.statusCode} ${response.body}`);
  return { cookie: sessionCookieOf(response), user: response.json<{ user: AccountUserDto }>().user };
}

export async function signIn(app: FastifyInstance, email: string, password: string = TEST_PASSWORD): Promise<TestSession> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  if (response.statusCode !== 200) throw new Error(`sign-in failed: ${response.statusCode} ${response.body}`);
  return { cookie: sessionCookieOf(response), user: response.json<{ user: AccountUserDto }>().user };
}

/** The administrator invites someone, who then creates their account through the real invitation routes. */
export async function inviteAndJoin(
  app: FastifyInstance,
  admin: TestSession,
  member: { displayName: string; email: string; password?: string },
): Promise<TestSession> {
  const invitation = await app.inject({ method: 'POST', url: '/api/admin/invitations', headers: { cookie: admin.cookie }, payload: { label: member.displayName } });
  if (invitation.statusCode !== 201) throw new Error(`invitation failed: ${invitation.statusCode} ${invitation.body}`);
  const { token } = invitation.json<{ token: string }>();
  const joined = await app.inject({
    method: 'POST',
    url: '/api/auth/join',
    payload: { token, displayName: member.displayName, email: member.email, password: member.password ?? TEST_PASSWORD },
  });
  if (joined.statusCode !== 201) throw new Error(`join failed: ${joined.statusCode} ${joined.body}`);
  return { cookie: sessionCookieOf(joined), user: joined.json<{ user: AccountUserDto }>().user };
}
