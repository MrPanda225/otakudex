import { mondayOfWeek, weekIndexOf } from '../../../shared/weeks.ts';

export interface DayCell {
  day: string;
  episodes: number;
}

export interface WeekBucket {
  /** Monday of the week, 'YYYY-MM-DD'. */
  start: string;
  episodes: number;
  /** The week containing the last day: it is not finished, so it is never averaged. */
  isCurrent: boolean;
}

const DAYS_PER_WEEK = 7;
const PACE_WINDOW_DAYS = 28;

/** Episodes per Monday-to-Sunday week for the last `weekCount` weeks of a day-by-day series. */
export function weeklyEpisodes(days: readonly DayCell[], weekCount: number): WeekBucket[] {
  const lastDay = days.at(-1);
  if (!lastDay) return [];
  const currentWeek = weekIndexOf(lastDay.day);
  const totals = new Map<number, number>();
  for (const { day, episodes } of days) {
    const week = weekIndexOf(day);
    totals.set(week, (totals.get(week) ?? 0) + episodes);
  }
  return Array.from({ length: weekCount }, (_, offset) => {
    const week = currentWeek - (weekCount - 1 - offset);
    return { start: mondayOfWeek(week), episodes: totals.get(week) ?? 0, isCurrent: week === currentWeek };
  });
}

/**
 * Trailing average over `windowSize` values for each index; early points average what exists.
 * The unfinished current week is left out, so the line never dips just because the week is young.
 */
export function movingAverageOfCompletedWeeks(weeks: readonly WeekBucket[], windowSize: number): (number | null)[] {
  return weeks.map((week, index) => {
    if (week.isCurrent) return null;
    const slice = weeks.slice(Math.max(0, index - windowSize + 1), index + 1);
    return slice.reduce((sum, item) => sum + item.episodes, 0) / slice.length;
  });
}

function sumDays(days: readonly DayCell[], endExclusive: number, length: number): number {
  return days.slice(Math.max(0, endExclusive - length), endExclusive).reduce((sum, cell) => sum + cell.episodes, 0);
}

export interface Comparison {
  current: number;
  previous: number;
  delta: number;
}

/** Episodes in the last 7 days against the 7 days before, so the comparison is always like for like. */
export function lastSevenDays(days: readonly DayCell[]): Comparison {
  const current = sumDays(days, days.length, DAYS_PER_WEEK);
  const previous = sumDays(days, days.length - DAYS_PER_WEEK, DAYS_PER_WEEK);
  return { current, previous, delta: current - previous };
}

/** Episodes per week over the last 28 days. */
export function paceEpisodesPerWeek(days: readonly DayCell[]): number {
  return sumDays(days, days.length, PACE_WINDOW_DAYS) / (PACE_WINDOW_DAYS / DAYS_PER_WEEK);
}

/** Whole weeks needed to clear the backlog at the current pace; null when there is nothing to estimate. */
export function weeksToClear(backlogEpisodes: number, pacePerWeek: number): number | null {
  if (backlogEpisodes <= 0 || pacePerWeek <= 0) return null;
  return Math.ceil(backlogEpisodes / pacePerWeek);
}

/** "+3", "−2" (a real minus sign) or "=" so the change reads without any colour. */
export function formatDelta(delta: number): string {
  if (delta === 0) return '=';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
}

/**
 * Smallest multiple of a "round" step (1, 2 or 5 times a power of ten, at least 1) that holds `max`,
 * with the step chosen so the axis has about five intervals. Keeps the chart tight around its data.
 */
export function niceCeil(max: number): number {
  if (max <= 1) return 1;
  const rawStep = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step = Math.max(1, (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude);
  return Math.ceil(max / step) * step;
}

export interface Point {
  x: number;
  y: number;
}

/** Points of a line chart inside a box; the y axis starts at zero and the largest value touches the top. */
export function linePoints(values: readonly number[], width: number, height: number, ceiling = Math.max(...values, 1)): Point[] {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, index) => ({ x: index * step, y: height - (value / ceiling) * height }));
}

/** Index of the largest value (first one on a tie), or -1 for an empty list. */
export function indexOfMax(values: readonly number[]): number {
  let best = -1;
  values.forEach((value, index) => {
    if (best === -1 || value > (values[best] ?? 0)) best = index;
  });
  return best;
}
