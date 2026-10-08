import type { Bucket, DuelCandidateDto, Status } from '../../shared/domain.ts';
import type { Database, Queryable } from '../db/database.ts';
import { NotFoundError, ValidationError } from '../errors.ts';
import { listBucketCandidates, placeRank, releaseRank } from './ranks.ts';

export function createRankingService(db: Database) {
  async function lockStatus(tx: Queryable, userId: number, entryId: number): Promise<Status> {
    const [row] = await tx.query<{ status: Status }>(
      'SELECT status FROM library_entry WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [entryId, userId],
    );
    if (!row) throw new NotFoundError('library.entryNotFound');
    return row.status;
  }

  return {
    /** The ranked entries of a bucket, best first, to duel against. The entry being ranked is left out. */
    listCandidates(userId: number, bucket: Bucket, excludedEntryId: number | null): Promise<DuelCandidateDto[]> {
      return listBucketCandidates(db, userId, bucket, excludedEntryId);
    },

    /** Ranks (or re-ranks) an entry at `indexInBucket` of `bucket`; 0 means the best of the bucket. */
    async place(userId: number, entryId: number, bucket: Bucket, indexInBucket: number): Promise<void> {
      await db.transaction(async (tx) => {
        if ((await lockStatus(tx, userId, entryId)) === 'planned') {
          throw new ValidationError('ranking.notStarted');
        }
        await placeRank(tx, userId, entryId, bucket, indexInBucket);
      });
    },

    async unrank(userId: number, entryId: number): Promise<void> {
      await db.transaction(async (tx) => {
        await lockStatus(tx, userId, entryId);
        await releaseRank(tx, userId, entryId);
      });
    },
  };
}

export type RankingService = ReturnType<typeof createRankingService>;
