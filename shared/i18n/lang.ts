/**
 * Languages the application speaks, and how a language is chosen. Pure and shared: the server uses it to answer an
 * API call in the caller's language, the web client to pick the first language of a new visitor.
 */

export const LANGS = ['fr', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** The owner's language: what anyone gets when nothing says otherwise. */
export const DEFAULT_LANG: Lang = 'fr';

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

interface LanguageRange {
  lang: Lang;
  quality: number;
}

/** "en-US", "fr;q=0.8" → the supported language and its weight, or null for any other language ("*" included). */
function parseRange(range: string): LanguageRange | null {
  const [tag = '', ...parameters] = range.trim().split(';');
  const base = tag.trim().toLowerCase().split('-')[0] ?? '';
  if (!isLang(base)) return null;
  const weight = parameters.map((parameter) => /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(parameter)?.[1]).find((value) => value !== undefined);
  const quality = weight === undefined ? 1 : Number(weight);
  return Number.isFinite(quality) && quality > 0 ? { lang: base, quality } : null;
}

/**
 * The best supported language of an `Accept-Language` value (or of `navigator.languages` joined with commas).
 * The most wanted supported language wins, the first listed on a tie; a value that names none gives French.
 */
export function resolveLang(acceptLanguage: string | null | undefined): Lang {
  const ranges = (acceptLanguage ?? '')
    .split(',')
    .map(parseRange)
    .filter((range): range is LanguageRange => range !== null);
  let best: LanguageRange | undefined;
  for (const range of ranges) if (!best || range.quality > best.quality) best = range;
  return best?.lang ?? DEFAULT_LANG;
}
