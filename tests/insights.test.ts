import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../server/db/database.ts';
import { backlogWeight, pickWeighted } from '../server/picker/pick.ts';
import { matchesFilters } from '../server/picker/service.ts';
import { buildHeatmap, buildScoreDistribution, isoDayInTimezone } from '../server/stats/service.ts';
import { computeWeekStreaks, weekIndexOf } from '../server/stats/streak.ts';
import { createTestDatabase, createTestServices, makeSnapshot, TEST_TIMEZONE, createTestUser } from './helpers.ts';

describe('week streaks', () => {
  it('numbers consecutive Monday-to-Sunday weeks consecutively', () => {
    expect(weekIndexOf('2026-10-05') - weekIndexOf('2026-09-28')).toBe(1); // two Mondays
    expect(weekIndexOf('2026-10-11')).toBe(weekIndexOf('2026-10-05')); // Sunday, same week
    expect(weekIndexOf('2026-10-12')).toBe(weekIndexOf('2026-10-05') + 1); // next Monday
  });

  it('finds the longest run and the current run', () => {
    const days = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-09-14', '2026-09-28', '2026-10-05'];
    expect(computeWeekStreaks(days, '2026-10-07')).toEqual({ longest: 3, current: 2 });
  });

  it('keeps the streak alive while the current week is still empty', () => {
    expect(computeWeekStreaks(['2026-09-28', '2026-09-30'], '2026-10-07').current).toBe(1);
    expect(computeWeekStreaks(['2026-09-21'], '2026-10-07').current).toBe(0);
  });

  it('is zero without activity', () => {
    expect(computeWeekStreaks([], '2026-10-07')).toEqual({ longest: 0, current: 0 });
  });
});

describe('stats helpers', () => {
  it('builds a 364-day heatmap ending today with zeros for quiet days', () => {
    const heatmap = buildHeatmap([{ day: '2026-10-05', episodes: 3 }], '2026-10-07');
    expect(heatmap).toHaveLength(364);
    expect(heatmap.at(-1)).toEqual({ day: '2026-10-07', episodes: 0 });
    expect(heatmap.at(-3)).toEqual({ day: '2026-10-05', episodes: 3 });
    expect(heatmap[0]?.day).toBe('2025-10-09');
  });

  it('puts a score of 100 in the last band', () => {
    const bands = buildScoreDistribution([100, 99, 70, 0]);
    expect(bands).toHaveLength(10);
    expect(bands[9]).toEqual({ from: 90, to: 100, count: 2 });
    expect(bands[7]).toEqual({ from: 70, to: 79, count: 1 });
    expect(bands[0]).toEqual({ from: 0, to: 9, count: 1 });
  });

  it('reads the calendar day in the requested time zone', () => {
    const lateEvening = new Date('2026-10-07T23:30:00Z');
    expect(isoDayInTimezone(lateEvening, 'UTC')).toBe('2026-10-07');
    expect(isoDayInTimezone(lateEvening, 'Europe/Paris')).toBe('2026-10-08');
  });
});

