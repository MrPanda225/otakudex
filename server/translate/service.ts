import { createHash } from 'node:crypto';
import type { Lang } from '../../shared/i18n/lang.ts';
import type { Database } from '../db/database.ts';
import { NotFoundError } from '../errors.ts';
import { createLimiter } from '../lib/limiter.ts';
import { TranslationFailure, type TextTranslator } from './providers.ts';

/** The language the texts of Kitsu are written in. */
export const SOURCE_LANG: Lang = 'en';
/** The most that is ever sent to a translation service (NFR-59), and the most kept. */
export const MAX_TRANSLATED_CHARACTERS = 4_000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
/**
 * What may be sent to the service per hour, counted in characters because that is what plans are sold in: in all,
 * and for one account. A free plan lasts a month (500,000 characters at DeepL); one member must not spend it.
 */
export const MAX_CHARACTERS_PER_HOUR = 60_000;
export const MAX_CHARACTERS_PER_ACCOUNT_PER_HOUR = 20_000;
const MAX_CONCURRENT_TRANSLATIONS = 2;

/**
 * `original`: the text as Kitsu wrote it (it is already in the language asked for, or there is none);
 * `translated`: a translation made by the service, kept in the database;
 * `unavailable`: a translation was wanted but cannot be had now (no service set up, or it failed lately).
 */
export interface SynopsisAnswer {
  text: string | null;
  status: 'original' | 'translated' | 'unavailable';
}

interface Row {
  media_id: number;
  /** True when the text came from Kitsu itself: a text someone imported in a file is never sent to the service. */
  from_provider: boolean;
  synopsis: string | null;
  cached: string | null;
  cached_hash: Buffer | null;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest();

export interface TranslationServiceDeps {
  db: Database;
  /** Null when no service is set up: every synopsis then stays in its original language. */
  translator: TextTranslator | null;
  now?: () => number;
  /** Replaceable in tests. */
  maxCharactersPerHour?: number;
  maxCharactersPerAccountPerHour?: number;
}

/** The first `limit` characters (whole ones: an emoji is never cut in half). */
function firstCharacters(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join('');
}

export function createTranslationService({
  db,
  translator,
  now = Date.now,
  maxCharactersPerHour = MAX_CHARACTERS_PER_HOUR,
  maxCharactersPerAccountPerHour = MAX_CHARACTERS_PER_ACCOUNT_PER_HOUR,
}: TranslationServiceDeps) {
  const inFlight = new Map<string, Promise<string | null>>();
  const limit = createLimiter(MAX_CONCURRENT_TRANSLATIONS);
  /** After any failure the service is left alone for a while: a service that is down or out of quota is not hammered. */
  let pausedUntil = 0;
  /** What was sent to the service during the last hour, and for whom. */
  const sent: { at: number; userId: number; characters: number }[] = [];
  /** A text the service refused (not the service itself): left alone for a while, the others go on. */
  const refusedUntil = new Map<string, number>();

  /** Whether this account may have `characters` more sent now; the others' budget is not touched by a refusal. */
  function hasBudget(userId: number, characters: number): boolean {
    while (sent.length > 0 && now() - (sent[0]?.at ?? 0) >= ONE_HOUR_MS) sent.shift();
    const total = sent.reduce((sum, item) => sum + item.characters, 0);
    const own = sent.filter((item) => item.userId === userId).reduce((sum, item) => sum + item.characters, 0);
    return total + characters <= maxCharactersPerHour && own + characters <= maxCharactersPerAccountPerHour;
  }

  async function translateAndKeep(mediaId: number, userId: number, source: string, lang: Lang, key: string): Promise<string | null> {
    if (!translator || now() < pausedUntil || now() < (refusedUntil.get(key) ?? 0)) return null;
    const characters = Array.from(source).length;
    if (!hasBudget(userId, characters)) return null; // over the budget: the original stays, nothing is asked of the service
    sent.push({ at: now(), userId, characters });
    try {
      const translated = (await limit(() => translator.translate(source, SOURCE_LANG, lang))).trim().slice(0, MAX_TRANSLATED_CHARACTERS * 2);
      if (translated === '') throw new Error('empty translation');
      await db.query(
        `INSERT INTO media_translation (media_id, lang, source_hash, synopsis, provider)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (media_id, lang) DO UPDATE SET source_hash = EXCLUDED.source_hash, synopsis = EXCLUDED.synopsis,
           provider = EXCLUDED.provider, created_at = now()`,
        [mediaId, lang, sha256(source), translated, translator.name],
      );
      return translated;
    } catch (error) {
      if (error instanceof TranslationFailure && !error.isServiceProblem) refusedUntil.set(key, now() + RETRY_AFTER_FAILURE_MS);
      else pausedUntil = now() + RETRY_AFTER_FAILURE_MS;
      return null;
    }
  }

  return {
    /** The synopsis of one of this account's entries, in `lang`. Only the entries of the account can be asked for. */
    async synopsis(userId: number, entryId: number, lang: Lang): Promise<SynopsisAnswer> {
      const [row] = await db.query<Row>(
        `SELECT m.id AS media_id, m.synopsis, coalesce(jsonb_typeof(m.raw) = 'object', false) AS from_provider,
                t.synopsis AS cached, t.source_hash AS cached_hash
           FROM library_entry e
           JOIN media m ON m.id = e.media_id
           LEFT JOIN media_translation t ON t.media_id = m.id AND t.lang = $3
          WHERE e.id = $1 AND e.user_id = $2`,
        [entryId, userId, lang],
      );
      if (!row) throw new NotFoundError('library.entryNotFound');
      const original = row.synopsis?.trim() ?? '';
      if (original === '') return { text: null, status: 'original' };
      if (lang === SOURCE_LANG) return { text: original, status: 'original' };

      const source = firstCharacters(original, MAX_TRANSLATED_CHARACTERS);
      const fingerprint = sha256(source);
      if (row.cached !== null && row.cached_hash !== null && fingerprint.equals(row.cached_hash)) return { text: row.cached, status: 'translated' };
      if (!row.from_provider) return { text: original, status: 'unavailable' }; // imported by someone: not worth the service's characters

      // The key holds the fingerprint of the text: a request about another text of the same anime never joins this one.
      const key = `${row.media_id}:${lang}:${fingerprint.toString('hex')}`;
      let pending = inFlight.get(key);
      if (!pending) {
        pending = translateAndKeep(row.media_id, userId, source, lang, key).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      const translated = await pending;
      return translated === null ? { text: original, status: 'unavailable' } : { text: translated, status: 'translated' };
    },
  };
}

export type TranslationService = ReturnType<typeof createTranslationService>;
