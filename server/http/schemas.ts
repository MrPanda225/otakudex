import { z } from 'zod';
import { BUCKETS, STATUSES } from '../../shared/domain.ts';
import { LANGS } from '../../shared/i18n/lang.ts';
import { MAX_EPISODES } from '../../shared/limits.ts';
import { MAX_BACKDROP_IMAGES } from '../backdrop/service.ts';

const MAX_NOTE_LENGTH = 5_000;

/** A real calendar date written 'YYYY-MM-DD' (rejects 2023-02-31). */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Date invalide');

const positiveId = z.coerce.number().int().positive();

export const idParams = z.object({ id: positiveId });

export const searchQuery = z.object({ q: z.string().trim().min(2).max(100) });

export const addFromKitsuBody = z.strictObject({
  kitsuId: z.number().int().positive(),
  status: z.enum(STATUSES),
});

export const addManualBody = z.strictObject({
  title: z.string().trim().min(1).max(200),
  episodeCount: z.number().int().positive().max(MAX_EPISODES).nullable().default(null),
  episodeLengthMin: z.number().int().positive().max(600).nullable().default(null),
  status: z.enum(STATUSES),
});

export const patchEntryBody = z.strictObject({
  status: z.enum(STATUSES).optional(),
  progress: z.number().int().min(0).max(MAX_EPISODES).optional(),
  rewatchCount: z.number().int().min(0).max(1_000).optional(),
  startedOn: calendarDate.nullable().optional(),
  completedOn: calendarDate.nullable().optional(),
  note: z.string().max(MAX_NOTE_LENGTH).nullable().optional(),
});

/** The language a text is wanted in. */
export const langQuery = z.object({ lang: z.enum(LANGS) });

/** The language of an export file, when a download link has to say it in the address. */
export const csvQuery = z.object({ lang: z.enum(LANGS).optional() });

export const backdropIndexParams = z.object({ index: z.coerce.number().int().min(0).max(MAX_BACKDROP_IMAGES - 1) });

export const candidatesQuery = z.object({
  bucket: z.enum(BUCKETS),
  exclude: positiveId.optional(),
});

export const placeRankBody = z.strictObject({
  bucket: z.enum(BUCKETS),
  index: z.number().int().min(0).max(MAX_EPISODES),
});

export const pickerQuery = z.object({
  maxMinutes: z.coerce.number().int().positive().max(1_000_000).optional(),
  subtype: z.string().trim().min(1).max(40).optional(),
});

export const posterQuery = z.object({ url: z.string().max(2_000) });
