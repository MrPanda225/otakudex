import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Bucket } from '../shared/domain.ts';
import { BUCKETS } from '../shared/domain.ts';
import type { Database } from '../server/db/database.ts';
import { NotFoundError, ValidationError } from '../server/errors.ts';
import { computeInsertPosition, emptyBucketCounts } from '../server/ranking/positions.ts';
import { withScores } from '../server/ranking/scores.ts';
import { createTestDatabase, createTestServices, makeSnapshot, createTestUser } from './helpers.ts';

describe('computeInsertPosition', () => {
  const counts = { loved: 2, liked: 3, meh: 1 };

  it('puts the first of a bucket right after every better bucket', () => {
    expect(computeInsertPosition(counts, 'loved', 0)).toBe(1);
    expect(computeInsertPosition(counts, 'liked', 0)).toBe(3);
    expect(computeInsertPosition(counts, 'meh', 0)).toBe(6);
  });

  it('allows inserting at the end of a bucket', () => {
    expect(computeInsertPosition(counts, 'liked', 3)).toBe(6);
  });

  it('refuses an index outside the bucket', () => {
    expect(() => computeInsertPosition(counts, 'meh', 2)).toThrow(ValidationError);
    expect(() => computeInsertPosition(counts, 'loved', -1)).toThrow(ValidationError);
    expect(() => computeInsertPosition(emptyBucketCounts(), 'loved', 0.5)).toThrow(ValidationError);
  });
});

describe('withScores', () => {
  it('scores ranked items per bucket and leaves the others null', () => {
    const items = [
      { id: 1, bucket: 'loved' as Bucket, rankPosition: 1 },
      { id: 2, bucket: 'loved' as Bucket, rankPosition: 2 },
      { id: 3, bucket: 'meh' as Bucket, rankPosition: 3 },
      { id: 4, bucket: null, rankPosition: null },
    ];
    const scored = withScores(items);
    expect(scored.map((item) => item.score)).toEqual([100, 70, 39, null]);
    expect(scored.map((item) => item.tier)).toEqual(['S', 'B', 'D', null]);
    expect(items[0]).not.toHaveProperty('score'); // input is not mutated
  });
});

describe('ranking service', () => {
  let db: Database;
  let userId: number;
  let services: ReturnType<typeof createTestServices>;

  /** Reads ranked entries best first as [title, bucket, position]. */
  async function readRanking() {
    const entries = await services.library.list(userId);
    return entries
      .filter((entry) => entry.rankPosition !== null)
      .sort((a, b) => a.rankPosition! - b.rankPosition!)
      .map((entry) => [entry.media.title, entry.bucket, entry.rankPosition] as const);
  }

  async function expectInvariants() {
    const ranking = await readRanking();
    expect(ranking.map(([, , position]) => position)).toEqual(ranking.map((_, index) => index + 1));
    const bucketOrder = ranking.map(([, bucket]) => BUCKETS.indexOf(bucket as Bucket));
    expect(bucketOrder).toEqual([...bucketOrder].sort((a, b) => a - b));
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    userId = await createTestUser(db);
  });
  afterEach(() => db.close());

  /** Adds one completed anime per title and returns their entry ids by title. */
  async function setUp(titles: string[]) {
    const snapshots = titles.map((title) => makeSnapshot({ title }));
    services = createTestServices(db, snapshots);
    const ids: Record<string, number> = {};
    for (const snapshot of snapshots) {
      ids[snapshot.title] = (await services.library.addFromKitsu(userId, snapshot.kitsuId!, 'completed')).id;
    }
    return ids;
  }

  it('ranks entries across buckets while keeping positions consecutive', async () => {
    const id = await setUp(['A', 'B', 'C', 'D']);
    await services.ranking.place(userId, id['A']!, 'liked', 0);
    await services.ranking.place(userId, id['B']!, 'loved', 0);
    await services.ranking.place(userId, id['C']!, 'meh', 0);
    await services.ranking.place(userId, id['D']!, 'liked', 0); // best of "liked", above A

    expect(await readRanking()).toEqual([
      ['B', 'loved', 1],
      ['D', 'liked', 2],
      ['A', 'liked', 3],
      ['C', 'meh', 4],
    ]);
    await expectInvariants();
  });

  it('gives the right scores to the ranked entries', async () => {
    const id = await setUp(['A', 'B']);
    await services.ranking.place(userId, id['A']!, 'loved', 0);
    await services.ranking.place(userId, id['B']!, 'loved', 1);
    const entries = await services.library.list(userId);
    expect(entries.map((entry) => [entry.media.title, entry.score, entry.tier])).toEqual([
      ['A', 100, 'S'],
      ['B', 70, 'B'],
    ]);
  });

  it('moves an already ranked entry when it is ranked again', async () => {
    const id = await setUp(['A', 'B', 'C']);
    await services.ranking.place(userId, id['A']!, 'loved', 0);
    await services.ranking.place(userId, id['B']!, 'loved', 1);
    await services.ranking.place(userId, id['C']!, 'loved', 2);
    await services.ranking.place(userId, id['C']!, 'meh', 0);

    expect(await readRanking()).toEqual([
      ['A', 'loved', 1],
      ['B', 'loved', 2],
      ['C', 'meh', 3],
    ]);
    await expectInvariants();
  });

  it('closes the gap when an entry is unranked or removed', async () => {
    const id = await setUp(['A', 'B', 'C']);
    for (const [index, title] of ['A', 'B', 'C'].entries()) {
      await services.ranking.place(userId, id[title]!, 'liked', index);
    }
    await services.ranking.unrank(userId, id['A']!);
    await services.library.remove(userId, id['B']!);

    expect(await readRanking()).toEqual([['C', 'liked', 1]]);
  });

  it('drops the rank of an anime put back to "planned"', async () => {
    const id = await setUp(['A', 'B']);
    await services.ranking.place(userId, id['A']!, 'loved', 0);
    await services.ranking.place(userId, id['B']!, 'loved', 1);
    await services.library.update(userId, id['A']!, { status: 'planned' });

    expect(await readRanking()).toEqual([['B', 'loved', 1]]);
  });

  it('keeps the ranking intact when an insertion index is invalid', async () => {
    const id = await setUp(['A', 'B']);
    await services.ranking.place(userId, id['A']!, 'loved', 0);
    await expect(services.ranking.place(userId, id['B']!, 'loved', 5)).rejects.toBeInstanceOf(ValidationError);
    expect(await readRanking()).toEqual([['A', 'loved', 1]]);
  });

  it('refuses to rank an anime that is only planned, or that does not exist', async () => {
    const snapshot = makeSnapshot({ title: 'Later' });
    services = createTestServices(db, [snapshot]);
    const planned = await services.library.addFromKitsu(userId, snapshot.kitsuId!, 'planned');

    await expect(services.ranking.place(userId, planned.id, 'loved', 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(services.ranking.place(userId, 999, 'loved', 0)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists duel candidates best first, leaving out the entry being ranked', async () => {
    const id = await setUp(['A', 'B', 'C']);
    await services.ranking.place(userId, id['A']!, 'loved', 0);
    await services.ranking.place(userId, id['B']!, 'loved', 1);
    await services.ranking.place(userId, id['C']!, 'loved', 2);

    const candidates = await services.ranking.listCandidates(userId, 'loved', id['B']!);
    expect(candidates.map((candidate) => candidate.title)).toEqual(['A', 'C']);
  });
});