describe('stats service', () => {
  let db: Database;
  let userId: number;
  let services: ReturnType<typeof createTestServices>;

  beforeEach(async () => {
    db = await createTestDatabase();
    userId = await createTestUser(db);
  });
  afterEach(() => db.close());

  it('counts episodes, time, genres and ranked scores', async () => {
    const withDuration = makeSnapshot({ title: 'A', episodeCount: 12, episodeLengthMin: 24, genres: ['Action', 'Drama'] });
    const withoutDuration = makeSnapshot({ title: 'B', episodeCount: 12, episodeLengthMin: null, genres: ['Action'] });
    const planned = makeSnapshot({ title: 'C', genres: ['Horror'] });
    services = createTestServices(db, [withDuration, withoutDuration, planned]);

    const a = await services.library.addFromKitsu(userId, withDuration.kitsuId!, 'watching');
    const b = await services.library.addFromKitsu(userId, withoutDuration.kitsuId!, 'watching');
    await services.library.addFromKitsu(userId, planned.kitsuId!, 'planned');
    await services.library.update(userId, a.id, { progress: 3 });
    await services.library.update(userId, b.id, { progress: 2, rewatchCount: 1 });
    await services.ranking.place(userId, a.id, 'loved', 0);

    const stats = await services.stats.compute(userId, new Date('2026-10-07T12:00:00Z'));

    expect(stats.totalEntries).toBe(3);
    expect(stats.byStatus).toMatchObject({ watching: 2, planned: 1, completed: 0 });
    expect(stats.episodesWatched).toBe(3 + 2 + 12); // progress plus one full rewatch of B
    expect(stats.minutesWatched).toBe(3 * 24); // B has no duration, so it adds nothing
    expect(stats.entriesWithoutDuration).toBe(1);
    expect(stats.topGenres).toEqual([
      { genre: 'Action', count: 2 },
      { genre: 'Drama', count: 1 },
    ]); // "planned" anime do not count
    expect(stats).toMatchObject({ rankedCount: 1, averageScore: 100 });
    expect(stats.scoreDistribution[9]?.count).toBe(1);
  });

  it('builds the heatmap and streaks from the watch log', async () => {
    const snapshot = makeSnapshot({ title: 'A' });
    services = createTestServices(db, [snapshot]);
    const entry = await services.library.addFromKitsu(userId, snapshot.kitsuId!, 'watching');
    for (const [episode, instant] of [
      [1, '2026-09-28T18:00:00Z'],
      [2, '2026-09-28T19:00:00Z'],
      [3, '2026-10-06T20:00:00Z'],
    ] as const) {
      await db.query('INSERT INTO watch_log (entry_id, episode_number, watched_at) VALUES ($1, $2, $3)', [
        entry.id,
        episode,
        instant,
      ]);
    }

    const stats = await services.stats.compute(userId, new Date('2026-10-07T12:00:00Z'));
    const byDay = new Map(stats.heatmap.map((cell) => [cell.day, cell.episodes]));

    expect(byDay.get('2026-09-28')).toBe(2);
    expect(byDay.get('2026-10-06')).toBe(1);
    expect({ longest: stats.longestWeekStreak, current: stats.currentWeekStreak }).toEqual({ longest: 2, current: 2 });
  });

  it('computes what is left to watch, ignoring finished and unknown anime', async () => {
    const watching = makeSnapshot({ title: 'W', episodeCount: 12, episodeLengthMin: 24 });
    const planned = makeSnapshot({ title: 'P', episodeCount: 10, episodeLengthMin: 30 });
    const noLength = makeSnapshot({ title: 'N', episodeCount: 6, episodeLengthMin: null });
    const noCount = makeSnapshot({ title: 'C', episodeCount: null, episodeLengthMin: 24 });
    const finished = makeSnapshot({ title: 'F', episodeCount: 12, episodeLengthMin: 24 });
    services = createTestServices(db, [watching, planned, noLength, noCount, finished]);

    const w = await services.library.addFromKitsu(userId, watching.kitsuId!, 'watching');
    await services.library.update(userId, w.id, { progress: 2 });
    await services.library.addFromKitsu(userId, planned.kitsuId!, 'planned');
    await services.library.addFromKitsu(userId, noLength.kitsuId!, 'planned');
    await services.library.addFromKitsu(userId, noCount.kitsuId!, 'planned');
    await services.library.addFromKitsu(userId, finished.kitsuId!, 'completed');

    const stats = await services.stats.compute(userId, new Date('2026-10-07T12:00:00Z'));

    expect(stats.backlogEpisodes).toBe(10 + 10 + 6); // W has 10 left, P has 10, N has 6; C is unknown, F is done
    expect(stats.backlogMinutes).toBe(10 * 24 + 10 * 30); // N has no length, C has no count
    expect(stats.backlogUnknownCount).toBe(2); // N and C
  });

  it('does not overflow on very large totals', async () => {
    const [media] = await db.query<{ id: number }>(
      `INSERT INTO media (title, episode_count, episode_length_min) VALUES ('Huge', 5000, 600) RETURNING id`,
    );
    await db.query(
      `INSERT INTO library_entry (user_id, media_id, status, progress, rewatch_count) VALUES ($1, $2, 'watching', 5000, 1000)`,
      [userId, media?.id],
    );
    services = createTestServices(db);
    const stats = await services.stats.compute(userId, new Date('2026-10-07T12:00:00Z'));
    expect(stats.episodesWatched).toBe(5000 + 1000 * 5000);
    expect(stats.minutesWatched).toBe((5000 + 1000 * 5000) * 600); // 3.0e9, above the 32-bit limit
  });

  it('returns empty but valid stats for an empty library', async () => {
    services = createTestServices(db);
    const stats = await services.stats.compute(userId, new Date('2026-10-07T12:00:00Z'));
    expect(stats).toMatchObject({ totalEntries: 0, episodesWatched: 0, averageScore: null, rankedCount: 0 });
    expect(stats.heatmap).toHaveLength(364);
  });

  it('uses the configured time zone to place an episode on a day', async () => {
    const snapshot = makeSnapshot({ title: 'A' });
    services = createTestServices(db, [snapshot]);
    const entry = await services.library.addFromKitsu(userId, snapshot.kitsuId!, 'watching');
    // 23:30 UTC on the 6th is already the 7th in Paris (UTC+2 in October).
    await db.query(`INSERT INTO watch_log (entry_id, episode_number, watched_at) VALUES ($1, 1, '2026-10-06T23:30:00Z')`, [
      entry.id,
    ]);
    const stats = await services.stats.compute(userId, new Date('2026-10-07T12:00:00Z'));
    expect(TEST_TIMEZONE).toBe('Europe/Paris');
    expect(stats.heatmap.find((cell) => cell.day === '2026-10-07')?.episodes).toBe(1);
  });
});

