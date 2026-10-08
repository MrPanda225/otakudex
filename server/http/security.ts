import type { FastifyInstance, FastifyRequest } from 'fastify';
import { problem } from './problem.ts';

const API_PREFIX = '/api/';
/** Covers are static images: letting the browser cache them is the point of the proxy. */
const CACHEABLE_API_ROUTES: ReadonlySet<string> = new Set(['/api/poster', '/api/backdrop/:index']);

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/**
 * True when the request reaches an API route. It is decided by the route that matched, not by the raw
 * URL: "/%61pi/library" reaches "/api/library" although it does not start with "/api/".
 */
export function isApiRequest(request: FastifyRequest): boolean {
  return (request.routeOptions.url ?? '').startsWith(API_PREFIX) || request.url.startsWith(API_PREFIX);
}

/** Host name of a Host header without its port: "localhost:3000" -> "localhost", "[::1]:3000" -> "[::1]". */
export function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when the request comes from the same site: no Origin header, or an Origin matching the Host. */
export function isSameOrigin(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === hostHeader;
  } catch {
    return false;
  }
}

/**
 * True when the browser says the request comes from another site, or from another origin.
 * `Sec-Fetch-Site` is "same-origin" for the app's own calls and "none" for a typed address; any other
 * value is refused ("same-site" is what another port on this machine looks like).
 */
function isForeignRequest(request: FastifyRequest): boolean {
  const site = request.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return true;
  return !isSameOrigin(request.headers.origin, request.headers.host);
}

/**
 * Local-service protections:
 * - Host allow-list, against DNS rebinding (a hostile page resolving its own name to 127.0.0.1);
 * - every /api request must come from this very origin, reads included: a page on another site or on
 *   another local port could otherwise trigger outgoing requests or, in development, read the data;
 * - API answers carry personal data, so the browser never stores them (covers excepted);
 * - strict security headers on every response.
 */
export function registerSecurity(app: FastifyInstance, allowedHosts: readonly string[]): void {
  app.addHook('onRequest', async (request, reply) => {
    const hostname = hostnameOf(request.headers.host);
    if (hostname === null || !allowedHosts.includes(hostname)) {
      return reply.code(403).send(problem(request, 'error.hostNotAllowed'));
    }
    if (isApiRequest(request) && isForeignRequest(request)) {
      return reply.code(403).send(problem(request, 'error.foreignOrigin'));
    }
    return undefined;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    const isPrivateApiAnswer = isApiRequest(request) && !CACHEABLE_API_ROUTES.has(request.routeOptions.url ?? '');
    if (isPrivateApiAnswer) reply.header('Cache-Control', 'no-store');
    return payload;
  });
}
