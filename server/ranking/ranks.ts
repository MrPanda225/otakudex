import { BUCKETS, type Bucket, type DuelCandidateDto } from '../../shared/domain.ts';
import type { Queryable } from '../db/database.ts';
import { computeInsertPosition, emptyBucketCounts, type BucketCounts } from './positions.ts';

/**
 * Rank bookkeeping. Invariant kept by every function here: the ranked entries of one person hold the
 * consecutive positions 1..N, best bucket first. Callers must run these inside a transaction.
 */

/** Entries of `bucket`, best first, optionally leaving one entry out (the one being ranked). */
export async function listBucketCandidates(
  db: Queryable,
  userId: number,
  bucket: Bucket,
  excludedEntryId: number | null,
): Promise<DuelCandidateDto[]> {
  const rows = await db.query<{ entry_id: number; title: string; poster_url: string | null }>(
    `SELECT e.id AS entry_id, m.title, m.poster_url
       FROM library_entry e
       JOIN media m ON m.id = e.media_id
      WHERE e.user_id = $3 AND e.bucket = $1 AND e.id IS DISTINCT FROM $2
      ORDER BY e.rank_position`,
    [bucket, excludedEntryId, userId],
  );
  return rows.map((row) => ({ entryId: row.entry_id, title: row.title, posterUrl: row.poster_url }));
}

/** Removes an entry from the ranking and closes the gap it leaves. No-op when it is unranked. */
export async function releaseRank(tx: Queryable, userId: number, entryId: number): Promise<void> {
  const [row] = await tx.query<{ rank_position: number | null }>(
    'SELECT rank_position FROM library_entry WHERE id = $1 AND user_id = $2',
    [entryId, userId],
  );
  const oldPosition = row?.rank_position ?? null;
  if (oldPosition === null) return;

  await tx.query(
    'UPDATE library_entry SET bucket = NULL, rank_position = NULL, updated_at = now() WHERE id = $1 AND user_id = $2',
    [entryId, userId],
  );
  await tx.query('UPDATE library_entry SET rank_position = rank_position - 1 WHERE user_id = $2 AND rank_position > $1', [
    oldPosition,
    userId,
  ]);
}

/**
 * Puts an entry at `indexInBucket` (0 = best) of `bucket`, moving it first if it was already ranked.
 * Throws ValidationError when the index does not fit the bucket.
 */
export async function placeRank(
  tx: Queryable,
  userId: number,
  entryId: number,
  bucket: Bucket,
  indexInBucket: number,
): Promise<void> {
  await releaseRank(tx, userId, entryId);
  const position = computeInsertPosition(await countBuckets(tx, userId), bucket, indexInBucket);

  await tx.query('UPDATE library_entry SET rank_position = rank_position + 1 WHERE user_id = $2 AND rank_position >= $1', [
    position,
    userId,
  ]);
  await tx.query(
    'UPDATE library_entry SET bucket = $2, rank_position = $3, updated_at = now() WHERE id = $1 AND user_id = $4',
    [entryId, bucket, position, userId],
  );
}

async function countBuckets(db: Queryable, userId: number): Promise<BucketCounts> {
  const rows = await db.query<{ bucket: Bucket; count: number }>(
    'SELECT bucket, count(*)::int AS count FROM library_entry WHERE user_id = $1 AND bucket IS NOT NULL GROUP BY bucket',
    [userId],
  );
  const counts = emptyBucketCounts();
  for (const { bucket, count } of rows) {
    if (BUCKETS.includes(bucket)) counts[bucket] = count;
  }
  return counts;
}
