import type {
  EntryDto,
  EntryPatch,
  EpisodeResultDto,
  ManualAnimeInput,
  SearchResultDto,
  Status,
} from '../../shared/domain.ts';
import type { Database, Queryable } from '../db/database.ts';
import { MAX_EPISODES, MAX_LIBRARY_ENTRIES } from '../../shared/limits.ts';
import { ConflictError, NotFoundError } from '../errors.ts';
import type { AnimeSnapshot, MetadataProvider } from '../kitsu/snapshot.ts';
import { releaseRank } from '../ranking/ranks.ts';
import { ENTRY_SELECT, toEntryDtos, type EntryRow } from './mapping.ts';
import { upsertMedia } from './media-repository.ts';
import { resolvePatch } from './patch.ts';

export interface LibraryServiceDeps {
  db: Database;
  provider: MetadataProvider;
  /** IANA time zone deciding which calendar day "today" is. */
  timezone: string;
}

const TODAY_SQL = '(now() AT TIME ZONE $TZ)::date';

/** Column written for each patchable field. A fixed map: field names never come from user input. */
const PATCH_COLUMNS: Record<keyof EntryPatch, string> = {
  status: 'status',
  progress: 'progress',
  rewatchCount: 'rewatch_count',
  startedOn: 'started_on',
  completedOn: 'completed_on',
  note: 'note',
};

