import { timingSafeEqual } from 'node:crypto';
import type { AccountUserDto, AuthStateDto, LinkKind, LinkPreviewDto, Role } from '../../shared/domain.ts';
import type { ServerMessageKey } from '../../shared/i18n/server-messages.ts';
import type { Database, Queryable } from '../db/database.ts';
import { isUniqueViolation } from '../db/errors.ts';
import { AuthenticationError, ConflictError, ForbiddenError, TooManyAttemptsError, ValidationError } from '../errors.ts';
import { revokePendingResetLinks } from './links.ts';
import { checkPassword, type PasswordContext, type PasswordHasher } from './password.ts';
import type { LoginThrottle } from './throttle.ts';
import { generateToken, hashToken, isWellFormedToken } from './tokens.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS = 30 * DAY_MS; // NIST SP 800-63B-4, password only: 30 days
const SESSION_IDLE_LIMIT_MS = 7 * DAY_MS;
const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000; // one write an hour at most, not one per request
const MAX_SESSIONS_PER_USER = 10;
const EXPIRED_LINK_RETENTION_MS = 30 * DAY_MS;

export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

/** The name under which wrong creation codes are counted: one counter for the whole server. */
const SETUP_CODE_THROTTLE_KEY = 'setup-code';
const INVALID_LINK_MESSAGE: Record<LinkKind, ServerMessageKey> = {
  invitation: 'auth.invitationInvalid',
  reset: 'auth.resetInvalid',
};

export type AuthUser = AccountUserDto;

export interface AuthServiceDeps {
  db: Database;
  hasher: PasswordHasher;
  throttle: LoginThrottle;
  /** When set, the first account can only be created by someone who knows it (SETUP_CODE). */
  setupCode?: string | null;
  /** The clock, injected so tests can move time. */
  now?: () => Date;
}

/** A person who just signed in, with the secret of their new session (to put in the cookie). */
export interface OpenedSession {
  user: AuthUser;
  token: string;
}

interface UserRow {
  id: number;
  email: string | null;
  display_name: string;
  password_hash: string | null;
  role: Role;
  is_disabled: boolean;
}

