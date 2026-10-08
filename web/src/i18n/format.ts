import type { EntryDto } from '../../../shared/domain.ts';
import type { Lang } from '../../../shared/i18n/lang.ts';
import type { MessageKey } from './catalogue.ts';
import { genreLabel } from './genres.ts';
import type { Translate } from './translate.ts';

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_IN_MS = 86_400_000;

/** The regional flavour used for dates and numbers: day-month-year in both languages, so a date reads the same. */
const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB' };

/** Everything that writes a date, a number, a duration or a label from data, in one language. */
export interface Format {
  lang: Lang;
  number: (value: number) => string;
  /** "45 min", "3 h 20", "2 d 5 h". */
  duration: (totalMinutes: number) => string;
  /** "Series", "Film"…, from Kitsu's own code. */
  subtype: (subtype: string) => string;
  genre: (genre: string) => string;
  /** Long date from 'YYYY-MM-DD', for tooltips. */
  day: (isoDate: string) => string;
  /** "3 oct. 2026", for one-line summaries. */
  shortDate: (isoDate: string) => string;
  /** "3 oct.", without the year. */
  dayAndMonth: (isoDate: string) => string;
  /** "3 octobre": the day and the month written out, for chart tooltips. */
  dayLong: (isoDate: string) => string;
  /** "oct.": the month alone, for axes. */
  monthShort: (isoDate: string) => string;
  /** A number with at most one decimal ("3,5" in French, "3.5" in English). */
  decimal: (value: number) => string;
  /** "reste 3 h 36", or "durée inconnue". */
  remaining: (entry: EntryDto) => string;
  /** "expire demain", "expire dans 3 jours", "expiré": a whole sentence, so it reads well in both languages. */
  expiresIn: (iso: string, now: Date) => string;
  /** Alphabetical order for the language (accents and case are not differences). */
  compare: (a: string, b: string) => number;
  /** "28 ép. de 24 min (11 h 12)", or null when the episode count is unknown. */
  episodesLine: (entry: EntryDto) => string | null;
  /** One line that tells what the closed "Details" zone holds. */
  detailsSummary: (entry: EntryDto) => string;
}

export function createFormat(lang: Lang, t: Translate): Format {
  const locale = LOCALE[lang];
  const numbers = new Intl.NumberFormat(locale);
  const longDay = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dayMonthLong = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const monthOnly = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const oneDecimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  const atMidnight = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

  function duration(totalMinutes: number): string {
    const minutes = Math.max(0, Math.round(totalMinutes));
    if (minutes < MINUTES_PER_HOUR) return t('format.minutes', { count: minutes });
    const totalHours = Math.floor(minutes / MINUTES_PER_HOUR);
    const remainingMinutes = minutes % MINUTES_PER_HOUR;
    if (totalHours < HOURS_PER_DAY) {
      return remainingMinutes === 0
        ? t('format.hours', { hours: totalHours })
        : t('format.hoursMinutes', { hours: totalHours, minutes: String(remainingMinutes).padStart(2, '0') });
    }
    const days = Math.floor(totalHours / HOURS_PER_DAY);
    const hours = totalHours % HOURS_PER_DAY;
    return hours === 0 ? t('format.days', { days }) : t('format.daysHours', { days, hours });
  }

  function expiresIn(iso: string, now: Date): string {
    const msLeft = Date.parse(iso) - now.getTime();
    if (msLeft <= 0) return t('format.expired');
    const hoursLeft = msLeft / 3_600_000;
    if (hoursLeft < HOURS_PER_DAY) return t('format.expiresToday');
    const days = Math.ceil(msLeft / DAYS_IN_MS);
    return days === 1 ? t('format.expiresTomorrow') : t('format.expiresIn', { count: days });
  }

  return {
    lang,
    number: (value) => numbers.format(value),
    duration,
    subtype: (subtype) => {
      const key = SUBTYPE_KEYS[subtype];
      return key ? t(key) : subtype;
    },
    genre: (genre) => genreLabel(lang, genre),
    day: (isoDate) => longDay.format(atMidnight(isoDate)),
    shortDate: (isoDate) => short.format(atMidnight(isoDate)),
    dayAndMonth: (isoDate) => dayMonth.format(atMidnight(isoDate)),
    dayLong: (isoDate) => dayMonthLong.format(atMidnight(isoDate)),
    monthShort: (isoDate) => monthOnly.format(atMidnight(isoDate)),
    decimal: (value) => oneDecimal.format(value),
    remaining: (entry) => {
      const { episodeCount, episodeLengthMin } = entry.media;
      if (episodeCount === null || episodeLengthMin === null) return t('format.durationUnknown');
      return t('format.remaining', { duration: duration(Math.max(0, episodeCount - entry.progress) * episodeLengthMin) });
    },
    expiresIn,
    compare: (a, b) => collator.compare(a, b),
    episodesLine: (entry) => {
      const { episodeCount, episodeLengthMin } = entry.media;
      if (!episodeCount) return null;
      const base = episodeLengthMin ? t('entry.episodesFull', { count: episodeCount, minutes: episodeLengthMin }) : t('entry.episodesCount', { count: episodeCount });
      return episodeLengthMin ? `${base} (${duration(episodeCount * episodeLengthMin)})` : base;
    },
    detailsSummary: (entry) => {
      const parts = [
        entry.startedOn ? t('details.started', { date: short.format(atMidnight(entry.startedOn)) }) : null,
        entry.completedOn ? t('details.completed', { date: short.format(atMidnight(entry.completedOn)) }) : null,
        entry.rewatchCount > 0 ? t('details.rewatches', { count: entry.rewatchCount }) : null,
        entry.note ? t('details.note') : null,
      ].filter((part): part is string => part !== null);
      return parts.length > 0 ? parts.join(' · ') : t('details.empty');
    },
  };
}

const SUBTYPE_KEYS: Record<string, MessageKey> = {
  TV: 'subtype.tv',
  movie: 'subtype.movie',
  OVA: 'subtype.ova',
  ONA: 'subtype.ona',
  special: 'subtype.special',
  music: 'subtype.music',
};
