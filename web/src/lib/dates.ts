/**
 * Dates as the user writes them, converted to and from the ISO form ('YYYY-MM-DD') the API speaks:
 * jj/mm/aaaa in French, yyyy-mm-dd in English (day-first and month-first readers would misread each other).
 * The native date input follows the browser's language, which is not always the user's; a plain text
 * field with a mask behaves the same everywhere.
 */
import type { Lang } from '../../../shared/i18n/lang.ts';
import type { Problem } from '../i18n/problem.ts';

const FIRST_YEAR = 1950;
const LAST_YEAR = 2100;
const MAX_DIGITS = 8;

export type ParsedDate = { kind: 'empty' } | { kind: 'date'; iso: string } | { kind: 'invalid' };

const pad2 = (value: number) => String(value).padStart(2, '0');

function toIso(year: number, month: number, day: number): string | null {
  if (year < FIRST_YEAR || year > LAST_YEAR) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDay = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDay ? `${year}-${pad2(month)}-${pad2(day)}` : null;
}

/** Accepts 3/10/2026, 03-10-2026, 03.10.2026 and 03102026. A two-digit year is refused: it would be a guess. */
export function parseFrenchDate(text: string): ParsedDate {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  const match = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/.exec(trimmed) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed);
  if (!match) return { kind: 'invalid' };
  const iso = toIso(Number(match[3]), Number(match[2]), Number(match[1]));
  return iso === null ? { kind: 'invalid' } : { kind: 'date', iso };
}

/** '2026-10-03' becomes '03/10/2026'; null becomes an empty string. */
export function isoToFrench(iso: string | null): string {
  if (iso === null) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** Keeps the digits and inserts the slashes: typing 03102026 reads 03/10/2026. */
export function maskFrenchDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Where the caret belongs in `masked` once `digitCount` digits are behind it. */
export function caretAfterDigits(masked: string, digitCount: number): number {
  let seen = 0;
  for (let index = 0; index < masked.length; index += 1) {
    if (seen === digitCount) return index;
    if (/\d/.test(masked.charAt(index))) seen += 1;
  }
  return masked.length;
}

/** Today in the user's own calendar, as ISO. (toISOString would give the UTC day, wrong late in the evening.) */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** The text that goes with an end that comes before the start (or the reverse); null when the pair is fine or one side is missing. */
export function dateOrderProblem(startedOn: string | null, completedOn: string | null, changed: 'startedOn' | 'completedOn', toText: (iso: string) => string): Problem | null {
  if (startedOn === null || completedOn === null || startedOn <= completedOn) return null;
  return changed === 'completedOn'
    ? { key: 'date.beforeStart', params: { date: toText(startedOn) } }
    : { key: 'date.afterEnd', params: { date: toText(completedOn) } };
}

/** English dates are typed year first, so "03/10" can never mean two things. Same forgiving separators as the French ones. */
export function parseEnglishDate(text: string): ParsedDate {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  const match = /^(\d{4})[/.\-\s](\d{1,2})[/.\-\s](\d{1,2})$/.exec(trimmed) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (!match) return { kind: 'invalid' };
  const iso = toIso(Number(match[1]), Number(match[2]), Number(match[3]));
  return iso === null ? { kind: 'invalid' } : { kind: 'date', iso };
}

export function isoToEnglish(iso: string | null): string {
  return iso ?? '';
}

/** Keeps the digits and inserts the dashes: typing 20261003 reads 2026-10-03. */
export function maskEnglishDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** How a date is typed, shown and checked in one language. */
export interface DateInput {
  /** The text for a stored 'YYYY-MM-DD' (or nothing). */
  toText: (iso: string | null) => string;
  parse: (text: string) => ParsedDate;
  /** Shapes the digits while typing. */
  mask: (raw: string) => string;
}

const DATE_INPUTS: Record<Lang, DateInput> = {
  fr: { toText: isoToFrench, parse: parseFrenchDate, mask: maskFrenchDate },
  en: { toText: isoToEnglish, parse: parseEnglishDate, mask: maskEnglishDate },
};

export function dateInputFor(lang: Lang): DateInput {
  return DATE_INPUTS[lang];
}
