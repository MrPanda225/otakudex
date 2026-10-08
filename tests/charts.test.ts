import { describe, expect, it } from 'vitest';
import { buildOverview } from '../web/src/lib/dashboard.ts';
import {
  formatDelta,
  indexOfMax,
  lastSevenDays,
  linePoints,
  movingAverageOfCompletedWeeks,
  niceCeil,
  paceEpisodesPerWeek,
  weeklyEpisodes,
  weeksToClear,
  type DayCell,
} from '../web/src/lib/charts.ts';

/** `count` consecutive days ending on `last`, with `episodesFor(index, day)` episodes each. */
function daysEndingOn(last: string, count: number, episodesFor: (index: number, day: string) => number): DayCell[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    return { day, episodes: episodesFor(index, day) };
  });
}

describe('weekly series', () => {
  // 2026-10-07 is a Wednesday: its week started on Monday 2026-10-05.
  const days = daysEndingOn('2026-10-07', 364, (_, day) => (day === '2026-10-07' ? 2 : day === '2026-10-05' ? 1 : day === '2026-09-30' ? 4 : 0));

  it('groups days into Monday weeks and flags the unfinished one', () => {
    const weeks = weeklyEpisodes(days, 26);
    expect(weeks).toHaveLength(26);
    expect(weeks.at(-1)).toEqual({ start: '2026-10-05', episodes: 3, isCurrent: true });
    expect(weeks.at(-2)).toEqual({ start: '2026-09-28', episodes: 4, isCurrent: false });
    expect(weeks.filter((week) => week.isCurrent)).toHaveLength(1);
    expect(weeks[0]?.start).toBe('2026-04-13');
  });

  it('is empty without data', () => {
    expect(weeklyEpisodes([], 26)).toEqual([]);
  });

  it('averages completed weeks only, over a trailing window', () => {
    const weeks = [2, 4, 6, 8, 3].map((episodes, index, all) => ({ start: `w${index}`, episodes, isCurrent: index === all.length - 1 }));
    expect(movingAverageOfCompletedWeeks(weeks, 4)).toEqual([2, 3, 4, 5, null]);
  });
});

describe('comparisons and pace', () => {
  it('compares the last 7 days with the 7 days before', () => {
    const days = daysEndingOn('2026-10-07', 30, (index) => (index >= 23 ? 2 : index >= 16 ? 1 : 0));
    expect(lastSevenDays(days)).toEqual({ current: 14, previous: 7, delta: 7 });
  });

  it('handles a series shorter than two weeks', () => {
    expect(lastSevenDays(daysEndingOn('2026-10-07', 3, () => 1))).toEqual({ current: 3, previous: 0, delta: 3 });
    expect(lastSevenDays([])).toEqual({ current: 0, previous: 0, delta: 0 });
  });

  it('measures the pace over the last 28 days', () => {
    expect(paceEpisodesPerWeek(daysEndingOn('2026-10-07', 364, (index) => (index >= 336 ? 1 : 0)))).toBe(7);
    expect(paceEpisodesPerWeek(daysEndingOn('2026-10-07', 364, () => 0))).toBe(0);
  });

  it('estimates weeks to clear the backlog, rounded up, and refuses to guess without a pace', () => {
    expect(weeksToClear(31, 3.5)).toBe(9);
    expect(weeksToClear(7, 7)).toBe(1);
    expect(weeksToClear(10, 0)).toBeNull();
    expect(weeksToClear(0, 5)).toBeNull();
  });

  it('writes changes with a sign and a real minus', () => {
    expect(formatDelta(3)).toBe('+3');
    expect(formatDelta(-2)).toBe('−2');
    expect(formatDelta(0)).toBe('=');
  });
});

describe('axis and line helpers', () => {
  it('keeps the axis tight around the data, on a round step', () => {
    expect([0, 1, 2, 3, 5, 6, 11, 21, 23, 70, 101].map(niceCeil)).toEqual([1, 1, 2, 3, 5, 6, 15, 25, 25, 80, 150]);
    for (const max of [4, 9, 17, 33, 48, 120, 999]) expect(niceCeil(max)).toBeGreaterThanOrEqual(max);
  });

  it('keeps the axis at zero and the biggest value at the top', () => {
    const points = linePoints([0, 5, 10], 100, 40);
    expect(points).toEqual([{ x: 0, y: 40 }, { x: 50, y: 20 }, { x: 100, y: 0 }]);
    expect(linePoints([0, 0], 10, 10)[0]?.y).toBe(10); // all zeros stay on the baseline
    expect(linePoints([4], 10, 10)).toEqual([{ x: 0, y: 0 }]);
  });

  it('finds the best value', () => {
    expect(indexOfMax([1, 7, 7, 3])).toBe(1);
    expect(indexOfMax([])).toBe(-1);
  });
});


describe('overview of the dashboard', () => {
  it('derives the weekly series, the comparison, the pace and the estimate from daily activity', () => {
    const days = daysEndingOn('2026-10-07', 364, (index) => (index >= 336 ? 1 : 0)); // one episode a day for 28 days
    const overview = buildOverview({ heatmap: days, backlogEpisodes: 21 });

    expect(overview.weeks).toHaveLength(26);
    expect(overview.sevenDays).toEqual({ current: 7, previous: 7, delta: 0 });
    expect(overview.pacePerWeek).toBe(7);
    expect(overview.weeksToClearBacklog).toBe(3);
    expect(overview.sparkline).toHaveLength(12);
    expect(overview.average.at(-1)).toBeNull(); // the current week is never averaged
  });

  it('gives no estimate when nothing was watched recently', () => {
    const overview = buildOverview({ heatmap: daysEndingOn('2026-10-07', 364, () => 0), backlogEpisodes: 40 });
    expect(overview.pacePerWeek).toBe(0);
    expect(overview.weeksToClearBacklog).toBeNull();
  });
});
