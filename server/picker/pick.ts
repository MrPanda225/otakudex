const MS_PER_DAY = 86_400_000;
const DAYS_PER_EXTRA_WEIGHT = 30;
const MAX_EXTRA_WEIGHT = 12;

export interface PickCandidate {
  id: number;
  /** When the anime was added to the backlog (ISO timestamp). */
  addedAt: string;
}

/**
 * Weight of a backlog item: 1, plus 1 for every 30 days it has waited (capped), so old forgotten
 * entries are more likely to be drawn without ever excluding the recent ones.
 */
export function backlogWeight(addedAt: string, now: Date): number {
  const waitedDays = Math.max(0, (now.getTime() - Date.parse(addedAt)) / MS_PER_DAY);
  return 1 + Math.min(Math.floor(waitedDays / DAYS_PER_EXTRA_WEIGHT), MAX_EXTRA_WEIGHT);
}

/**
 * Draws one candidate with probability proportional to its weight.
 * `random` returns a number in [0, 1) and is injectable so tests are deterministic.
 * Returns null when there is no candidate.
 */
export function pickWeighted<T extends PickCandidate>(
  candidates: readonly T[],
  now: Date = new Date(),
  random: () => number = Math.random,
): T | null {
  if (candidates.length === 0) return null;
  const weights = candidates.map((candidate) => backlogWeight(candidate.addedAt, now));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let threshold = random() * total;
  for (const [index, candidate] of candidates.entries()) {
    threshold -= weights[index]!;
    if (threshold < 0) return candidate;
  }
  return candidates[candidates.length - 1] ?? null;
}
