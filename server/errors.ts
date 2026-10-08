import type { MessageParams } from '../shared/i18n/format.ts';
import type { Lang } from '../shared/i18n/lang.ts';
import { serverMessage, type ServerMessageKey } from '../shared/i18n/server-messages.ts';

/**
 * Expected failures. Each carries the HTTP status it maps to and the key of a message written for the user, so
 * the route layer never has to guess what to show and can say it in the caller's language. `message` is the French
 * text (logs, tests); `messageIn` gives any other language.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly key: ServerMessageKey;
  readonly params: MessageParams | undefined;

  constructor(key: ServerMessageKey, statusCode: number, params?: MessageParams) {
    super(serverMessage(key, 'fr', params));
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.key = key;
    this.params = params;
  }

  messageIn(lang: Lang): string {
    return serverMessage(this.key, lang, this.params);
  }
}

export class ValidationError extends AppError {
  constructor(key: ServerMessageKey, params?: MessageParams) {
    super(key, 400, params);
  }
}

export class NotFoundError extends AppError {
  constructor(key: ServerMessageKey, params?: MessageParams) {
    super(key, 404, params);
  }
}

export class ConflictError extends AppError {
  constructor(key: ServerMessageKey, params?: MessageParams) {
    super(key, 409, params);
  }
}

export class UpstreamError extends AppError {
  constructor(key: ServerMessageKey, params?: MessageParams) {
    super(key, 502, params);
  }
}

/** Not signed in, or the credentials do not match. The message never says which part was wrong. */
export class AuthenticationError extends AppError {
  constructor(key: ServerMessageKey) {
    super(key, 401);
  }
}

/** Signed in, but this action is not for this account (administration), or a link that is not valid. */
export class ForbiddenError extends AppError {
  constructor(key: ServerMessageKey) {
    super(key, 403);
  }
}

/** Too many failed attempts: the caller must wait `retryAfterSeconds` before trying again. */
export class TooManyAttemptsError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('auth.tooManyAttempts', 429, { wait: formatWait(retryAfterSeconds) });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${Math.ceil(seconds / 60)} min`;
}
