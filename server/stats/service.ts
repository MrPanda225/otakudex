import type { Status, StatsDto } from '../../shared/domain.ts';
import { STATUSES } from '../../shared/domain.ts';
import type { Database } from '../db/database.ts';
import { ENTRY_SELECT, toEntryDtos, type EntryRow } from '../library/mapping.ts';
import { computeWeekStreaks } from './streak.ts';

const HEATMAP_DAYS = 364; // 52 whole weeks
const TOP_GENRE_COUNT = 10;
const SCORE_BAND_WIDTH = 10;
const MS_PER_DAY = 86_400_000;

export function createStatsService(db: Database, timezone: string) {
  async function readTotals(userId: number) {
    const [row] = await db.query<{
      episodes: number;
      minutes: number;
      without_duration: number;
    }>(
      // 64-bit arithmetic: thousands of episodes times hundreds of minutes times rewatches exceeds 2^31.
      `SELECT coalesce(sum(e.progress::bigint + e.rewatch_count::bigint * coalesce(m.episode_count, 0)), 0)::bigint AS episodes,
              coalesce(sum((e.progress::bigint + e.rewatch_count::bigint * coalesce(m.episode_count, 0))
                           * m.episode_length_min), 0)::bigint AS minutes,
              count(*) FILTER (WHERE e.progress > 0 AND m.episode_length_min IS NULL)::int AS without_duration
         FROM library_entry e
         JOIN media m ON m.id = e.media_id
        WHERE e.user_id = $1`,
      [userId],
    );
    return row ?? { episodes: 0, minutes: 0, without_duration: 0 };
  }

  /** What is left to watch, so the dashboard can say "about N weeks at your pace". */
  async function readBacklog(userId: number) {
    const [row] = await db.query<{ episodes: number; minutes: number; unknown: number }>(
      `SELECT coalesce(sum(greatest(m.episode_count - e.progress, 0)::bigint)
                       FILTER (WHERE m.episode_count IS NOT NULL), 0)::bigint AS episodes,
              coalesce(sum(greatest(m.episode_count - e.progress, 0)::bigint * m.episode_length_min)
                       FILTER (WHERE m.episode_count IS NOT NULL AND m.episode_length_min IS NOT NULL), 0)::bigint AS minutes,
              count(*) FILTER (WHERE m.episode_count IS NULL OR m.episode_length_min IS NULL)::int AS unknown
         FROM library_entry e
         JOIN media m ON m.id = e.media_id
        WHERE e.user_id = $1 AND e.status IN ('planned', 'watching', 'paused')`,
      [userId],
    );
    return row ?? { episodes: 0, minutes: 0, unknown: 0 };
  }

  async function readStatusCounts(userId: number): Promise<Record<Status, number>> {
    const rows = await db.query<{ status: Status; count: number }>(
      'SELECT status, count(*)::int AS count FROM library_entry WHERE user_id = $1 GROUP BY status',
      [userId],
    );
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>;
    for (const { status, count } of rows) counts[status] = count;
    return counts;
  }

  function readTopGenres(userId: number) {
    return db.query<{ genre: string; count: number }>(
      `SELECT g AS genre, count(*)::int AS count
         FROM library_entry e
         JOIN media m ON m.id = e.media_id
        CROSS JOIN LATERAL unnest(m.genres) AS g
        WHERE e.user_id = $1 AND e.status <> 'planned'
        GROUP BY g
        ORDER BY count DESC, genre
        LIMIT ${TOP_GENRE_COUNT}`,
      [userId],
    );
  }

  /** Episodes logged per calendar day (in the configured time zone), all time, oldest first. */
  function readActivityByDay(userId: number) {
    return db.query<{ day: string; episodes: number }>(
      `SELECT (w.watched_at AT TIME ZONE $1)::date AS day, count(*)::int AS episodes
         FROM watch_log w
         JOIN library_entry e ON e.id = w.entry_id
        WHERE e.user_id = $2
        GROUP BY 1
        ORDER BY 1`,
      [timezone, userId],
    );
  }

  return {
    async compute(userId: number, now: Date = new Date()): Promise<StatsDto> {
      const [totals, backlog, byStatus, topGenres, activity, entryRows] = await Promise.all([
        readTotals(userId),
        readBacklog(userId),
        readStatusCounts(userId),
        readTopGenres(userId),
        readActivityByDay(userId),
        db.query<EntryRow>(`${ENTRY_SELECT} WHERE e.user_id = $1 AND e.bucket IS NOT NULL`, [userId]),
      ]);

      const today = isoDayInTimezone(now, timezone);
      const scores = toEntryDtos(entryRows).flatMap((entry) => entry.score ?? []);
      const streaks = computeWeekStreaks(
        activity.map((item) => item.day),
        today,
      );

      return {
        totalEntries: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
        byStatus,
        episodesWatched: totals.episodes,
        minutesWatched: totals.minutes,
        entriesWithoutDuration: totals.without_duration,
        backlogEpisodes: backlog.episodes,
        backlogMinutes: backlog.minutes,
        backlogUnknownCount: backlog.unknown,
        rankedCount: scores.length,
        averageScore: scores.length === 0 ? null : Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
        scoreDistribution: buildScoreDistribution(scores),
        topGenres,
        heatmap: buildHeatmap(activity, today),
        longestWeekStreak: streaks.longest,
        currentWeekStreak: streaks.current,
      };
    },
  };
}

export type StatsService = ReturnType<typeof createStatsService>;

/** Ten bands of width 10 covering 0-100; a score of 100 falls in the last band. */
export function buildScoreDistribution(scores: readonly number[]): StatsDto['scoreDistribution'] {
  const bandCount = 100 / SCORE_BAND_WIDTH;
  const counts = Array.from({ length: bandCount }, () => 0);
  for (const score of scores) {
    const band = Math.min(Math.floor(score / SCORE_BAND_WIDTH), bandCount - 1);
    counts[band] = (counts[band] ?? 0) + 1;
  }
  return counts.map((count, band) => ({
    from: band * SCORE_BAND_WIDTH,
    to: band === bandCount - 1 ? 100 : band * SCORE_BAND_WIDTH + SCORE_BAND_WIDTH - 1,
    count,
  }));
}

/** One cell per day for the last 52 weeks ending today, with zeros for days without episodes. */
export function buildHeatmap(
  activity: readonly { day: string; episodes: number }[],
  todayIsoDate: string,
): StatsDto['heatmap'] {
  const episodesByDay = new Map(activity.map((item) => [item.day, item.episodes] as const));
  const todayMs = Date.parse(`${todayIsoDate}T00:00:00Z`);
  return Array.from({ length: HEATMAP_DAYS }, (_, offset) => {
    const day = new Date(todayMs - (HEATMAP_DAYS - 1 - offset) * MS_PER_DAY).toISOString().slice(0, 10);
    return { day, episodes: episodesByDay.get(day) ?? 0 };
  });
}

/** The calendar date ('YYYY-MM-DD') of `instant` as seen in `timezone`. */
export function isoDayInTimezone(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
