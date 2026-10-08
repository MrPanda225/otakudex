import type { EntryDto, EntryPatch, Status } from '../../../shared/domain.ts';
import type { Problem } from '../i18n/problem.ts';

/**
 * The rules of the entry sheet that go beyond what one field says: which other fields follow a
 * change, and what the screen shows while the server is still answering. The server stays the
 * authority (server/library/patch.ts); its answer replaces what is computed here.
 */

/** What the entry will look like once `patch` is saved. */
export function withPatchApplied(entry: EntryDto, patch: EntryPatch): EntryDto {
  const total = entry.media.episodeCount;
  const next: EntryDto = { ...entry };
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.progress !== undefined) next.progress = patch.progress;
  else if (patch.status === 'completed' && entry.status !== 'completed' && total !== null) next.progress = total; // same rule as the server
  if (patch.rewatchCount !== undefined) next.rewatchCount = patch.rewatchCount;
  if (patch.startedOn !== undefined) next.startedOn = patch.startedOn;
  if (patch.completedOn !== undefined) next.completedOn = patch.completedOn;
  if (patch.note !== undefined) next.note = patch.note;
  if (patch.status === 'planned') {
    // An entry that goes back to "to watch" loses its place in the ranking.
    next.bucket = null;
    next.rankPosition = null;
    next.score = null;
    next.tier = null;
  }
  return next;
}

/** Choosing a status also fills the dates it implies, and never overwrites one already written. */
export function patchForStatus(entry: EntryDto, status: Status, today: string): EntryPatch {
  const patch: EntryPatch = { status };
  if ((status === 'watching' || status === 'completed') && entry.startedOn === null) patch.startedOn = today;
  if (status === 'completed' && entry.completedOn === null) patch.completedOn = today;
  return patch;
}

/** Setting the number of watched episodes by hand: the status and the dates follow. */
export function patchForProgress(entry: EntryDto, progress: number, today: string): EntryPatch {
  const total = entry.media.episodeCount;
  const patch: EntryPatch = { progress };
  if (progress > 0 && entry.startedOn === null) patch.startedOn = today;
  if (total !== null && progress === total) {
    if (entry.status !== 'completed') patch.status = 'completed';
    if (entry.completedOn === null) patch.completedOn = today;
  } else if (entry.status === 'completed' && total !== null && progress < total) {
    patch.status = 'watching';
  } else if (progress > 0 && entry.status === 'planned') {
    patch.status = 'watching';
  }
  return patch;
}

export type ParsedProgress = { ok: true; value: number } | { ok: false; problem: Problem };

export function parseProgress(text: string, total: number | null): ParsedProgress {
  const range: Problem = total === null ? { key: 'progress.integer' } : { key: 'progress.integerBetween', params: { max: total } };
  if (!/^\d{1,5}$/.test(text.trim())) return { ok: false, problem: range };
  const value = Number(text.trim());
  return total !== null && value > total ? { ok: false, problem: range } : { ok: true, value };
}

export type PrimaryAction = 'mark' | 'rank' | null;

/** The one action the sheet puts forward, from the entry's state. */
export function primaryActionOf(entry: EntryDto): PrimaryAction {
  const total = entry.media.episodeCount;
  const canMark = total === null || entry.progress < total;
  if (canMark && entry.status !== 'completed') return 'mark';
  if (entry.status === 'completed' && entry.rankPosition === null) return 'rank';
  return null;
}
