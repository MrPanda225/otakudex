import { BUCKETS, type Bucket } from '../../shared/domain.ts';
import { ValidationError } from '../errors.ts';

export type BucketCounts = Record<Bucket, number>;

export function emptyBucketCounts(): BucketCounts {
  return { loved: 0, liked: 0, meh: 0 };
}

/**
 * Global rank (1 = best) of an entry inserted at `indexInBucket` of `bucket`.
 * Buckets are laid out in BUCKETS order, so every entry of a better bucket comes first.
 */
export function computeInsertPosition(
  counts: BucketCounts,
  bucket: Bucket,
  indexInBucket: number,
): number {
  if (!Number.isInteger(indexInBucket) || indexInBucket < 0 || indexInBucket > counts[bucket]) {
    throw new ValidationError('ranking.badPosition');
  }
  const betterBuckets = BUCKETS.slice(0, BUCKETS.indexOf(bucket));
  const entriesAbove = betterBuckets.reduce((total, name) => total + counts[name], 0);
  return entriesAbove + indexInBucket + 1;
}
