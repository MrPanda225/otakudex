import type { Queryable } from '../db/database.ts';
import type { AnimeSnapshot } from '../kitsu/snapshot.ts';

/**
 * Stores the metadata snapshot of an anime and returns its media id. Snapshots with a Kitsu id are
 * shared by every account: the same anime added twice reuses the row.
 *
 * `trust` says where the snapshot comes from. "provider" (the Kitsu API) refreshes a row that already
 * exists. "untrusted" (a file someone imported) never changes an existing row: otherwise anyone could
 * rewrite what every other account sees by importing a file that claims a known Kitsu id.
 */
export async function upsertMedia(db: Queryable, snapshot: AnimeSnapshot, trust: 'provider' | 'untrusted'): Promise<number> {
  const onConflict =
    trust === 'provider'
      ? `DO UPDATE SET
       title = EXCLUDED.title, title_en = EXCLUDED.title_en, title_ja = EXCLUDED.title_ja,
       synopsis = EXCLUDED.synopsis, subtype = EXCLUDED.subtype, airing_status = EXCLUDED.airing_status,
       episode_count = EXCLUDED.episode_count, episode_length_min = EXCLUDED.episode_length_min,
       start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, genres = EXCLUDED.genres,
       poster_url = EXCLUDED.poster_url, community_score = EXCLUDED.community_score,
       raw = EXCLUDED.raw, fetched_at = now()`
      : 'DO UPDATE SET kitsu_id = media.kitsu_id'; // changes nothing, but lets RETURNING give back the existing row
  const [row] = await db.query<{ id: number }>(
    `INSERT INTO media (kitsu_id, title, title_en, title_ja, synopsis, subtype, airing_status,
                        episode_count, episode_length_min, start_date, end_date, genres,
                        poster_url, community_score, raw, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[], $13, $14, $15::jsonb, now())
     ON CONFLICT (kitsu_id) ${onConflict}
     RETURNING id`,
    [
      snapshot.kitsuId,
      snapshot.title,
      snapshot.titleEn,
      snapshot.titleJa,
      snapshot.synopsis,
      snapshot.subtype,
      snapshot.airingStatus,
      snapshot.episodeCount,
      snapshot.episodeLengthMin,
      snapshot.startDate,
      snapshot.endDate,
      snapshot.genres,
      snapshot.posterUrl,
      snapshot.communityScore,
      JSON.stringify(snapshot.raw ?? null),
    ],
  );
  if (!row) throw new Error('upsertMedia: the database returned no row');
  return row.id;
}
