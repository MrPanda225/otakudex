import type { EntryPatch, Status } from '../../shared/domain.ts';
import { ValidationError } from '../errors.ts';

export interface EntryState {
  status: Status;
  progress: number;
  episodeCount: number | null;
}

/**
 * Applies the business rules to a patch and returns the fields to write:
 * - progress can never exceed the known episode count;
 * - setting "completed" on an anime with a known episode count marks every episode as seen,
 *   unless the patch states a progress itself.
 * Throws ValidationError for a progress that does not fit.
 */
export function resolvePatch(current: EntryState, patch: EntryPatch): EntryPatch {
  const resolved: EntryPatch = { ...patch };
  const { episodeCount } = current;

  const isBecomingCompleted = patch.status === 'completed' && current.status !== 'completed';
  if (isBecomingCompleted && patch.progress === undefined && episodeCount !== null) {
    resolved.progress = episodeCount;
  }
  if (resolved.progress !== undefined && episodeCount !== null && resolved.progress > episodeCount) {
    throw new ValidationError('library.progressTooHigh', { count: episodeCount });
  }
  return resolved;
}
