import { BUCKETS, type Bucket, type Tier } from '../../shared/domain.ts';
import { computeScore, tierOfScore } from '../../shared/ranking.ts';

interface Rankable {
  bucket: Bucket | null;
  rankPosition: number | null;
}

export interface Scored {
  score: number | null;
  tier: Tier | null;
}

/**
 * Computes the score and tier of every ranked item from its place inside its bucket.
 * Returns a new array in the same order; items are not mutated. Unranked items get nulls.
 */
export function withScores<T extends Rankable>(items: readonly T[]): (T & Scored)[] {
  const scoreByItem = new Map<T, Scored>();

  for (const bucket of BUCKETS) {
    const members = items
      .filter((item) => item.bucket === bucket && item.rankPosition !== null)
      .sort((a, b) => (a.rankPosition ?? 0) - (b.rankPosition ?? 0));
    members.forEach((item, index) => {
      const score = computeScore(bucket, index, members.length);
      scoreByItem.set(item, { score, tier: tierOfScore(score) });
    });
  }

  return items.map((item) => ({ ...item, ...(scoreByItem.get(item) ?? { score: null, tier: null }) }));
}
