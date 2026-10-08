import { weekIndexOf } from '../../shared/weeks.ts';

export { weekIndexOf };

export interface WeekStreaks {
  longest: number;
  current: number;
}

/**
 * Streaks of consecutive weeks with at least one episode.
 * The current streak is lenient on purpose: if this week has no episode yet, it still counts the
 * run that ended last week, so a streak is never shown as lost before the week is over.
 */
export function computeWeekStreaks(activeDays: readonly string[], todayIsoDate: string): WeekStreaks {
  const weeks = [...new Set(activeDays.map(weekIndexOf))].sort((a, b) => a - b);
  if (weeks.length === 0) return { longest: 0, current: 0 };

  let longest = 1;
  let run = 1;
  for (let index = 1; index < weeks.length; index += 1) {
    run = weeks[index]! === weeks[index - 1]! + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const thisWeek = weekIndexOf(todayIsoDate);
  const weekSet = new Set(weeks);
  let cursor = weekSet.has(thisWeek) ? thisWeek : thisWeek - 1;
  let current = 0;
  while (weekSet.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  return { longest, current };
}