interface LinkRow {
  id: number;
  kind: LinkKind;
  label: string | null;
  user_id: number | null;
  creator_name: string;
  account_name: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthUser(row: { id: number; email: string | null; display_name: string; role: Role }): AuthUser {
  return { id: row.id, email: row.email ?? '', displayName: row.display_name, role: row.role };
}

function assertPasswordAccepted(password: string, context: PasswordContext): void {
  const problem = checkPassword(password, context);
  if (problem) throw new ValidationError(problem.key, problem.params);
}

export function createAuthService({ db, hasher, throttle, setupCode = null, now = () => new Date() }: AuthServiceDeps) {
  const iso = (date: Date) => date.toISOString();
  const after = (date: Date, ms: number) => new Date(date.getTime() + ms);

  async function hasAnyAccount(q: Queryable): Promise<boolean> {
    const [accounts] = await q.query<{ count: number }>('SELECT count(*)::int AS count FROM app_user WHERE email IS NOT NULL');
    return (accounts?.count ?? 0) > 0;
  }

  /** Counts the attempt before anything slow happens, so simultaneous guesses each cost one; a success wipes the count. */
  function countAttempt(key: string, at: Date): void {
    const waitSeconds = throttle.waitSeconds(key, at);
    if (waitSeconds > 0) throw new TooManyAttemptsError(waitSeconds);
    throttle.recordFailure(key, at);
  }

  function assertSetupCodeIsRight(given: string | undefined, at: Date): void {
    if (setupCode === null) return;
    countAttempt(SETUP_CODE_THROTTLE_KEY, at);
    // Both sides are hashed first so that the comparison always looks at two values of the same length.
    const isRight = given !== undefined && timingSafeEqual(hashToken(given.trim()), hashToken(setupCode));
    if (!isRight) throw new ForbiddenError('auth.wrongSetupCode');
    throttle.recordSuccess(SETUP_CODE_THROTTLE_KEY);
  }

  async function createSession(q: Queryable, userId: number, at: Date): Promise<string> {
    const token = generateToken();
    await q.query(
      `INSERT INTO app_session (user_id, token_hash, created_at, last_seen_at, expires_at)
       VALUES ($1, $2, $3::timestamptz, $3::timestamptz, $4::timestamptz)`,
      [userId, hashToken(token), iso(at), iso(after(at, SESSION_MAX_AGE_MS))],
    );
    // Keep only the most recent sessions of this person.
    await q.query(
      `DELETE FROM app_session
        WHERE user_id = $1
          AND id NOT IN (SELECT id FROM app_session WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2)`,
      [userId, MAX_SESSIONS_PER_USER],
    );
    return token;
  }

  async function purgeStale(q: Queryable, at: Date): Promise<void> {
    await q.query('DELETE FROM app_session WHERE expires_at <= $1::timestamptz OR last_seen_at <= $2::timestamptz', [
      iso(at),
      iso(after(at, -SESSION_IDLE_LIMIT_MS)),
    ]);
    await q.query('DELETE FROM account_link WHERE expires_at <= $1::timestamptz', [iso(after(at, -EXPIRED_LINK_RETENTION_MS))]);
  }

  async function insertUser(q: Queryable, user: { email: string; displayName: string; passwordHash: string; role: Role }, at: Date): Promise<number> {
    try {
      const [row] = await q.query<{ id: number }>(
        `INSERT INTO app_user (email, display_name, password_hash, role, last_login_at)
         VALUES ($1, $2, $3, $4, $5::timestamptz) RETURNING id`,
        [user.email, user.displayName, user.passwordHash, user.role, iso(at)],
      );
      if (!row) throw new Error('insertUser: the database returned no row');
      return row.id;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('auth.emailTaken');
      throw error;
    }
  }

  /** The usable link for `token`, or null: unknown, wrong kind, used, revoked, expired, or aimed at a closed account. */
  async function findUsableLink(q: Queryable, token: string, kind: LinkKind, at: Date): Promise<LinkRow | null> {
    if (!isWellFormedToken(token)) return null;
    const [row] = await q.query<LinkRow>(
      `SELECT l.id, l.kind, l.label, l.user_id, c.display_name AS creator_name, t.display_name AS account_name
         FROM account_link l
         JOIN app_user c ON c.id = l.created_by
         LEFT JOIN app_user t ON t.id = l.user_id
        WHERE l.token_hash = $1 AND l.kind = $2
          AND l.used_at IS NULL AND l.revoked_at IS NULL AND l.expires_at > $3::timestamptz
          AND (l.kind = 'invitation' OR (t.email IS NOT NULL AND NOT t.is_disabled))`,
      [hashToken(token), kind, iso(at)],
    );
    return row ?? null;
  }

  /** Uses a link up. One conditional UPDATE: of two simultaneous uses, only one finds the link still free. */
  async function consumeLink(tx: Queryable, token: string, kind: LinkKind, at: Date): Promise<{ userId: number | null }> {
    const [row] = await tx.query<{ user_id: number | null }>(
      `UPDATE account_link SET used_at = $3::timestamptz
        WHERE token_hash = $1 AND kind = $2
          AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $3::timestamptz
        RETURNING user_id`,
      [hashToken(token), kind, iso(at)],
    );
    if (!row) throw new ForbiddenError(INVALID_LINK_MESSAGE[kind]);
    return { userId: row.user_id };
  }

  /** Brings a session's "last seen" up to date when it is more than an hour old. */
  async function touchSessionIfStale(sessionId: number, lastSeenAt: string, at: Date): Promise<void> {
    if (at.getTime() - Date.parse(lastSeenAt) <= LAST_SEEN_REFRESH_MS) return;
    await db.query('UPDATE app_session SET last_seen_at = $2::timestamptz WHERE id = $1', [sessionId, iso(at)]);
  }

  async function authenticate(token: string | undefined): Promise<AuthUser | null> {
    if (token === undefined || !isWellFormedToken(token)) return null;
    const at = now();
    const [row] = await db.query<{ session_id: number; last_seen_at: string; id: number; email: string; display_name: string; role: Role }>(
      `SELECT s.id AS session_id, s.last_seen_at, u.id, u.email, u.display_name, u.role
         FROM app_session s
         JOIN app_user u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.expires_at > $2::timestamptz AND s.last_seen_at > $3::timestamptz
          AND u.email IS NOT NULL AND NOT u.is_disabled`,
      [hashToken(token), iso(at), iso(after(at, -SESSION_IDLE_LIMIT_MS))],
    );
    if (!row) return null;
    await touchSessionIfStale(row.session_id, row.last_seen_at, at);
    return toAuthUser(row);
  }

  return {
    authenticate,

    /** Decides which screen comes first. */
    async getState(token: string | undefined): Promise<AuthStateDto> {
      const user = await authenticate(token);
      if (user) return { phase: 'signed-in', user };
      if (await hasAnyAccount(db)) return { phase: 'signed-out' };
      // No account yet: every library entry there is belongs to the unclaimed placeholder.
      const [legacy] = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM library_entry');
      return { phase: 'setup', legacyEntryCount: legacy?.count ?? 0, needsSetupCode: setupCode !== null };
    },

    /** Creates the first account, the administrator. It takes over a library that existed before accounts. */
    async setup(input: { displayName: string; email: string; password: string; setupCode?: string }): Promise<OpenedSession> {
      const email = normalizeEmail(input.email);
      const displayName = input.displayName.trim();
      const at = now();
      // The cheap checks come first: once an account exists, nobody makes this server hash a password for nothing.
      if (await hasAnyAccount(db)) throw new ConflictError('auth.accountExists');
      assertSetupCodeIsRight(input.setupCode, at);
      assertPasswordAccepted(input.password, { email, displayName });
      const passwordHash = await hasher.hash(input.password); // slow: done before the transaction, not inside it

      return db.transaction(async (tx) => {
        // Two first-launch requests at once must not both create an administrator.
        await tx.exec('LOCK TABLE app_user IN SHARE ROW EXCLUSIVE MODE');
        if (await hasAnyAccount(tx)) throw new ConflictError('auth.accountExists');

        const [claimed] = await tx.query<{ id: number }>(
          `UPDATE app_user SET email = $1, display_name = $2, password_hash = $3, last_login_at = $4::timestamptz
            WHERE email IS NULL RETURNING id`,
          [email, displayName, passwordHash, iso(at)],
        );
        const userId = claimed?.id ?? (await insertUser(tx, { email, displayName, passwordHash, role: 'admin' }, at));
        const token = await createSession(tx, userId, at);
        return { user: { id: userId, email, displayName, role: 'admin' }, token };
      });
    },

    async login(input: { email: string; password: string }): Promise<OpenedSession> {
      const email = normalizeEmail(input.email);
      const at = now();
      countAttempt(email, at); // before the first await: forty simultaneous guesses must not all get through

      const [row] = await db.query<UserRow>(
        'SELECT id, email, display_name, password_hash, role, is_disabled FROM app_user WHERE email = $1',
        [email],
      );
      const storedHash = row?.password_hash ?? null;
      const canSignIn = row !== undefined && storedHash !== null && !row.is_disabled;
      // Same work whether or not the account exists, so the response time does not tell.
      let isPasswordRight = false;
      if (canSignIn) isPasswordRight = await hasher.verify(input.password, storedHash);
      else await hasher.verifyAgainstNothing(input.password);

      if (!canSignIn || !isPasswordRight) throw new AuthenticationError('auth.loginFailed');
      throttle.recordSuccess(email);
      const newHash = hasher.needsRehash(storedHash) ? await hasher.hash(input.password) : null;

      const token = await db.transaction(async (tx) => {
        await purgeStale(tx, at);
        await tx.query('UPDATE app_user SET last_login_at = $2::timestamptz, password_hash = coalesce($3, password_hash) WHERE id = $1', [
          row.id,
          iso(at),
          newHash,
        ]);
        return createSession(tx, row.id, at); // always a new secret: one is never reused across a sign-in
      });
      return { user: toAuthUser(row), token };
    },

    /** Closes the session of this cookie. Quietly does nothing when there is none. */
    async logout(token: string | undefined): Promise<void> {
      if (token === undefined || !isWellFormedToken(token)) return;
      await db.query('DELETE FROM app_session WHERE token_hash = $1', [hashToken(token)]);
    },

    /** Changes the password, closes every session of the account, and opens a fresh one for this browser. */
    async changePassword(userId: number, input: { currentPassword: string; newPassword: string }): Promise<OpenedSession> {
      const [row] = await db.query<UserRow>('SELECT id, email, display_name, password_hash, role, is_disabled FROM app_user WHERE id = $1', [userId]);
      if (!row || row.email === null || row.password_hash === null) throw new AuthenticationError('auth.loginRequired');

      const at = now();
      countAttempt(row.email, at);
      if (!(await hasher.verify(input.currentPassword, row.password_hash))) {
        throw new ValidationError('auth.currentPasswordWrong');
      }
      throttle.recordSuccess(row.email);
      assertPasswordAccepted(input.newPassword, { email: row.email, displayName: row.display_name });
      const passwordHash = await hasher.hash(input.newPassword);

      const token = await db.transaction(async (tx) => {
        await tx.query('UPDATE app_user SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
        await tx.query('DELETE FROM app_session WHERE user_id = $1', [userId]);
        await revokePendingResetLinks(tx, userId, at);
        return createSession(tx, userId, at);
      });
      return { user: toAuthUser(row), token };
    },

    /** What a link says about itself. Unusable links all answer the same. */
    async previewLink(token: string, kind: LinkKind): Promise<LinkPreviewDto> {
      const link = await findUsableLink(db, token, kind, now());
      if (!link) throw new ForbiddenError(INVALID_LINK_MESSAGE[kind]);
      return {
        kind,
        inviterName: kind === 'invitation' ? link.creator_name : null,
        label: link.label,
        accountName: link.account_name,
      };
    },

    /** Creates a member account from an invitation. A refused password or taken e-mail leaves the invitation unused. */
    async join(input: { token: string; displayName: string; email: string; password: string }): Promise<OpenedSession> {
      const email = normalizeEmail(input.email);
      const displayName = input.displayName.trim();
      if (!(await findUsableLink(db, input.token, 'invitation', now()))) throw new ForbiddenError(INVALID_LINK_MESSAGE.invitation);
      assertPasswordAccepted(input.password, { email, displayName });
      const passwordHash = await hasher.hash(input.password);
      const at = now();

      return db.transaction(async (tx) => {
        await consumeLink(tx, input.token, 'invitation', at);
        const userId = await insertUser(tx, { email, displayName, passwordHash, role: 'member' }, at);
        const token = await createSession(tx, userId, at);
        return { user: { id: userId, email, displayName, role: 'member' }, token };
      });
    },

    /** Sets a new password from a reset link, closes the account's other sessions, and signs the person in. */
    async resetPassword(input: { token: string; password: string }): Promise<OpenedSession> {
      const link = await findUsableLink(db, input.token, 'reset', now());
      if (!link || link.user_id === null) throw new ForbiddenError(INVALID_LINK_MESSAGE.reset);
      const [account] = await db.query<UserRow>('SELECT id, email, display_name, password_hash, role, is_disabled FROM app_user WHERE id = $1', [link.user_id]);
      if (!account || account.email === null) throw new ForbiddenError(INVALID_LINK_MESSAGE.reset);
      assertPasswordAccepted(input.password, { email: account.email, displayName: account.display_name });
      const passwordHash = await hasher.hash(input.password);
      const at = now();

      const token = await db.transaction(async (tx) => {
        await consumeLink(tx, input.token, 'reset', at);
        await tx.query('UPDATE app_user SET password_hash = $2, last_login_at = $3::timestamptz WHERE id = $1', [account.id, passwordHash, iso(at)]);
        await tx.query('DELETE FROM app_session WHERE user_id = $1', [account.id]);
        await revokePendingResetLinks(tx, account.id, at); // any other link issued for this account dies with this one
        return createSession(tx, account.id, at);
      });
      throttle.recordSuccess(account.email);
      return { user: toAuthUser(account), token };
    },

    /** Deletes sessions and links that are past their time. Called at startup; sign-ins do it too. */
    purgeStale: () => purgeStale(db, now()),
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
