import { z } from 'zod';
import { BUCKETS, STATUSES } from '../../shared/domain.ts';
import { MAX_EPISODES, MAX_LIBRARY_ENTRIES } from '../../shared/limits.ts';
import { isAllowedPosterUrl } from '../kitsu/poster-url.ts';

const MAX_ENTRIES = MAX_LIBRARY_ENTRIES;
const MAX_LOG_ROWS_PER_ENTRY = 5_000;
// Same ceilings as the API (shared/limits.ts): a file must not hold what the app refuses to take.
const MAX_EPISODE_LENGTH_MIN = 600;
const MAX_REWATCHES = 1_000;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableDate = isoDate.nullable();

const exportedMediaSchema = z.object({
  kitsuId: z.number().int().positive().nullable(),
  title: z.string().min(1).max(500),
  titleEn: z.string().max(500).nullable(),
  titleJa: z.string().max(500).nullable(),
  synopsis: z.string().max(20_000).nullable(),
  subtype: z.string().max(40),
  airingStatus: z.string().max(40),
  episodeCount: z.number().int().positive().max(MAX_EPISODES).nullable(),
  episodeLengthMin: z.number().int().positive().max(MAX_EPISODE_LENGTH_MIN).nullable(),
  startDate: nullableDate,
  endDate: nullableDate,
  genres: z.array(z.string().max(80)).max(40),
  posterUrl: z.string().max(2_000).refine(isAllowedPosterUrl, 'Adresse de couverture non autorisée').nullable(),
  communityScore: z.number().min(0).max(100).nullable(),
});

const timestamp = z.iso.datetime({ offset: true });

const exportedEntrySchema = z
  .object({
    media: exportedMediaSchema,
    status: z.enum(STATUSES),
    progress: z.number().int().min(0).max(MAX_EPISODES),
    rewatchCount: z.number().int().min(0).max(MAX_REWATCHES),
    bucket: z.enum(BUCKETS).nullable(),
    rankPosition: z.number().int().positive().max(MAX_ENTRIES).nullable(),
    startedOn: nullableDate,
    completedOn: nullableDate,
    note: z.string().max(5_000).nullable(),
    createdAt: timestamp,
    log: z
      .array(z.object({ episodeNumber: z.number().int().positive().max(MAX_EPISODES), watchedAt: timestamp }))
      .max(MAX_LOG_ROWS_PER_ENTRY),
  })
  .refine((entry) => entry.media.episodeCount === null || entry.progress <= entry.media.episodeCount, {
    message: 'La progression dépasse le nombre d’épisodes',
    path: ['progress'],
  });

export const exportFileSchema = z.object({
  format: z.literal('otakudex-export'),
  version: z.literal(1),
  exportedAt: z.string(),
  entries: z.array(exportedEntrySchema).max(MAX_ENTRIES),
});

export type ExportFile = z.infer<typeof exportFileSchema>;
export type ExportedEntry = z.infer<typeof exportedEntrySchema>;
