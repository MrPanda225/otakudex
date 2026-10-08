import Fastify, { type FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureApp } from '../server/app.ts';
import { PUBLIC_ROUTES as GUARD_PUBLIC_ROUTES } from '../server/http/auth-guard.ts';
import type { Database } from '../server/db/database.ts';
import {
  createTestApp,
  createTestDatabase,
  createTestServices,
  inviteAndJoin,
  makeSnapshot,
  signUpFirstAccount,
  TEST_PASSWORD,
  type TestSession,
} from './helpers.ts';

/** The only API routes a visitor may call. Written out here on purpose: adding one to the guard must also change this test. */
const PUBLIC_ROUTES = [
  'GET /api/health',
  'GET /api/backdrop',
  'GET /api/backdrop/:index',
  'GET /api/auth/state',
  'POST /api/auth/setup',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/link/check',
  'POST /api/auth/join',
  'POST /api/auth/reset',
];

describe('the guard in front of the API', () => {
  let db: Database;
  let app: FastifyInstance;
  let admin: TestSession;
  let member: TestSession;
  const frieren = makeSnapshot({ title: 'Frieren', episodeCount: 3 });

  beforeEach(async () => {
    db = await createTestDatabase();
    app = await createTestApp(createTestServices(db, [frieren]));
    admin = await signUpFirstAccount(app);
    member = await inviteAndJoin(app, admin, { displayName: 'Camille', email: 'camille@example.com' });
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  it('opens the guard to exactly the closed public list, and to nothing else', () => {
    // A route listed here by mistake would still be refused by the handler's own check; this keeps the list itself honest.
    expect([...GUARD_PUBLIC_ROUTES].sort()).toEqual([...PUBLIC_ROUTES].sort());
  });

  it('refuses a visitor on every registered API route except the closed public list', async () => {
    // Watch the routes as they are registered, so a route added tomorrow is tested without anyone remembering.
    const watched = Fastify();
    const routes: string[] = [];
    watched.addHook('onRoute', (route) => {
      for (const method of [route.method].flat()) if (route.url.startsWith('/api/')) routes.push(`${method} ${route.url}`);
    });
    await configureApp(watched, { services: createTestServices(db, [frieren]), allowedHosts: ['localhost'] });

    expect(routes.length).toBeGreaterThan(25); // the list is not empty by accident
    expect(routes).toEqual(expect.arrayContaining(PUBLIC_ROUTES));

    for (const route of routes) {
      const [method, pattern] = route.split(' ') as [string, string];
      const url = pattern.replace(/:\w+/g, '1');
      const response = await watched.inject({ method: method as 'GET', url });
      if (PUBLIC_ROUTES.includes(route)) {
        expect(response.statusCode, route).not.toBe(401);
      } else {
        expect(response.statusCode, route).toBe(401);
        if (method !== 'HEAD') expect(response.json(), route).toEqual({ message: 'Connecte-toi pour continuer.', code: 'auth.loginRequired' });
      }
    }
    await watched.close();
  });

  it('keeps every administration route from a member, whatever the method', async () => {
    const watched = Fastify();
    const adminRoutes: string[] = [];
    watched.addHook('onRoute', (route) => {
      for (const method of [route.method].flat()) if (route.url.startsWith('/api/admin/') && method !== 'HEAD') adminRoutes.push(`${method} ${route.url}`);
    });
    await configureApp(watched, { services: createTestServices(db), allowedHosts: ['localhost'] });
    expect(adminRoutes.length).toBeGreaterThanOrEqual(6);
    for (const route of adminRoutes) {
      const [method, pattern] = route.split(' ') as [string, string];
      const response = await app.inject({ method: method as 'GET', url: pattern.replace(/:\w+/g, '1'), headers: { cookie: member.cookie }, payload: {} });
      expect(response.statusCode, route).toBe(403);
    }
    await watched.close();
  });

  it('treats "/%61pi/..." like "/api/...": no way round the guard, the origin check or the cache rule', async () => {
    for (const url of ['/%61pi/library', '/api/%6Cibrary', '/%61pi/stats', '/%61pi/export.json']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
      expect((await app.inject({ method: 'GET', url, headers: { cookie: admin.cookie, origin: 'http://attacker.example' } })).statusCode, url).toBe(403);
      const answer = await app.inject({ method: 'GET', url, headers: { cookie: admin.cookie } });
      expect(answer.statusCode, url).toBe(200);
      expect(answer.headers['cache-control'], url).toBe('no-store');
    }
  });

  it('does not mistake the page and its files for API routes', async () => {
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).not.toBe(401);
    expect((await app.inject({ method: 'GET', url: '/assets/nothing.js' })).statusCode).not.toBe(401);
  });

  it('refuses a cookie that is not a session secret before touching the database', async () => {
    for (const cookie of ['otakudex_session=', 'otakudex_session=abc', `otakudex_session=${'a'.repeat(43)}`, `otakudex_session=${'a'.repeat(44)}`]) {
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: { cookie } })).statusCode, cookie).toBe(401);
    }
  });

  it('refuses the host and the foreign origin before it even looks at the session', async () => {
    const wrongHost = await app.inject({ method: 'GET', url: '/api/library', headers: { cookie: admin.cookie, host: 'attacker.example' } });
    expect(wrongHost.statusCode).toBe(403);
    const crossSite = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'sec-fetch-site': 'cross-site' }, payload: { email: 'admin@example.com', password: TEST_PASSWORD } });
    expect(crossSite.statusCode).toBe(403);
  });
});

describe('what the server writes in its logs', () => {
  it('never contains a password, a session secret or a cookie', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const db = await createTestDatabase();
    const app = await createTestApp(createTestServices(db), ['localhost'], {
      logger: { level: 'info', stream: sink, redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] },
    });
    const secretPassword = 'le mot de passe très secret de test';
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { displayName: 'Marie', email: 'marie@example.com', password: secretPassword } });
    const token = String(setup.headers['set-cookie']).split(';')[0]!.split('=')[1]!;
    await app.inject({ method: 'GET', url: '/api/library', headers: { cookie: `otakudex_session=${token}` } });
    await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'marie@example.com', password: 'mauvais mot de passe secret' } });

    const output = lines.join('');
    expect(output.length).toBeGreaterThan(0); // something was logged, so the check below means something
    for (const secret of [secretPassword, 'mauvais mot de passe secret', token]) expect(output).not.toContain(secret);
    await app.close();
    await db.close();
  });
});
