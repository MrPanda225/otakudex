import type { StatsDto } from '../../../shared/domain.ts';
import {
  lastSevenDays,
  movingAverageOfCompletedWeeks,
  paceEpisodesPerWeek,
  weeklyEpisodes,
  weeksToClear,
  type Comparison,
  type WeekBucket,
} from './charts.ts';

const DEFAULT_CHART_WEEKS = 26;
const SPARKLINE_WEEKS = 12;
const AVERAGE_WINDOW_WEEKS = 4;

export interface Overview {
  weeks: WeekBucket[];
  /** Four-week average for each finished week; null for the current one. */
  average: (number | null)[];
  sevenDays: Comparison;
  pacePerWeek: number;
  weeksToClearBacklog: number | null;
  /** Episodes per week over the last twelve weeks, for the small trend line. */
  sparkline: number[];
}

/** Everything the "Aperçu" view derives from the day-by-day activity and the backlog size. */
export function buildOverview(stats: Pick<StatsDto, 'heatmap' | 'backlogEpisodes'>, weekCount: number = DEFAULT_CHART_WEEKS): Overview {
  const weeks = weeklyEpisodes(stats.heatmap, weekCount);
  const pacePerWeek = paceEpisodesPerWeek(stats.heatmap);
  return {
    weeks,
    average: movingAverageOfCompletedWeeks(weeks, AVERAGE_WINDOW_WEEKS),
    sevenDays: lastSevenDays(stats.heatmap),
    pacePerWeek,
    weeksToClearBacklog: weeksToClear(stats.backlogEpisodes, pacePerWeek),
    sparkline: weeks.slice(-SPARKLINE_WEEKS).map((week) => week.episodes),
  };
}
