import { z } from 'zod';

const DEFAULT_PORT = 3000;
const DEFAULT_DATABASE_URL = 'pglite://./.data/dev';
const DEFAULT_ALLOWED_HOSTS = 'localhost,127.0.0.1,[::1]';
const DEFAULT_KITSU_BASE_URL = 'https://kitsu.app/api/edge';

export interface Config {
  databaseUrl: string;
  migrationDatabaseUrl: string;
  host: string;
  port: number;
  timezone: string;
  allowedHosts: string[];
  kitsuBaseUrl: string;
  /** True when the application is reached over HTTPS: the session cookie is then marked Secure. */
  isCookieSecure: boolean;
  /** True behind a reverse proxy that rewrites X-Forwarded-For: the client's own address is then used. */
  trustProxy: boolean;
  /** When set, the first account can only be created by someone who knows it. */
  setupCode: string | null;
  /** Which service translates the synopses; none set means they stay in English (docs/07). */
  translation: { deeplApiKey: string | null; libreTranslateUrl: string | null; libreTranslateApiKey: string | null };
}

const environmentSchema = z.object({
  DATABASE_URL: z.string().trim().min(1).default(DEFAULT_DATABASE_URL),
  MIGRATION_DATABASE_URL: z.string().trim().optional(),
  LISTEN_HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
  TIMEZONE: z.string().trim().optional(),
  ALLOWED_HOSTS: z.string().default(DEFAULT_ALLOWED_HOSTS),
  KITSU_BASE_URL: z.url().default(DEFAULT_KITSU_BASE_URL),
  COOKIE_SECURE: z.stringbool().default(false),
  TRUST_PROXY: z.stringbool().default(false),
  SETUP_CODE: z.string().trim().min(8).max(100).optional().or(z.literal('')),
  DEEPL_API_KEY: z.string().trim().min(10).max(200).optional().or(z.literal('')),
  LIBRETRANSLATE_URL: z
    .url({ protocol: /^https?$/ })
    .refine((value) => { const { username, password } = new URL(value); return username === '' && password === ''; }, 'must not contain a user name or password: use LIBRETRANSLATE_API_KEY')
    .optional()
    .or(z.literal('')),
  LIBRETRANSLATE_API_KEY: z.string().trim().max(200).optional().or(z.literal('')),
});

/**
 * Reads and validates the process environment once, at startup, so a bad setting stops the server
 * immediately with a clear message instead of failing later in a request.
 */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration: ${problems.join('; ')}`);
  }
  const env = parsed.data;
  const timezone = env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
  assertValidTimezone(timezone);
  return {
    databaseUrl: env.DATABASE_URL,
    migrationDatabaseUrl: env.MIGRATION_DATABASE_URL || env.DATABASE_URL,
    host: env.LISTEN_HOST,
    port: env.PORT,
    timezone,
    allowedHosts: splitList(env.ALLOWED_HOSTS),
    kitsuBaseUrl: env.KITSU_BASE_URL.replace(/\/+$/, ''),
    isCookieSecure: env.COOKIE_SECURE,
    trustProxy: env.TRUST_PROXY,
    setupCode: env.SETUP_CODE ? env.SETUP_CODE : null,
    translation: {
      deeplApiKey: env.DEEPL_API_KEY || null,
      libreTranslateUrl: env.LIBRETRANSLATE_URL || null,
      libreTranslateApiKey: env.LIBRETRANSLATE_API_KEY || null,
    },
  };
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Things worth telling the person who starts the server, before the first request arrives.
 * `hasAccount` is false while nobody has created the first account yet.
 */
export function securityWarnings(config: Pick<Config, 'host' | 'isCookieSecure' | 'setupCode'> & Partial<Pick<Config, 'translation'>>, context: { hasAccount?: boolean } = {}): string[] {
  const warnings: string[] = [];
  const { libreTranslateUrl, libreTranslateApiKey } = config.translation ?? {};
  if (libreTranslateUrl && libreTranslateApiKey) {
    const { protocol, hostname } = new URL(libreTranslateUrl);
    if (protocol === 'http:' && !LOOPBACK_HOSTS.has(hostname.toLowerCase())) {
      warnings.push(`LIBRETRANSLATE_URL is plain http on ${hostname}: LIBRETRANSLATE_API_KEY travels unencrypted. Use https, or a machine you trust on a network you trust.`);
    }
  }
  const isReachableFromOutside = !LOOPBACK_HOSTS.has(config.host.toLowerCase());
  if (!isReachableFromOutside) return warnings;
  if (!config.isCookieSecure) {
    warnings.push(
      `The server listens on ${config.host}, so other machines can reach it, but COOKIE_SECURE is not set: passwords and ` +
        'session cookies would travel unencrypted. Serve it over HTTPS (a reverse proxy) and set COOKIE_SECURE=true.',
    );
  }
  if (context.hasAccount === false && config.setupCode === null) {
    warnings.push(
      `No account exists yet and SETUP_CODE is not set: whoever opens ${config.host} first becomes the administrator ` +
        '(and takes over any existing library). Set SETUP_CODE to a secret of at least 8 characters, or create the account first from the machine itself.',
    );
  }
  return warnings;
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new Error(`Invalid configuration: TIMEZONE "${timezone}" is not a known IANA time zone`);
  }
}