export function createLibraryService({ db, provider, timezone }: LibraryServiceDeps) {
  // Every function below takes the owner first: a person only ever reaches their own entries, and an
  // entry of someone else is "not found", exactly like one that does not exist.
  async function listEntries(q: Queryable, userId: number): Promise<EntryDto[]> {
    const rows = await q.query<EntryRow>(`${ENTRY_SELECT} WHERE e.user_id = $1 ORDER BY e.id`, [userId]);
    return toEntryDtos(rows);
  }

  async function getEntry(q: Queryable, userId: number, entryId: number): Promise<EntryDto> {
    const entry = (await listEntries(q, userId)).find((candidate) => candidate.id === entryId);
    if (!entry) throw new NotFoundError('library.entryNotFound');
    return entry;
  }

  async function lockEntryRow(tx: Queryable, userId: number, entryId: number): Promise<EntryRow> {
    const [row] = await tx.query<EntryRow>(`${ENTRY_SELECT} WHERE e.id = $1 AND e.user_id = $2 FOR UPDATE OF e`, [entryId, userId]);
    if (!row) throw new NotFoundError('library.entryNotFound');
    return row;
  }

  /** SQL for "today" in the configured time zone, taking its parameter at `$index`. */
  function today(index: number): string {
    return TODAY_SQL.replace('$TZ', `$${index}`);
  }

  async function insertEntry(tx: Queryable, userId: number, snapshot: AnimeSnapshot, status: Status): Promise<number> {
    const [owned] = await tx.query<{ count: number }>('SELECT count(*)::int AS count FROM library_entry WHERE user_id = $1', [userId]);
    if ((owned?.count ?? 0) >= MAX_LIBRARY_ENTRIES) {
      throw new ConflictError('library.limitReached', { max: MAX_LIBRARY_ENTRIES });
    }
    // The snapshot comes from the provider (or has no Kitsu id, for an anime added by hand): it may refresh the shared row.
    const mediaId = await upsertMedia(tx, snapshot, 'provider');
    const [existing] = await tx.query('SELECT id FROM library_entry WHERE media_id = $1 AND user_id = $2', [mediaId, userId]);
    if (existing) throw new ConflictError('library.alreadyIn');

    const progress = status === 'completed' && snapshot.episodeCount !== null ? snapshot.episodeCount : 0;
    const [row] = await tx.query<{ id: number }>(
      `INSERT INTO library_entry (user_id, media_id, status, progress, started_on)
       VALUES ($5, $1, $2, $3, CASE WHEN $2 = 'watching' THEN ${today(4)} END)
       RETURNING id`,
      [mediaId, status, progress, timezone, userId],
    );
    if (!row) throw new Error('insertEntry: the database returned no row');
    return row.id;
  }

  return {
    list: (userId: number) => listEntries(db, userId),

    get: (userId: number, entryId: number) => getEntry(db, userId, entryId),

    /** Searches Kitsu and flags the results already in this person's library. */
    async search(userId: number, query: string): Promise<SearchResultDto[]> {
      const snapshots = await provider.search(query);
      const kitsuIds = snapshots.flatMap((snapshot) => snapshot.kitsuId ?? []);
      const owned = await db.query<{ kitsu_id: number }>(
        `SELECT m.kitsu_id FROM library_entry e JOIN media m ON m.id = e.media_id
          WHERE e.user_id = $2 AND m.kitsu_id = ANY($1::int[])`,
        [kitsuIds, userId],
      );
      const ownedIds = new Set(owned.map((row) => row.kitsu_id));
      return snapshots.flatMap((snapshot) =>
        snapshot.kitsuId === null
          ? []
          : [
              {
                kitsuId: snapshot.kitsuId,
                title: snapshot.title,
                subtype: snapshot.subtype,
                year: snapshot.startDate ? Number(snapshot.startDate.slice(0, 4)) : null,
                episodeCount: snapshot.episodeCount,
                posterUrl: snapshot.posterThumbUrl ?? snapshot.posterUrl,
                isInLibrary: ownedIds.has(snapshot.kitsuId),
              },
            ],
      );
    },

    async addFromKitsu(userId: number, kitsuId: number, status: Status): Promise<EntryDto> {
      const snapshot = await provider.getById(kitsuId);
      if (!snapshot) throw new NotFoundError('library.notOnKitsu');
      const entryId = await db.transaction((tx) => insertEntry(tx, userId, snapshot, status));
      return getEntry(db, userId, entryId);
    },

    async addManual(userId: number, input: ManualAnimeInput): Promise<EntryDto> {
      const snapshot: AnimeSnapshot = {
        kitsuId: null,
        title: input.title,
        titleEn: null,
        titleJa: null,
        synopsis: null,
        subtype: 'unknown',
        airingStatus: 'unknown',
        episodeCount: input.episodeCount,
        episodeLengthMin: input.episodeLengthMin,
        startDate: null,
        endDate: null,
        genres: [],
        posterUrl: null,
        communityScore: null,
        raw: null,
      };
      const entryId = await db.transaction((tx) => insertEntry(tx, userId, snapshot, input.status));
      return getEntry(db, userId, entryId);
    },

    async update(userId: number, entryId: number, patch: EntryPatch): Promise<EntryDto> {
      await db.transaction(async (tx) => {
        const current = await lockEntryRow(tx, userId, entryId);
        const resolved = resolvePatch(
          { status: current.status, progress: current.progress, episodeCount: current.episode_count },
          patch,
        );
        if (resolved.status === 'planned') await releaseRank(tx, userId, entryId);
        await writePatch(tx, userId, entryId, resolved);
      });
      return getEntry(db, userId, entryId);
    },

    async remove(userId: number, entryId: number): Promise<void> {
      await db.transaction(async (tx) => {
        await lockEntryRow(tx, userId, entryId);
        await releaseRank(tx, userId, entryId);
        await tx.query('DELETE FROM library_entry WHERE id = $1 AND user_id = $2', [entryId, userId]);
      });
    },

    /** Marks the next episode as watched and logs it with the current time. */
    async markEpisode(userId: number, entryId: number): Promise<EpisodeResultDto> {
      const justCompleted = await db.transaction(async (tx) => {
        const current = await lockEntryRow(tx, userId, entryId);
        const nextEpisode = current.progress + 1;
        const total = current.episode_count;
        if (total !== null && nextEpisode > total) {
          throw new ConflictError('library.allEpisodesSeen');
        }
        if (nextEpisode > MAX_EPISODES) {
          throw new ConflictError('library.episodeLimit', { max: MAX_EPISODES });
        }
        const isLastEpisode = total !== null && nextEpisode === total;
        const status: Status = isLastEpisode ? 'completed' : current.status === 'completed' ? 'completed' : 'watching';

        await tx.query('INSERT INTO watch_log (entry_id, episode_number) VALUES ($1, $2)', [entryId, nextEpisode]);
        await tx.query(
          `UPDATE library_entry
              SET progress = $2, status = $3,
                  started_on = coalesce(started_on, ${today(4)}),
                  completed_on = CASE WHEN $3 = 'completed' AND $5 THEN ${today(4)} ELSE completed_on END,
                  updated_at = now()
            WHERE id = $1 AND user_id = $6`,
          [entryId, nextEpisode, status, timezone, isLastEpisode, userId],
        );
        return isLastEpisode;
      });
      return { entry: await getEntry(db, userId, entryId), justCompleted };
    },

    /** Cancels the most recent logged episode of an entry. */
    async undoEpisode(userId: number, entryId: number): Promise<EntryDto> {
      await db.transaction(async (tx) => {
        const current = await lockEntryRow(tx, userId, entryId);
        const removed = await tx.query(
          `DELETE FROM watch_log
            WHERE id = (SELECT id FROM watch_log WHERE entry_id = $1
                         ORDER BY watched_at DESC, id DESC LIMIT 1)
        RETURNING id`,
          [entryId],
        );
        if (removed.length === 0 || current.progress === 0) {
          throw new ConflictError('library.nothingToUndo');
        }
        await tx.query(
          `UPDATE library_entry
              SET progress = progress - 1,
                  status = CASE WHEN status = 'completed' THEN 'watching' ELSE status END,
                  completed_on = CASE WHEN status = 'completed' THEN NULL ELSE completed_on END,
                  updated_at = now()
            WHERE id = $1 AND user_id = $2`,
          [entryId, userId],
        );
      });
      return getEntry(db, userId, entryId);
    },
  };
}

export type LibraryService = ReturnType<typeof createLibraryService>;

async function writePatch(tx: Queryable, userId: number, entryId: number, patch: EntryPatch): Promise<void> {
  const assignments: string[] = [];
  const params: unknown[] = [entryId, userId];
  for (const [field, column] of Object.entries(PATCH_COLUMNS) as [keyof EntryPatch, string][]) {
    const value = patch[field];
    if (value === undefined) continue;
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  }
  if (assignments.length === 0) return;
  await tx.query(`UPDATE library_entry SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1 AND user_id = $2`, params);
}