describe('picker', () => {
  const now = new Date('2026-10-07T00:00:00Z');
  const longAgo = '2025-01-01T00:00:00Z';
  const today = '2026-10-07T00:00:00Z';

  it('gives older backlog entries a higher weight, with a cap', () => {
    expect(backlogWeight(today, now)).toBe(1);
    expect(backlogWeight('2026-08-07T00:00:00Z', now)).toBe(3); // two months
    expect(backlogWeight(longAgo, now)).toBe(13); // capped at 1 + 12
  });

  it('draws proportionally to the weights and is deterministic with an injected random', () => {
    const recent = { id: 1, addedAt: today }; // weight 1
    const old = { id: 2, addedAt: longAgo }; // weight 13
    expect(pickWeighted([recent, old], now, () => 0)?.id).toBe(1);
    expect(pickWeighted([recent, old], now, () => 0.5)?.id).toBe(2);
    expect(pickWeighted([recent, old], now, () => 0.999)?.id).toBe(2);
  });

  it('returns null without candidates', () => {
    expect(pickWeighted([], now)).toBeNull();
  });

  it('only draws planned anime that match the filters', async () => {
    const db = await createTestDatabase();
    const userId = await createTestUser(db);
    const short = makeSnapshot({ title: 'Short', episodeCount: 12, episodeLengthMin: 24 }); // 288 min
    const long = makeSnapshot({ title: 'Long', episodeCount: 100, episodeLengthMin: 24 }); // 2400 min
    const movie = makeSnapshot({ title: 'Movie', subtype: 'movie', episodeCount: 1, episodeLengthMin: 120 });
    const unknown = makeSnapshot({ title: 'Unknown', episodeCount: null });
    const watching = makeSnapshot({ title: 'Started' });
    const services = createTestServices(db, [short, long, movie, unknown, watching]);
    for (const snapshot of [short, long, movie, unknown]) {
      await services.library.addFromKitsu(userId, snapshot.kitsuId!, 'planned');
    }
    await services.library.addFromKitsu(userId, watching.kitsuId!, 'watching');

    const underFiveHours = await services.picker.pick(userId, { maxTotalMinutes: 300 }, now);
    expect(underFiveHours.candidateCount).toBe(2); // Short and Movie; Unknown is excluded
    expect(['Short', 'Movie']).toContain(underFiveHours.entry?.media.title);

    const movies = await services.picker.pick(userId, { subtype: 'MOVIE' }, now);
    expect(movies).toMatchObject({ candidateCount: 1, entry: { media: { title: 'Movie' } } });

    const nothing = await services.picker.pick(userId, { maxTotalMinutes: 10 }, now);
    expect(nothing).toEqual({ candidateCount: 0, entry: null });

    const everything = await services.picker.pick(userId, {}, now);
    expect(everything.candidateCount).toBe(4); // the started anime is not "planned"
    await db.close();
  });

  it('matches filters on the total running time', async () => {
    const db = await createTestDatabase();
    const userId = await createTestUser(db);
    const snapshot = makeSnapshot({ episodeCount: 10, episodeLengthMin: 30 });
    const services = createTestServices(db, [snapshot]);
    const entry = await services.library.addFromKitsu(userId, snapshot.kitsuId!, 'planned');
    expect(matchesFilters(entry, { maxTotalMinutes: 300 })).toBe(true);
    expect(matchesFilters(entry, { maxTotalMinutes: 299 })).toBe(false);
    await db.close();
  });
});
