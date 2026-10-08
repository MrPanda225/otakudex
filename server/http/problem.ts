import type { FastifyRequest } from 'fastify';
import type { MessageParams } from '../../shared/i18n/format.ts';
import { resolveLang, type Lang } from '../../shared/i18n/lang.ts';
import { serverMessage, type ServerMessageKey } from '../../shared/i18n/server-messages.ts';

/** The language the caller asked for (the web client sends `Accept-Language` itself); French when it says nothing. */
export function languageOf(request: FastifyRequest): Lang {
  return resolveLang(request.headers['accept-language']);
}

/** The body of a refusal: the sentence in the caller's language, and its key so a client never compares text. */
export function problem(request: FastifyRequest, key: ServerMessageKey, params?: MessageParams): { message: string; code: ServerMessageKey } {
  return { message: serverMessage(key, languageOf(request), params), code: key };
}
