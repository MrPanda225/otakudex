import type { EntryDto, Status } from '../../../shared/domain.ts';

export type SortKey = 'relevance' | 'title' | 'rank' | 'added';
export type StatusFilter = Status | 'all';

export interface DexFilters {
  status: StatusFilter;
  genre: string;
  query: string;
  sort: SortKey;
}

export const SORT_KEYS: readonly SortKey[] = ['relevance', 'title', 'rank', 'added'];

/** What is on the go comes first; finished and dropped titles sink. */
const STATUS_PRIORITY: Record<Status, number> = { watching: 0, planned: 1, paused: 2, completed: 3, dropped: 4 };

/** Lower-case text without accents, so "eclair" finds "Éclair". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function matchesQuery(entry: EntryDto, query: string): boolean {
  const needle = normalizeText(query);
  if (needle === '') return true;
  const { title, titleEn, titleJa } = entry.media;
  return [title, titleEn, titleJa].some((candidate) => candidate !== null && normalizeText(candidate).includes(needle));
}

/** The genres of the library, as Kitsu names them; the page orders them by how they read in its language. */
export function allGenres(entries: readonly EntryDto[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.media.genres))];
}

export function countByStatus(entries: readonly EntryDto[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: entries.length, planned: 0, watching: 0, completed: 0, paused: 0, dropped: 0 };
  for (const entry of entries) counts[entry.status] += 1;
  return counts;
}

/** Newest activity first; entries without activity fall back to their creation date. */
function compareRecent(a: EntryDto, b: EntryDto): number {
  return (b.lastActivityAt ?? b.createdAt).localeCompare(a.lastActivityAt ?? a.createdAt);
}

/** Titles are mostly romaji or English: the same order whatever the language of the screen. */
const TITLE_ORDER = new Intl.Collator('en', { sensitivity: 'base' });

const COMPARATORS: Record<SortKey, (a: EntryDto, b: EntryDto) => number> = {
  relevance: (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || compareRecent(a, b),
  title: (a, b) => TITLE_ORDER.compare(a.media.title, b.media.title),
  rank: (a, b) =>
    (a.rankPosition ?? Number.MAX_SAFE_INTEGER) - (b.rankPosition ?? Number.MAX_SAFE_INTEGER) ||
    TITLE_ORDER.compare(a.media.title, b.media.title),
  added: (a, b) => b.createdAt.localeCompare(a.createdAt),
};

/** Applies the filters and the sort, returning a new array. */
export function selectEntries(entries: readonly EntryDto[], filters: DexFilters): EntryDto[] {
  return entries
    .filter((entry) => filters.status === 'all' || entry.status === filters.status)
    .filter((entry) => filters.genre === '' || entry.media.genres.includes(filters.genre))
    .filter((entry) => matchesQuery(entry, filters.query))
    .sort(COMPARATORS[filters.sort]);
}
