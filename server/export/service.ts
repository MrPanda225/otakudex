import type { Bucket, Status } from '../../shared/domain.ts';
import { BUCKETS } from '../../shared/domain.ts';
import type { Database } from '../db/database.ts';
import { ConflictError, ValidationError } from '../errors.ts';
import { ENTRY_SELECT, toEntryDtos, type EntryRow } from '../library/mapping.ts';
import { upsertMedia } from '../library/media-repository.ts';
import type { Lang } from '../../shared/i18n/lang.ts';
import { entriesToCsv } from './csv.ts';
import type { ExportedEntry, ExportFile } from './schema.ts';

/** Everything stored about one library entry and its media, as needed to rebuild it exactly. */
interface ExportRow {
  id: number;
  status: Status;
  progress: number;
  rewatch_count: number;
  bucket: Bucket | null;
  rank_position: number | null;
  started_on: string | null;
  completed_on: string | null;
  note: string | null;
  created_at: string;
  kitsu_id: number | null;
  title: string;
  title_en: string | null;
  title_ja: string | null;
  synopsis: string | null;
  subtype: string;
  airing_status: string;
  episode_count: number | null;
  episode_length_min: number | null;
  start_date: string | null;
  end_date: string | null;
  genres: string[];
  poster_url: string | null;
  community_score: number | null;
}

const EXPORT_SELECT = `
  SELECT e.id, e.status, e.progress, e.rewatch_count, e.bucket, e.rank_position,
         e.started_on, e.completed_on, e.note, e.created_at,
         m.kitsu_id, m.title, m.title_en, m.title_ja, m.synopsis, m.subtype, m.airing_status,
         m.episode_count, m.episode_length_min, m.start_date, m.end_date, m.genres, m.poster_url,
         m.community_score::float8 AS community_score
    FROM library_entry e
    JOIN media m ON m.id = e.media_id
   WHERE e.user_id = $1
   ORDER BY e.id`;

/**
 * Checks that ranked entries hold the positions 1..N exactly once, with every bucket in
 * best-to-worst order, and that bucket and position are either both set or both empty.
 * A ranked entry cannot be "planned". Throws ValidationError otherwise, before anything is written.
 */
export function assertValidRanking(entries: readonly Pick<ExportedEntry, 'bucket' | 'rankPosition' | 'status'>[]): void {
  const ranked = entries.filter((entry) => entry.bucket !== null || entry.rankPosition !== null);
  if (ranked.some((entry) => entry.bucket === null || entry.rankPosition === null)) {
    throw new ValidationError('export.rankingIncomplete');
  }
  if (ranked.some((entry) => entry.status === 'planned')) {
    throw new ValidationError('export.plannedRanked');
  }
  const ordered = [...ranked].sort((a, b) => (a.rankPosition ?? 0) - (b.rankPosition ?? 0));
  const hasGapOrDuplicate = ordered.some((entry, index) => entry.rankPosition !== index + 1);
  const bucketRanks = ordered.map((entry) => BUCKETS.indexOf(entry.bucket as Bucket));
  const isBucketOrderBroken = bucketRanks.some((rank, index) => index > 0 && rank < (bucketRanks[index - 1] ?? 0));
  if (hasGapOrDuplicate || isBucketOrderBroken) {
    throw new ValidationError('export.rankingInconsistent');
  }
}

function toExportedEntry(row: ExportRow, log: ExportedEntry['log']): ExportedEntry {
  return {
    media: {
      kitsuId: row.kitsu_id,
      title: row.title,
      titleEn: row.title_en,
      titleJa: row.title_ja,
      synopsis: row.synopsis,
      subtype: row.subtype,
      airingStatus: row.airing_status,
      episodeCount: row.episode_count,
      episodeLengthMin: row.episode_length_min,
      startDate: row.start_date,
      endDate: row.end_date,
      genres: row.genres,
      posterUrl: row.poster_url,
      communityScore: row.community_score,
    },
    status: row.status,
    progress: row.progress,
    rewatchCount: row.rewatch_count,
    bucket: row.bucket,
    rankPosition: row.rank_position,
    startedOn: row.started_on,
    completedOn: row.completed_on,
    note: row.note,
    createdAt: row.created_at,
    log,
  };
}

/** First key of the advisory lock that serialises the restores of one account (the second key is the account). */
const RESTORE_LOCK_NAMESPACE = 7_001;

export function createExportService(db: Database) {
  return {
    async toCsv(userId: number, lang: Lang = 'fr'): Promise<string> {
      const rows = await db.query<EntryRow>(`${ENTRY_SELECT} WHERE e.user_id = $1 ORDER BY e.rank_position NULLS LAST, e.id`, [userId]);
      return entriesToCsv(toEntryDtos(rows), lang);
    },

    async toJson(userId: number, now: Date = new Date()): Promise<ExportFile> {
      const rows = await db.query<ExportRow>(EXPORT_SELECT, [userId]);
      const logs = await db.query<{ entry_id: number; episode_number: number; watched_at: string }>(
        `SELECT w.entry_id, w.episode_number, w.watched_at
           FROM watch_log w
           JOIN library_entry e ON e.id = w.entry_id
          WHERE e.user_id = $1
          ORDER BY w.watched_at, w.id`,
        [userId],
      );
      const logByEntry = Map.groupBy(logs, (log) => log.entry_id);
      const entries = rows.map((row) =>
        toExportedEntry(
          row,
          (logByEntry.get(row.id) ?? []).map((log) => ({ episodeNumber: log.episode_number, watchedAt: log.watched_at })),
        ),
      );
      return { format: 'otakudex-export', version: 1, exportedAt: now.toISOString(), entries };
    },

    /** Restores an export into this person's empty library. Refuses when anything is already there. */
    async restore(userId: number, file: ExportFile): Promise<{ entryCount: number }> {
      assertValidRanking(file.entries);
      await db.transaction(async (tx) => {
        // Two restores of the same account at once must not both see an empty library and both insert.
        // The lock belongs to this account only: other accounts keep reading and writing meanwhile.
        await tx.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [RESTORE_LOCK_NAMESPACE, userId]);
        const [existing] = await tx.query<{ count: number }>('SELECT count(*)::int AS count FROM library_entry WHERE user_id = $1', [userId]);
        if ((existing?.count ?? 0) > 0) {
          throw new ConflictError('export.libraryNotEmpty');
        }
        for (const entry of file.entries) {
          // A file is not a trusted source: it may add an anime nobody has, never change one that exists.
          const mediaId = await upsertMedia(tx, { ...entry.media, raw: null }, 'untrusted');
          const [inserted] = await tx.query<{ id: number }>(
            `INSERT INTO library_entry (media_id, status, progress, rewatch_count, bucket, rank_position,
                                       started_on, completed_on, note, created_at, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
              mediaId, entry.status, entry.progress, entry.rewatchCount, entry.bucket, entry.rankPosition,
              entry.startedOn, entry.completedOn, entry.note, entry.createdAt, userId,
            ],
          );
          if (!inserted || entry.log.length === 0) continue;
          await tx.query(
            `INSERT INTO watch_log (entry_id, episode_number, watched_at)
             SELECT $1, u.episode_number, u.watched_at
               FROM unnest($2::int[], $3::timestamptz[]) AS u(episode_number, watched_at)`,
            [inserted.id, entry.log.map((log) => log.episodeNumber), entry.log.map((log) => log.watchedAt)],
          );
        }
      });
      return { entryCount: file.entries.length };
    },
  };
}

export type ExportService = ReturnType<typeof createExportService>;
