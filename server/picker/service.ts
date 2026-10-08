import type { EntryDto, PickerFilters, PickerResultDto } from '../../shared/domain.ts';
import type { LibraryService } from '../library/service.ts';
import { pickWeighted } from './pick.ts';

export function totalMinutesOf(entry: EntryDto): number | null {
  const { episodeCount, episodeLengthMin } = entry.media;
  return episodeCount !== null && episodeLengthMin !== null ? episodeCount * episodeLengthMin : null;
}

export function matchesFilters(entry: EntryDto, filters: PickerFilters): boolean {
  if (filters.subtype && entry.media.subtype.toLowerCase() !== filters.subtype.toLowerCase()) return false;
  if (filters.maxTotalMinutes === undefined) return true;
  const total = totalMinutesOf(entry);
  return total !== null && total <= filters.maxTotalMinutes;
}

export function createPickerService(library: LibraryService) {
  return {
    /** Draws a "planned" anime matching the filters, favouring those that waited longest. */
    async pick(userId: number, filters: PickerFilters, now: Date = new Date()): Promise<PickerResultDto> {
      const planned = (await library.list(userId)).filter((entry) => entry.status === 'planned');
      const candidates = planned
        .filter((entry) => matchesFilters(entry, filters))
        .map((entry) => ({ id: entry.id, addedAt: entry.createdAt, entry }));
      const winner = pickWeighted(candidates, now);
      return { candidateCount: candidates.length, entry: winner?.entry ?? null };
    },
  };
}

export type PickerService = ReturnType<typeof createPickerService>;
