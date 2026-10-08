import { z } from 'zod';
import type { Lang } from '../../shared/i18n/lang.ts';

/** Something that turns a text from one language into another. Anything else (a model, a script) can stand in for it. */
export interface TextTranslator {
  /** Short name, kept next to each stored translation. */
  readonly name: string;
  translate(text: string, from: Lang, to: Lang): Promise<string>;
}

/**
 * The service refused or could not be reached. The message never holds a key or the text.
 * `isServiceProblem` is false when the service refused this very text (a 4xx about the request): the service is fine
 * and other texts can go on, only this one is left alone for a while.
 */
export class TranslationFailure extends Error {
  readonly isServiceProblem: boolean;

  constructor(message: string, isServiceProblem = true) {
    super(message);
    this.name = 'TranslationFailure';
    this.isServiceProblem = isServiceProblem;
  }
}

/** A bad key (403), a rate limit (429), an exhausted quota (456) or a server error (5xx) concerns every text, not one. */
function isAboutTheService(status: number): boolean {
  return status === 403 || status === 429 || status === 456 || status >= 500;
}

type Fetch = typeof fetch;

const REQUEST_TIMEOUT_MS = 15_000;
const DEEPL_FREE_URL = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PRO_URL = 'https://api.deepl.com/v2/translate';

const deeplAnswer = z.object({ translations: z.array(z.object({ text: z.string() })).min(1) });
const libreAnswer = z.object({ translatedText: z.string() });

async function postJson(fetchImpl: Fetch, url: string, headers: Record<string, string>, body: unknown, service: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error', // a redirect would carry the body (and a key in it) to another address
    });
  } catch {
    throw new TranslationFailure(`${service} is unreachable`);
  }
  if (!response.ok) throw new TranslationFailure(`${service} answered ${response.status}`, isAboutTheService(response.status));
  try {
    return await response.json();
  } catch {
    throw new TranslationFailure(`${service} sent something that is not JSON`);
  }
}

function readAnswer<Shape>(schema: z.ZodType<Shape>, payload: unknown, service: string): Shape {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new TranslationFailure(`${service} sent an unexpected answer`);
  return parsed.data;
}

/**
 * DeepL API (https://developers.deepl.com/api-reference/translate/request-translation). A key that ends with ":fx"
 * is a free-plan key and goes to the free address. English as a target must say which English.
 */
export function createDeepLTranslator(apiKey: string, fetchImpl: Fetch = fetch): TextTranslator {
  const url = apiKey.endsWith(':fx') ? DEEPL_FREE_URL : DEEPL_PRO_URL;
  return {
    name: 'deepl',
    async translate(text, from, to) {
      const payload = await postJson(
        fetchImpl,
        url,
        { Authorization: `DeepL-Auth-Key ${apiKey}` },
        { text: [text], source_lang: from.toUpperCase(), target_lang: to === 'en' ? 'EN-GB' : to.toUpperCase() },
        'DeepL',
      );
      return readAnswer(deeplAnswer, payload, 'DeepL').translations[0]?.text ?? '';
    },
  };
}

/** LibreTranslate (https://docs.libretranslate.com/guides/api_usage/), usually a container on the owner's own machine. */
export function createLibreTranslator(baseUrl: string, apiKey: string | null = null, fetchImpl: Fetch = fetch): TextTranslator {
  const url = `${baseUrl.replace(/\/+$/, '')}/translate`;
  return {
    name: 'libretranslate',
    async translate(text, from, to) {
      const payload = await postJson(fetchImpl, url, {}, { q: text, source: from, target: to, format: 'text', ...(apiKey ? { api_key: apiKey } : {}) }, 'LibreTranslate');
      return readAnswer(libreAnswer, payload, 'LibreTranslate').translatedText;
    },
  };
}

export interface TranslationSettings {
  deeplApiKey: string | null;
  libreTranslateUrl: string | null;
  libreTranslateApiKey: string | null;
}

/** The translator the settings ask for, or null: without one, texts stay in their original language. */
export function createTranslatorFromSettings(settings: TranslationSettings, fetchImpl: Fetch = fetch): TextTranslator | null {
  if (settings.deeplApiKey) return createDeepLTranslator(settings.deeplApiKey, fetchImpl);
  if (settings.libreTranslateUrl) return createLibreTranslator(settings.libreTranslateUrl, settings.libreTranslateApiKey, fetchImpl);
  return null;
}
