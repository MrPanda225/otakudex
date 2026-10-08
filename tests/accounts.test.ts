import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../server/auth/tokens.ts';
import { createRequestRateLimiter } from '../server/auth/throttle.ts';
import type { Database } from '../server/db/database.ts';
import type { AuthStateDto, InvitationDto, IssuedLinkDto, MemberDto } from '../shared/domain.ts';
import {
  createTestApp,
  createTestClock,
  createTestDatabase,
  createTestServices,
  inviteAndJoin,
  makeSnapshot,
  sessionCookieOf,
  signIn,
  signUpFirstAccount,
  TEST_PASSWORD,
  type TestClock,
  type TestSession,
} from './helpers.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NEW_PASSWORD = 'un autre mot de passe tout neuf';

describe('accounts over http', () => {
  let db: Database;
  let app: FastifyInstance;
  let clock: TestClock;
  let admin: TestSession;
  const frieren = makeSnapshot({ title: 'Frieren', episodeCount: 12 });

  const post = (url: string, payload: object, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url, payload, headers });
  const as = (session: TestSession) => ({ cookie: session.cookie });

  beforeEach(async () => {
    db = await createTestDatabase();
    clock = createTestClock();
    app = await createTestApp(createTestServices(db, [frieren], clock), ['localhost'], { now: clock.now });
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  async function state(cookie?: string): Promise<AuthStateDto> {
    const response = await app.inject({ method: 'GET', url: '/api/auth/state', ...(cookie ? { headers: { cookie } } : {}) });
    return response.json<AuthStateDto>();
  }

  describe('first launch', () => {
    it('asks for the first account while there is none, then only for a sign-in', async () => {
      expect(await state()).toEqual({ phase: 'setup', legacyEntryCount: 0, needsSetupCode: false });
      admin = await signUpFirstAccount(app);
      expect(await state()).toEqual({ phase: 'signed-out' });
      expect(await state(admin.cookie)).toEqual({ phase: 'signed-in', user: { id: admin.user.id, email: 'admin@example.com', displayName: 'Admin', role: 'admin' } });
    });

    it('opens a session for the administrator, with a cookie scripts cannot read', async () => {
      const response = await post('/api/auth/setup', { displayName: ' Marie ', email: ' Marie@Example.COM ', password: TEST_PASSWORD });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ user: expect.objectContaining({ email: 'marie@example.com', displayName: 'Marie', role: 'admin' }) });
      const setCookie = String(response.headers['set-cookie']);
      expect(setCookie).toMatch(/^otakudex_session=[A-Za-z0-9_-]{43};/);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).toContain('Max-Age=2592000'); // 30 days
      expect(setCookie).not.toContain('Secure'); // plain HTTP in development
    });

    it('refuses a second first account', async () => {
      await signUpFirstAccount(app);
      const again = await post('/api/auth/setup', { displayName: 'Intruder', email: 'intruder@example.com', password: TEST_PASSWORD });
      expect(again.statusCode).toBe(409);
    });

    it('refuses a weak password with the reason, and creates nothing', async () => {
      const short = await post('/api/auth/setup', { displayName: 'Marie', email: 'marie@example.com', password: 'court' });
      expect(short.statusCode).toBe(400);
      expect(short.json()).toEqual({ message: '15 caractères minimum (tu en as 5).', code: 'password.tooShort' });
      const common = await post('/api/auth/setup', { displayName: 'Marie', email: 'marie@example.com', password: 'qwertyuiopasdfgh' });
      expect(common.json().code).toBe('password.tooGuessable');
      expect(await state()).toMatchObject({ phase: 'setup' });
    });

    it('refuses an unreadable e-mail and unknown fields', async () => {
      expect((await post('/api/auth/setup', { displayName: 'Marie', email: 'not-an-email', password: TEST_PASSWORD })).statusCode).toBe(400);
      expect((await post('/api/auth/setup', { displayName: 'Marie', email: 'marie@example.com', password: TEST_PASSWORD, role: 'admin' })).statusCode).toBe(400);
    });

    it('stores a hash of the password and of the session secret, never the secrets', async () => {
      const response = await post('/api/auth/setup', { displayName: 'Marie', email: 'marie@example.com', password: TEST_PASSWORD });
      const token = sessionCookieOf(response).split('=')[1]!;
      const [user] = await db.query<{ password_hash: string }>('SELECT password_hash FROM app_user');
      expect(user?.password_hash.startsWith('scrypt$')).toBe(true);
      expect(user?.password_hash).not.toContain(TEST_PASSWORD);
      const [session] = await db.query<{ token_hash: Uint8Array }>('SELECT token_hash FROM app_session');
      expect(Buffer.from(session!.token_hash).equals(hashToken(token))).toBe(true);
      expect(Buffer.from(session!.token_hash).toString('base64url')).not.toBe(token);
    });
  });

  describe('signing in and out', () => {
    beforeEach(async () => {
      admin = await signUpFirstAccount(app);
    });

    it('signs in with the e-mail written in any case', async () => {
      const response = await post('/api/auth/login', { email: ' ADMIN@example.com ', password: TEST_PASSWORD });
      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({ email: 'admin@example.com', role: 'admin' });
    });

    it('gives the same answer for a wrong password, an unknown e-mail and a closed account', async () => {
      const member = await inviteAndJoin(app, admin, { displayName: 'Camille', email: 'camille@example.com' });
      await app.inject({ method: 'PATCH', url: `/api/admin/members/${member.user.id}`, headers: as(admin), payload: { isDisabled: true } });

      const wrongPassword = await post('/api/auth/login', { email: 'admin@example.com', password: 'mauvais mot de passe du tout' });
      const unknown = await post('/api/auth/login', { email: 'nobody@example.com', password: TEST_PASSWORD });
      const closed = await post('/api/auth/login', { email: 'camille@example.com', password: TEST_PASSWORD });
      for (const response of [wrongPassword, unknown, closed]) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: 'E-mail ou mot de passe incorrect.', code: 'auth.loginFailed' });
        expect(response.headers['set-cookie']).toBeUndefined();
      }
    });

    it('slows guessing down per e-mail, known or not, and says how long to wait', async () => {
      for (const email of ['admin@example.com', 'ghost@example.com']) {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          expect((await post('/api/auth/login', { email, password: 'mauvais mot de passe du tout' })).statusCode).toBe(401);
        }
        const blocked = await post('/api/auth/login', { email, password: TEST_PASSWORD });
        expect(blocked.statusCode, email).toBe(429);
        expect(blocked.headers['retry-after']).toBe('1');
        expect(blocked.json()).toMatchObject({ message: 'Trop d’essais. Réessaie dans 1 s.', retryAfterSeconds: 1 });
      }
      clock.advance(1_500);
      const free = await post('/api/auth/login', { email: 'admin@example.com', password: TEST_PASSWORD });
      expect(free.statusCode).toBe(200);
      // and the count starts over after a success
      for (let attempt = 1; attempt <= 5; attempt += 1) await post('/api/auth/login', { email: 'admin@example.com', password: 'mauvais mot de passe du tout' });
      expect((await post('/api/auth/login', { email: 'admin@example.com', password: TEST_PASSWORD })).statusCode).toBe(429);
    });

    it('closes the session on sign-out, and is fine with no session at all', async () => {
      const out = await post('/api/auth/logout', {}, as(admin));
      expect(out.statusCode).toBe(204);
      expect(String(out.headers['set-cookie'])).toMatch(/otakudex_session=;/);
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(admin) })).statusCode).toBe(401);
      expect((await post('/api/auth/logout', {})).statusCode).toBe(204);
    });

    it('gives each sign-in a new session secret and keeps the other sessions alive', async () => {
      const second = await signIn(app, 'admin@example.com');
      expect(second.cookie).not.toBe(admin.cookie);
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(admin) })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(second) })).statusCode).toBe(200);
    });

    it('keeps only the ten latest sessions of a person', async () => {
      const sessions: TestSession[] = [admin];
      for (let index = 0; index < 10; index += 1) {
        clock.advance(1_000);
        sessions.push(await signIn(app, 'admin@example.com'));
      }
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(sessions[0]!) })).statusCode).toBe(401); // the oldest left
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(sessions[10]!) })).statusCode).toBe(200);
    });

    it('ends a session after 7 days without a visit, but not one that keeps being used', async () => {
      clock.advance(6 * DAY_MS);
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(admin) })).statusCode).toBe(200);
      clock.advance(6 * DAY_MS); // 12 days in, 6 since the last visit
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(admin) })).statusCode).toBe(200);
      clock.advance(8 * DAY_MS); // 8 days of silence
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(admin) })).statusCode).toBe(401);
    });

    it('never lets a session outlive 30 days, however regularly it is used', async () => {
      const visit = async () => (await app.inject({ method: 'GET', url: '/api/library', headers: as(admin) })).statusCode;
      for (let visits = 1; visits <= 4; visits += 1) {
        clock.advance(6 * DAY_MS); // day 6, 12, 18, 24: never idle for 7 days
        expect(await visit()).toBe(200);
      }
      clock.advance(5 * DAY_MS); // day 29: still inside the 30 days
      expect(await visit()).toBe(200);
      clock.advance(2 * DAY_MS); // day 31: used two days ago, but the session is now older than 30 days
      expect(await visit()).toBe(401);
    });
  });

  describe('changing the password', () => {
    beforeEach(async () => {
      admin = await signUpFirstAccount(app);
    });

    it('needs the current password, and refuses a weak new one', async () => {
      const wrong = await post('/api/auth/password', { currentPassword: 'ce nest pas le bon', newPassword: NEW_PASSWORD }, as(admin));
      expect(wrong.statusCode).toBe(400); // not 401: the interface must not take it for an expired session
      expect(wrong.json()).toEqual({ message: 'Mot de passe actuel incorrect.', code: 'auth.currentPasswordWrong' });
      const weak = await post('/api/auth/password', { currentPassword: TEST_PASSWORD, newPassword: 'trop court' }, as(admin));
      expect(weak.statusCode).toBe(400);
      expect(weak.json().code).toBe('password.tooShort');
    });

    it('switches the password, closes every other session and hands this browser a new one', async () => {
      const other = await signIn(app, 'admin@example.com');
      const changed = await post('/api/auth/password', { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }, as(admin));
      expect(changed.statusCode).toBe(200);
      const fresh = sessionCookieOf(changed);
      expect(fresh).not.toBe(admin.cookie);

      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(other) })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(admin) })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: { cookie: fresh } })).statusCode).toBe(200);
      expect((await post('/api/auth/login', { email: 'admin@example.com', password: TEST_PASSWORD })).statusCode).toBe(401);
      expect((await post('/api/auth/login', { email: 'admin@example.com', password: NEW_PASSWORD })).statusCode).toBe(200);
    });
  });

  describe('invitations', () => {
    beforeEach(async () => {
      admin = await signUpFirstAccount(app);
    });

    async function invite(label: string | null = 'Camille'): Promise<IssuedLinkDto> {
      const response = await app.inject({ method: 'POST', url: '/api/admin/invitations', headers: as(admin), payload: label === null ? {} : { label } });
      expect(response.statusCode).toBe(201);
      return response.json<IssuedLinkDto>();
    }
    const join = (token: string, details: Partial<{ displayName: string; email: string; password: string }> = {}) =>
      post('/api/auth/join', { token, displayName: 'Camille', email: 'camille@example.com', password: TEST_PASSWORD, ...details });
    const invitations = async () => (await app.inject({ method: 'GET', url: '/api/admin/invitations', headers: as(admin) })).json<InvitationDto[]>();

    it('issues a 256-bit secret once and lists the invitation as waiting for 7 days', async () => {
      const link = await invite('Camille');
      expect(link.token).toHaveLength(43);
      expect(Date.parse(link.expiresAt) - clock.now().getTime()).toBe(7 * DAY_MS);
      expect(await invitations()).toEqual([expect.objectContaining({ label: 'Camille', state: 'pending' })]);
      expect(JSON.stringify(await invitations())).not.toContain(link.token); // the list never shows the secret
      const [row] = await db.query<{ token_hash: Uint8Array }>('SELECT token_hash FROM account_link');
      expect(Buffer.from(row!.token_hash).equals(hashToken(link.token))).toBe(true);
    });

    it('shows who invited, before anyone signs up', async () => {
      const { token } = await invite('Camille');
      const preview = await post('/api/auth/link/check', { token, kind: 'invitation' });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toEqual({ kind: 'invitation', inviterName: 'Admin', label: 'Camille', accountName: null });
    });

    it('creates a member who has an empty library of their own', async () => {
      const { token } = await invite();
      const joined = await join(token);
      expect(joined.statusCode).toBe(201);
      expect(joined.json().user).toMatchObject({ email: 'camille@example.com', displayName: 'Camille', role: 'member' });
      const cookie = sessionCookieOf(joined);
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: { cookie } })).json()).toEqual([]);
      expect((await invitations())[0]?.state).toBe('used');
    });

    it('works once only: a second use finds the same message as any other bad link', async () => {
      const { token } = await invite();
      expect((await join(token)).statusCode).toBe(201);
      const again = await join(token, { email: 'second@example.com' });
      expect(again.statusCode).toBe(403);
      expect(again.json()).toEqual({ message: 'Cette invitation n’est plus valable. Demande un nouveau lien à la personne qui t’a invité.', code: 'auth.invitationInvalid' });
      const unknown = await join('x'.repeat(43), { email: 'third@example.com' });
      expect(unknown.statusCode).toBe(403);
      expect(unknown.json()).toEqual(again.json());
      const garbage = await join('nope', { email: 'fourth@example.com' });
      expect(garbage.json()).toEqual(again.json());
    });

    it('lets only one of two simultaneous uses win', async () => {
      const { token } = await invite();
      const [first, second] = await Promise.all([join(token, { email: 'one@example.com' }), join(token, { email: 'two@example.com' })]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([201, 403]);
    });

    it('stops working after 7 days', async () => {
      const { token } = await invite();
      clock.advance(7 * DAY_MS + 1_000);
      expect((await join(token)).statusCode).toBe(403);
      expect((await post('/api/auth/link/check', { token, kind: 'invitation' })).statusCode).toBe(403);
      admin = await signIn(app, 'admin@example.com'); // the administrator's own session idled out meanwhile
      expect((await invitations())[0]?.state).toBe('expired');
    });

    it('can be revoked while it waits, and not afterwards', async () => {
      const { token } = await invite();
      const [pending] = await invitations();
      expect((await app.inject({ method: 'DELETE', url: `/api/admin/invitations/${pending!.id}`, headers: as(admin) })).statusCode).toBe(204);
      expect((await join(token)).statusCode).toBe(403);
      expect((await invitations())[0]?.state).toBe('revoked');
      expect((await app.inject({ method: 'DELETE', url: `/api/admin/invitations/${pending!.id}`, headers: as(admin) })).statusCode).toBe(404);
    });

    it('is not burnt by a refused password or an e-mail that already has an account', async () => {
      const { token } = await invite();
      const weak = await join(token, { password: 'court' });
      expect(weak.statusCode).toBe(400);
      const taken = await join(token, { email: 'admin@example.com' });
      expect(taken.statusCode).toBe(409);
      expect(taken.json()).toEqual({ message: 'Cet e-mail a déjà un compte. Connecte-toi.', code: 'auth.emailTaken' });
      expect((await join(token)).statusCode).toBe(201); // still usable
    });

    it('lets members sign in like anyone, and leaves invitations to the administrator', async () => {
      const camille = await inviteAndJoin(app, admin, { displayName: 'Camille', email: 'camille@example.com' });
      expect((await signIn(app, 'camille@example.com')).user.role).toBe('member');
      const attempt = await app.inject({ method: 'POST', url: '/api/admin/invitations', headers: as(camille), payload: { label: 'Intrus' } });
      expect(attempt.statusCode).toBe(403);
    });
  });

  describe('reset links', () => {
    let camille: TestSession;

    beforeEach(async () => {
      admin = await signUpFirstAccount(app);
      camille = await inviteAndJoin(app, admin, { displayName: 'Camille', email: 'camille@example.com' });
    });

    async function issueResetLink(): Promise<IssuedLinkDto> {
      const response = await app.inject({ method: 'POST', url: `/api/admin/members/${camille.user.id}/reset-link`, headers: as(admin) });
      expect(response.statusCode).toBe(201);
      return response.json<IssuedLinkDto>();
    }

    it('says whose password it changes, and lasts a day', async () => {
      const link = await issueResetLink();
      expect(Date.parse(link.expiresAt) - clock.now().getTime()).toBe(DAY_MS);
      const preview = await post('/api/auth/link/check', { token: link.token, kind: 'reset' });
      expect(preview.json()).toMatchObject({ kind: 'reset', accountName: 'Camille', inviterName: null });
      // an invitation link is not a reset link, and the other way round
      expect((await post('/api/auth/link/check', { token: link.token, kind: 'invitation' })).statusCode).toBe(403);
    });

    it('sets a new password, closes the old sessions, signs the person in, and works once', async () => {
      const link = await issueResetLink();
      const weak = await post('/api/auth/reset', { token: link.token, password: 'court' });
      expect(weak.statusCode).toBe(400);

      const reset = await post('/api/auth/reset', { token: link.token, password: NEW_PASSWORD });
      expect(reset.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(camille) })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: { cookie: sessionCookieOf(reset) } })).statusCode).toBe(200);
      expect((await post('/api/auth/login', { email: 'camille@example.com', password: TEST_PASSWORD })).statusCode).toBe(401);
      expect((await post('/api/auth/login', { email: 'camille@example.com', password: NEW_PASSWORD })).statusCode).toBe(200);

      const again = await post('/api/auth/reset', { token: link.token, password: 'encore un autre mot de passe' });
      expect(again.statusCode).toBe(403);
      expect(again.json()).toEqual({ message: 'Ce lien n’est plus valable. Demande-en un nouveau à l’administrateur.', code: 'auth.resetInvalid' });
    });

    it('stops working after a day, and for a closed account', async () => {
      const expired = await issueResetLink();
      clock.advance(DAY_MS + 1_000);
      expect((await post('/api/auth/reset', { token: expired.token, password: NEW_PASSWORD })).statusCode).toBe(403);

      const forClosed = await issueResetLink();
      await app.inject({ method: 'PATCH', url: `/api/admin/members/${camille.user.id}`, headers: as(admin), payload: { isDisabled: true } });
      expect((await post('/api/auth/reset', { token: forClosed.token, password: NEW_PASSWORD })).statusCode).toBe(403);
    });

    it('can be issued by the command line for the administrator too', async () => {
      const issued = await createTestServices(db, [], clock).admin.createResetLinkByEmail(' Admin@Example.com ');
      const reset = await post('/api/auth/reset', { token: issued.token, password: NEW_PASSWORD });
      expect(reset.statusCode).toBe(200);
      expect(reset.json().user).toMatchObject({ email: 'admin@example.com', role: 'admin' });
      await expect(createTestServices(db).admin.createResetLinkByEmail('nobody@example.com')).rejects.toThrow(/Aucun compte/);
    });
  });

  describe('administration', () => {
    let camille: TestSession;

    beforeEach(async () => {
      admin = await signUpFirstAccount(app);
      camille = await inviteAndJoin(app, admin, { displayName: 'Camille', email: 'camille@example.com' });
    });

    it('lists accounts without anything from their libraries', async () => {
      await app.inject({ method: 'POST', url: '/api/library', headers: as(camille), payload: { kitsuId: frieren.kitsuId, status: 'watching' } });
      const members = (await app.inject({ method: 'GET', url: '/api/admin/members', headers: as(admin) })).json<MemberDto[]>();
      expect(members.map((member) => member.displayName)).toEqual(['Admin', 'Camille']);
      for (const member of members) {
        expect(Object.keys(member).sort()).toEqual(['createdAt', 'displayName', 'email', 'id', 'isDisabled', 'lastLoginAt', 'role']);
      }
      expect(JSON.stringify(members)).not.toContain('Frieren');
    });

    it('closes a member: sessions end, sign-in is refused, the library stays', async () => {
      await app.inject({ method: 'POST', url: '/api/library', headers: as(camille), payload: { kitsuId: frieren.kitsuId, status: 'watching' } });
      const closed = await app.inject({ method: 'PATCH', url: `/api/admin/members/${camille.user.id}`, headers: as(admin), payload: { isDisabled: true } });
      expect(closed.json()).toMatchObject({ isDisabled: true });
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(camille) })).statusCode).toBe(401);
      expect((await post('/api/auth/login', { email: 'camille@example.com', password: TEST_PASSWORD })).statusCode).toBe(401);
      expect(await db.query('SELECT 1 FROM library_entry')).toHaveLength(1);

      await app.inject({ method: 'PATCH', url: `/api/admin/members/${camille.user.id}`, headers: as(admin), payload: { isDisabled: false } });
      const back = await signIn(app, 'camille@example.com');
      expect((await app.inject({ method: 'GET', url: '/api/library', headers: as(back) })).json()).toHaveLength(1);
    });

    it('never closes the administrator, and answers 404 for an account that does not exist', async () => {
      const self = await app.inject({ method: 'PATCH', url: `/api/admin/members/${admin.user.id}`, headers: as(admin), payload: { isDisabled: true } });
      expect(self.statusCode).toBe(400);
      expect((await app.inject({ method: 'PATCH', url: '/api/admin/members/9999', headers: as(admin), payload: { isDisabled: true } })).statusCode).toBe(404);
    });

    it('keeps every administration route for the administrator', async () => {
      const routes = [
        { method: 'GET', url: '/api/admin/members' },
        { method: 'PATCH', url: `/api/admin/members/${admin.user.id}`, payload: { isDisabled: true } },
        { method: 'POST', url: `/api/admin/members/${admin.user.id}/reset-link` },
        { method: 'GET', url: '/api/admin/invitations' },
        { method: 'POST', url: '/api/admin/invitations', payload: {} },
        { method: 'DELETE', url: '/api/admin/invitations/1' },
      ] as const;
      for (const route of routes) {
        const response = await app.inject({ ...route, headers: as(camille) });
        expect(response.statusCode, `${route.method} ${route.url}`).toBe(403);
      }
    });
  });

  describe('the cookie in HTTPS mode', () => {
    it('carries Secure and the __Host- prefix, and the plain name is no longer read', async () => {
      const secureApp = await createTestApp(createTestServices(db, [], clock), ['localhost'], { isCookieSecure: true, now: clock.now });
      const response = await secureApp.inject({ method: 'POST', url: '/api/auth/setup', payload: { displayName: 'Marie', email: 'marie@example.com', password: TEST_PASSWORD } });
      const setCookie = String(response.headers['set-cookie']);
      expect(setCookie).toMatch(/^__Host-otakudex_session=/);
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).not.toContain('Domain');

      const token = sessionCookieOf(response).split('=')[1]!;
      const withPrefix = await secureApp.inject({ method: 'GET', url: '/api/library', headers: { cookie: `__Host-otakudex_session=${token}` } });
      const withoutPrefix = await secureApp.inject({ method: 'GET', url: '/api/library', headers: { cookie: `otakudex_session=${token}` } });
      expect(withPrefix.statusCode).toBe(200);
      expect(withoutPrefix.statusCode).toBe(401);
      await secureApp.close();
    });
  });

  describe('flooding', () => {
    it('answers 429 once an address makes too many access requests, and leaves reads alone', async () => {
      const limited = await createTestApp(createTestServices(db, [], clock), ['localhost'], {
        rateLimiter: createRequestRateLimiter({ limit: 3, windowMs: 60_000 }),
        now: clock.now,
      });
      const attempt = () => limited.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@example.com', password: 'whatever whatever' } });
      expect([(await attempt()).statusCode, (await attempt()).statusCode, (await attempt()).statusCode]).toEqual([401, 401, 401]);
      const refused = await attempt();
      expect(refused.statusCode).toBe(429);
      expect(refused.headers['retry-after']).toBe('600');
      expect((await limited.inject({ method: 'GET', url: '/api/auth/state' })).statusCode).toBe(200);
      await limited.close();
    });
  });
});
