import type { Bucket, EntryDto, MediaDto, Status } from '../../shared/domain.ts';
import { withScores } from '../ranking/scores.ts';

/** One joined library_entry + media row, as selected by ENTRY_SELECT. */
export interface EntryRow {
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
  last_activity_at: string | null;
  media_id: number;
  kitsu_id: number | null;
  title: string;
  title_en: string | null;
  title_ja: string | null;
  synopsis: string | null;
  subtype: string;
  episode_count: number | null;
  episode_length_min: number | null;
  start_date: string | null;
  genres: string[];
  poster_url: string | null;
  community_score: number | null;
}

export const ENTRY_SELECT = `
  SELECT e.id, e.status, e.progress, e.rewatch_count, e.bucket, e.rank_position,
         e.started_on, e.completed_on, e.note, e.created_at,
         (SELECT max(w.watched_at) FROM watch_log w WHERE w.entry_id = e.id) AS last_activity_at,
         m.id AS media_id, m.kitsu_id, m.title, m.title_en, m.title_ja, m.synopsis, m.subtype,
         m.episode_count, m.episode_length_min, m.start_date, m.genres, m.poster_url,
         m.community_score::float8 AS community_score
    FROM library_entry e
    JOIN media m ON m.id = e.media_id`;

function toMediaDto(row: EntryRow): MediaDto {
  return {
    id: row.media_id,
    kitsuId: row.kitsu_id,
    title: row.title,
    titleEn: row.title_en,
    titleJa: row.title_ja,
    synopsis: row.synopsis,
    subtype: row.subtype,
    episodeCount: row.episode_count,
    episodeLengthMin: row.episode_length_min,
    startDate: row.start_date,
    genres: row.genres,
    posterUrl: row.poster_url,
    communityScore: row.community_score,
  };
}

/** Maps joined rows to DTOs and fills in the scores, which depend on the whole ranking. */
export function toEntryDtos(rows: readonly EntryRow[]): EntryDto[] {
  const entries = rows.map((row) => ({
    id: row.id,
    status: row.status,
    progress: row.progress,
    rewatchCount: row.rewatch_count,
    bucket: row.bucket,
    rankPosition: row.rank_position,
    startedOn: row.started_on,
    completedOn: row.completed_on,
    note: row.note,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    media: toMediaDto(row),
  }));
  return withScores(entries);
}
