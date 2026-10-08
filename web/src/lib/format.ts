import type { EntryDto } from '../../../shared/domain.ts';
import type { Lang } from '../../../shared/i18n/lang.ts';
import { statusLabel } from '../../../shared/labels.ts';

/** Route of the same-origin image proxy, or null when there is no poster to show. */
export function posterSrc(url: string | null): string | null {
  return url ? `/api/poster?url=${encodeURIComponent(url)}` : null;
}

/** Up to two capital letters, used when an anime has no poster. */
export function monogram(title: string): string {
  const letters = title
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase());
  return letters.join('') || '?';
}

/**
 * What the badges on a cover say. The cover opens the entry under a name that must contain this text
 * (WCAG 2.5.3, NFR-62). "Watching" is the usual state and has no badge.
 */
export function coverBadges(entry: EntryDto, lang: Lang): { tier: string | null; status: string | null } {
  return { tier: entry.tier, status: entry.status === 'watching' ? null : statusLabel(lang, entry.status) };
}

/** "5 / 12" when the episode count is known, "5" otherwise. */
export function progressLabel(entry: EntryDto): string {
  const total = entry.media.episodeCount;
  return total === null ? `${entry.progress}` : `${entry.progress} / ${total}`;
}

export function progressPercent(entry: EntryDto): number | null {
  const total = entry.media.episodeCount;
  return total === null ? null : Math.min(100, Math.round((entry.progress / total) * 100));
}

export function totalMinutes(entry: EntryDto): number | null {
  const { episodeCount, episodeLengthMin } = entry.media;
  return episodeCount !== null && episodeLengthMin !== null ? episodeCount * episodeLengthMin : null;
}

/** Minutes still to watch for an entry, or null when the episode count or length is unknown. */
export function remainingMinutes(entry: EntryDto): number | null {
  const { episodeCount, episodeLengthMin } = entry.media;
  if (episodeCount === null || episodeLengthMin === null) return null;
  return Math.max(0, episodeCount - entry.progress) * episodeLengthMin;
}
