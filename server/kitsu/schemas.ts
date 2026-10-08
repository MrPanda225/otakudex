import { z } from 'zod';
import { normalizePosterUrl } from './poster-url.ts';
import type { AnimeSnapshot, TrendingCover } from './snapshot.ts';

const MAX_GENRES = 8;
/**
 * Kitsu "categories" mix genres with settings and very specific tags ("Asia", "Plot Continuity").
 * Only the well-known genres and demographics below are kept, so the genre stats stay readable.
 */
export const KEPT_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi',
  'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Psychological', 'Mecha', 'Music', 'Historical',
  'Ecchi', 'Magic', 'School Life', 'Martial Arts', 'Military', 'Police', 'Parody', 'Space', 'Super Power',
  'Vampire', 'Samurai', 'Game', 'Harem', 'Cyberpunk', 'Post Apocalypse', 'Isekai', 'Survival', 'Time Travel',
  'Detective', 'Idol', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kids',
] as const;
const GENRE_NAMES = new Set(KEPT_GENRES.map((name) => name.toLowerCase()));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const posterSchema = z.object({
  small: z.string().nullish(),
  medium: z.string().nullish(),
  large: z.string().nullish(),
  original: z.string().nullish(),
});

const animeResourceSchema = z.object({
  id: z.string(),
  attributes: z.object({
    canonicalTitle: z.string(),
    titles: z.record(z.string(), z.string().nullish()).nullish(),
    synopsis: z.string().nullish(),
    subtype: z.string().nullish(),
    status: z.string().nullish(),
    episodeCount: z.number().nullish(),
    episodeLength: z.number().nullish(),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
    averageRating: z.string().nullish(),
    posterImage: posterSchema.nullish(),
  }),
  relationships: z
    .object({
      categories: z
        .object({ data: z.array(z.object({ id: z.string(), type: z.string() })).nullish() })
        .nullish(),
    })
    .nullish(),
});

const includedSchema = z.array(
  z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.object({ title: z.string().nullish() }).nullish(),
  }),
);

export const searchResponseSchema = z.object({
  data: z.array(animeResourceSchema),
  included: includedSchema.nullish(),
});

export const detailResponseSchema = z.object({
  data: animeResourceSchema,
  included: includedSchema.nullish(),
});

type AnimeResource = z.infer<typeof animeResourceSchema>;
type IncludedResource = z.infer<typeof includedSchema>;

/** Converts one validated Kitsu resource into the provider-neutral snapshot. */
export function toSnapshot(resource: AnimeResource, included: IncludedResource = []): AnimeSnapshot {
  const { attributes } = resource;
  const kitsuId = Number(resource.id);
  return {
    kitsuId: Number.isInteger(kitsuId) ? kitsuId : null,
    title: attributes.canonicalTitle,
    titleEn: attributes.titles?.['en'] ?? null,
    titleJa: attributes.titles?.['ja_jp'] ?? null,
    synopsis: attributes.synopsis ?? null,
    subtype: attributes.subtype ?? 'unknown',
    airingStatus: attributes.status ?? 'unknown',
    episodeCount: positiveIntegerOrNull(attributes.episodeCount),
    episodeLengthMin: positiveIntegerOrNull(attributes.episodeLength),
    startDate: isoDateOrNull(attributes.startDate),
    endDate: isoDateOrNull(attributes.endDate),
    genres: readGenres(resource, included),
    posterUrl: pickPosterUrl(attributes.posterImage),
    posterThumbUrl: attributes.posterImage?.small ?? null,
    communityScore: parseScore(attributes.averageRating),
    raw: { data: resource, included },
  };
}

function readGenres(resource: AnimeResource, included: IncludedResource): string[] {
  const titleByKey = new Map(included.map((item) => [`${item.type}:${item.id}`, item.attributes?.title ?? null] as const));
  const links = resource.relationships?.categories?.data ?? [];
  const titles = links
    .flatMap((link) => titleByKey.get(`${link.type}:${link.id}`) ?? [])
    .filter((title) => GENRE_NAMES.has(title.toLowerCase()));
  return [...new Set(titles)].slice(0, MAX_GENRES);
}

function pickPosterUrl(poster: z.infer<typeof posterSchema> | null | undefined): string | null {
  return poster?.medium ?? poster?.small ?? poster?.large ?? poster?.original ?? null;
}

function positiveIntegerOrNull(value: number | null | undefined): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}

function isoDateOrNull(value: string | null | undefined): string | null {
  return value && ISO_DATE.test(value) ? value : null;
}

function parseScore(value: string | null | undefined): number | null {
  if (!value) return null;
  const score = Number.parseFloat(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

// ---- Trending ------------------------------------------------------------------------------------------

const ADULT_AGE_RATING = 'R18';

export const trendingResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({
        canonicalTitle: z.string().nullish(),
        nsfw: z.boolean().nullish(),
        ageRating: z.string().nullish(),
        posterImage: z.object({ tiny: z.string().nullish(), small: z.string().nullish() }).nullish(),
      }),
    }),
  ),
});

/**
 * The covers of the trending anime that may be shown to anybody: not marked "nsfw", not rated R18, with a
 * cover on the allowed image host. The smallest cover is taken (about 11 KB): it is a dimmed backdrop.
 */
export function toTrendingCovers(body: z.infer<typeof trendingResponseSchema>, limit: number): TrendingCover[] {
  const covers: TrendingCover[] = [];
  const seen = new Set<number>();
  for (const { id, attributes } of body.data) {
    const kitsuId = Number(id);
    const poster = attributes.posterImage?.tiny ?? attributes.posterImage?.small ?? null;
    const posterUrl = poster === null ? null : normalizePosterUrl(poster);
    const isAdult = attributes.nsfw === true || attributes.ageRating === ADULT_AGE_RATING;
    if (!Number.isInteger(kitsuId) || seen.has(kitsuId) || posterUrl === null || isAdult) continue;
    seen.add(kitsuId);
    covers.push({ kitsuId, title: attributes.canonicalTitle ?? '', posterUrl });
    if (covers.length >= limit) break;
  }
  return covers;
}
