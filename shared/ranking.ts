import { BUCKETS, type Bucket, type Tier } from './domain.ts';

/** Score range for each bucket; the best entry of a bucket gets `high`, the worst gets `low`. */
export const SCORE_RANGE: Record<Bucket, { high: number; low: number }> = {
  loved: { high: 100, low: 70 },
  liked: { high: 69, low: 40 },
  meh: { high: 39, low: 0 },
};

const TIER_MINIMUM_SCORES: readonly { tier: Tier; minimum: number }[] = [
  { tier: 'S', minimum: 90 },
  { tier: 'A', minimum: 75 },
  { tier: 'B', minimum: 60 },
  { tier: 'C', minimum: 40 },
];

/**
 * Score of the entry at `indexInBucket` (0 = best) in a bucket holding `bucketSize` entries.
 * A bucket with a single entry gets the top of its range.
 */
export function computeScore(bucket: Bucket, indexInBucket: number, bucketSize: number): number {
  const { high, low } = SCORE_RANGE[bucket];
  const lastIndex = Math.max(bucketSize - 1, 1);
  return high - Math.round(((high - low) * indexInBucket) / lastIndex);
}

export function tierOfScore(score: number): Tier {
  return TIER_MINIMUM_SCORES.find(({ minimum }) => score >= minimum)?.tier ?? 'D';
}

/** Upper bound on the number of duels needed to place an entry among `size` ranked entries. */
export function maxDuels(size: number): number {
  return Math.ceil(Math.log2(size + 1));
}

/**
 * Binary insertion search state. The new entry belongs at an insertion index in [low, high] of the
 * bucket list ordered best to worst; the search ends when low === high.
 */
export interface InsertionSearch {
  low: number;
  high: number;
}

export type DuelAnswer = 'better' | 'worse' | 'tie';

export function startInsertionSearch(bucketSize: number): InsertionSearch {
  return { low: 0, high: bucketSize };
}

export function isSearchDone(search: InsertionSearch): boolean {
  return search.low >= search.high;
}

/** Index of the entry the new one must be compared with, or null when the search is done. */
export function nextOpponentIndex(search: InsertionSearch): number | null {
  return isSearchDone(search) ? null : Math.floor((search.low + search.high) / 2);
}

/**
 * Narrows the search after a duel against the opponent at `opponentIndex`.
 * A tie places the new entry directly below the opponent (the incumbent keeps its rank).
 */
export function applyDuelAnswer(
  search: InsertionSearch,
  opponentIndex: number,
  answer: DuelAnswer,
): InsertionSearch {
  if (answer === 'better') return { low: search.low, high: opponentIndex };
  if (answer === 'worse') return { low: opponentIndex + 1, high: search.high };
  return { low: opponentIndex + 1, high: opponentIndex + 1 };
}

export function bucketIndexOf(bucket: Bucket): number {
  return BUCKETS.indexOf(bucket);
}
