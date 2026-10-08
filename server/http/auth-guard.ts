import fastifyCookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_MAX_AGE_SECONDS, type AuthService, type AuthUser } from '../auth/service.ts';
import { addressKey, createRequestRateLimiter, type RequestRateLimiter } from '../auth/throttle.ts';
import { AuthenticationError } from '../errors.ts';
import { problem } from './problem.ts';
import { isApiRequest } from './security.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in person, set by the guard on every API request; null when there is no valid session. */
    user: AuthUser | null;
  }
}

/**
 * The closed list of API routes anyone may call without a session. Everything else under /api/ needs
 * one: a new route is private unless it is added here on purpose.
 */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  'GET /api/health',
  'GET /api/backdrop', // the covers behind the sign-in screens: the same for everybody, from no library
  'GET /api/backdrop/:index',
  'GET /api/auth/state',
  'POST /api/auth/setup',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/link/check',
  'POST /api/auth/join',
  'POST /api/auth/reset',
]);

const ADMIN_ROUTE_PREFIX = '/api/admin/';
const AUTH_ROUTE_PREFIX = '/api/auth/';
/** Signing out is never counted nor refused: a person on a shared computer must always be able to leave. */
const UNLIMITED_AUTH_ROUTE = '/api/auth/logout';
const AUTH_REQUESTS_PER_WINDOW = 60;
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_WINDOW_SECONDS = AUTH_WINDOW_MS / 1000;

const SESSION_COOKIE = 'otakudex_session';
// The "__Host-" prefix makes browsers accept the cookie only with Secure, Path=/ and no Domain.
const SECURE_SESSION_COOKIE = `__Host-${SESSION_COOKIE}`;

export interface SessionCookies {
  read(request: FastifyRequest): string | undefined;
  start(reply: FastifyReply, token: string): void;
  end(reply: FastifyReply): void;
}

/** The session cookie: HttpOnly (no script reads it), SameSite=Strict, and Secure once served over HTTPS. */
export function createSessionCookies(isSecure: boolean): SessionCookies {
  const name = isSecure ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
  const attributes = { path: '/', httpOnly: true, sameSite: 'strict', secure: isSecure } as const;
  return {
    read: (request) => request.cookies[name],
    start: (reply, token) => void reply.setCookie(name, token, { ...attributes, maxAge: SESSION_MAX_AGE_SECONDS }),
    end: (reply) => void reply.clearCookie(name, attributes),
  };
}

export interface AuthGuardOptions {
  auth: AuthService;
  cookies: SessionCookies;
  /** Caps sign-in attempts per address; replaceable in tests. */
  rateLimiter?: RequestRateLimiter;
  now?: () => Date;
}

/** The signed-in person of this request. Throws when there is none: a route that forgot the guard fails closed. */
export function requireUser(request: FastifyRequest): AuthUser {
  if (request.user === null) throw new AuthenticationError('auth.loginRequired');
  return request.user;
}

export async function registerAuthGuard(app: FastifyInstance, options: AuthGuardOptions): Promise<void> {
  const { auth, cookies, now = () => new Date() } = options;
  const rateLimiter = options.rateLimiter ?? createRequestRateLimiter({ limit: AUTH_REQUESTS_PER_WINDOW, windowMs: AUTH_WINDOW_MS });

  await app.register(fastifyCookie);
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (request, reply) => {
    if (!isApiRequest(request)) return;
    // Decided from the route that matched, not from the raw URL ("/%61pi/..." reaches "/api/...").
    const route = request.routeOptions.url ?? '';

    const isLimited = request.method === 'POST' && route.startsWith(AUTH_ROUTE_PREFIX) && route !== UNLIMITED_AUTH_ROUTE;
    if (isLimited && !rateLimiter.allow(addressKey(request.ip), now())) {
      return reply
        .code(429)
        .header('Retry-After', String(AUTH_WINDOW_SECONDS))
        .send(problem(request, 'auth.tooManyRequests'));
    }

    request.user = await auth.authenticate(cookies.read(request));
    if (PUBLIC_ROUTES.has(`${request.method} ${route}`)) return;
    if (request.user === null) return reply.code(401).send(problem(request, 'auth.loginRequired'));
    if (route.startsWith(ADMIN_ROUTE_PREFIX) && request.user.role !== 'admin') {
      return reply.code(403).send(problem(request, 'auth.adminOnly'));
    }
    return undefined;
  });
}
