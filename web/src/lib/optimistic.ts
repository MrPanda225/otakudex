import type { EntryDto } from '../../../shared/domain.ts';

/**
 * What the entry will look like once the server has recorded one more episode. It follows the same
 * rules as the server, so the screen can change at once and the server's answer only confirms it.
 * The server remains the authority: its answer replaces this copy.
 */
export function withEpisodeMarked(entry: EntryDto, nowIso: string): EntryDto {
  const total = entry.media.episodeCount;
  const progress = entry.progress + 1;
  const isLastEpisode = total !== null && progress === total;
  return {
    ...entry,
    progress,
    status: isLastEpisode || entry.status === 'completed' ? 'completed' : 'watching',
    lastActivityAt: nowIso,
  };
}

/** The entry once its last logged episode is cancelled: one less, and no longer "completed". */
export function withEpisodeUndone(entry: EntryDto): EntryDto {
  return {
    ...entry,
    progress: Math.max(0, entry.progress - 1),
    status: entry.status === 'completed' ? 'watching' : entry.status,
    completedOn: entry.status === 'completed' ? null : entry.completedOn,
  };
}
