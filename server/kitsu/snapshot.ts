/**
 * What we keep about an anime, whatever the metadata provider is. Provider code converts its own
 * format into this shape; the rest of the app never sees a provider-specific field.
 */
export interface AnimeSnapshot {
  /** Provider identifier. Null for entries typed in by hand. */
  kitsuId: number | null;
  title: string;
  titleEn: string | null;
  titleJa: string | null;
  synopsis: string | null;
  subtype: string;
  airingStatus: string;
  episodeCount: number | null;
  episodeLengthMin: number | null;
  startDate: string | null;
  endDate: string | null;
  genres: string[];
  posterUrl: string | null;
  communityScore: number | null;
  /** Small cover for lists. Not stored: only search results use it. */
  posterThumbUrl?: string | null;
  /** Untouched provider payload, kept so new fields can be read later without calling the API. */
  raw: unknown;
}

/** A cover of an anime that is popular right now, with what a public screen needs and nothing more. */
export interface TrendingCover {
  kitsuId: number;
  title: string;
  /** A small cover on the allowed image host. */
  posterUrl: string;
}

export interface MetadataProvider {
  search(query: string): Promise<AnimeSnapshot[]>;
  getById(kitsuId: number): Promise<AnimeSnapshot | null>;
  /** Anime popular right now, fit for a screen anybody can see (nothing adult, nothing without a cover). */
  trendingPosters(limit: number): Promise<TrendingCover[]>;
}
