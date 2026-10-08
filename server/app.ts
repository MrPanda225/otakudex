import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyCompress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import { constants as zlibConstants } from 'node:zlib';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import type { RequestRateLimiter } from './auth/throttle.ts';
import { AppError, TooManyAttemptsError } from './errors.ts';
import { createSessionCookies, registerAuthGuard } from './http/auth-guard.ts';
import { languageOf, problem } from './http/problem.ts';
import { registerRoutes, type Services } from './http/routes.ts';
import { registerSecurity } from './http/security.ts';

const WEB_DIST_DIRECTORY = path.resolve(import.meta.dirname, '..', 'web', 'dist');
/** Vite writes files whose name holds a hash of their content under assets/: they never change, so they are kept for a year. */
/** Brotli at its default quality (11) is far too slow to run on every request; 4 is fast and close to gzip's size. */
const BROTLI_QUALITY = 4;
const HASHED_ASSET_SEGMENT = `${path.sep}assets${path.sep}`;
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** The page that names those files must be re-checked every time, or a new version would never reach the browser. */
const REVALIDATE_CACHE_CONTROL = 'no-cache';
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000; // a stalled connection must not stay open forever

export interface AppOptions {
  services: Services;
  allowedHosts: readonly string[];
  /** Folder of the built client. Tests point it at a temporary folder. */
  webRoot?: string;
  /** Behind a proxy that rewrites X-Forwarded-For: count the client's address, not the proxy's. */
  trustProxy?: boolean;
  /** True when the application is served over HTTPS: the session cookie then carries `Secure` and the `__Host-` prefix. */
  isCookieSecure?: boolean;
  /** Set to false in tests to keep the output quiet. */
  logger?: FastifyServerOptions['logger'];
  /** Caps sign-in attempts per address; tests replace it. */
  rateLimiter?: RequestRateLimiter;
  now?: () => Date;
}

/** Builds the HTTP server. It does not start listening: `main.ts` (or a test) does that. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: DEFAULT_BODY_LIMIT_BYTES,
    requestTimeout: REQUEST_TIMEOUT_MS,
    trustProxy: options.trustProxy ?? false,
  });
  await configureApp(app, options);
  return app;
}

/** Registers everything on an existing server, so a test can watch the routes as they are added. */
export async function configureApp(
  app: FastifyInstance,
  { services, allowedHosts, isCookieSecure = false, rateLimiter, now, webRoot = WEB_DIST_DIRECTORY }: AppOptions,
): Promise<void> {
  const cookies = createSessionCookies(isCookieSecure);
  registerSecurity(app, allowedHosts);
  // Text answers (page, scripts, styles, JSON) are compressed when the browser accepts it; images are left alone.
  await app.register(fastifyCompress, {
    encodings: ['br', 'gzip'],
    brotliOptions: { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } },
  });
  await registerAuthGuard(app, { auth: services.auth, cookies, ...(rateLimiter ? { rateLimiter } : {}), ...(now ? { now } : {}) });
  registerErrorHandling(app);
  registerRoutes(app, services, cookies);

  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, {
      root: webRoot,
      cacheControl: false, // decided file by file below
      setHeaders: (response, filePath) => {
        response.header('Cache-Control', filePath.includes(HASHED_ASSET_SEGMENT) ? IMMUTABLE_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL);
      },
    });
  }
}

function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send(problem(request, 'error.invalidRequest'));
    }
    if (error instanceof TooManyAttemptsError) {
      return reply
        .code(error.statusCode)
        .header('Retry-After', String(error.retryAfterSeconds))
        .send({ message: error.messageIn(languageOf(request)), code: error.key, retryAfterSeconds: error.retryAfterSeconds });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.messageIn(languageOf(request)), code: error.key });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send(problem(request, 'error.badRequest'));
    }
    request.log.error(error);
    return reply.code(500).send(problem(request, 'error.internal'));
  });

  app.setNotFoundHandler((request, reply) => {
    const isApiCall = request.url.startsWith('/api/');
    return reply.code(404).send(problem(request, isApiCall ? 'error.routeNotFound' : 'error.pageNotFound'));
  });
}
