/** Types and constants shared by the server and the web client. Types only: no runtime logic here. */

export const STATUSES = ['planned', 'watching', 'completed', 'paused', 'dropped'] as const;
export type Status = (typeof STATUSES)[number];

/** Taste buckets, ordered from best to worst. The order matters: it defines the global ranking. */
export const BUCKETS = ['loved', 'liked', 'meh'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];

export interface MediaDto {
  id: number;
  kitsuId: number | null;
  title: string;
  titleEn: string | null;
  titleJa: string | null;
  synopsis: string | null;
  subtype: string;
  episodeCount: number | null;
  episodeLengthMin: number | null;
  startDate: string | null;
  genres: string[];
  posterUrl: string | null;
  communityScore: number | null;
}

export interface EntryDto {
  id: number;
  status: Status;
  progress: number;
  rewatchCount: number;
  bucket: Bucket | null;
  rankPosition: number | null;
  /** 0-100, derived from the rank inside the bucket. Null when the entry is not ranked. */
  score: number | null;
  tier: Tier | null;
  startedOn: string | null;
  completedOn: string | null;
  note: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  media: MediaDto;
}

export interface SearchResultDto {
  kitsuId: number;
  title: string;
  subtype: string;
  year: number | null;
  episodeCount: number | null;
  posterUrl: string | null;
  isInLibrary: boolean;
}

export interface EpisodeResultDto {
  entry: EntryDto;
  /** True when this episode was the last one and the entry just became "completed". */
  justCompleted: boolean;
}

export interface DuelCandidateDto {
  entryId: number;
  title: string;
  posterUrl: string | null;
}

export interface StatsDto {
  totalEntries: number;
  byStatus: Record<Status, number>;
  episodesWatched: number;
  minutesWatched: number;
  /** Entries with progress whose episode length is unknown, so excluded from minutesWatched. */
  entriesWithoutDuration: number;
  /** Episodes still to watch in "planned", "watching" and "paused" anime whose episode count is known. */
  backlogEpisodes: number;
  /** The same, in minutes, for those whose episode length is also known. */
  backlogMinutes: number;
  /** Backlog anime missing an episode count or length, so absent from the two figures above. */
  backlogUnknownCount: number;
  rankedCount: number;
  averageScore: number | null;
  scoreDistribution: { from: number; to: number; count: number }[];
  topGenres: { genre: string; count: number }[];
  heatmap: { day: string; episodes: number }[];
  longestWeekStreak: number;
  currentWeekStreak: number;
}

export interface PickerResultDto {
  candidateCount: number;
  entry: EntryDto | null;
}

/** Fields of a library entry the user can edit. Omitted fields are left unchanged. */
export interface EntryPatch {
  status?: Status;
  progress?: number;
  rewatchCount?: number;
  startedOn?: string | null;
  completedOn?: string | null;
  note?: string | null;
}

export interface ManualAnimeInput {
  title: string;
  episodeCount: number | null;
  episodeLengthMin: number | null;
  status: Status;
}

export interface PickerFilters {
  /** Longest total running time accepted, in minutes. Anime with an unknown duration are excluded. */
  maxTotalMinutes?: number;
  subtype?: string;
}

// ---- Accounts ---------------------------------------------------------------------------------------

export type Role = 'admin' | 'member';

/** The signed-in person, as the interface knows them. Never carries anything secret. */
export interface AccountUserDto {
  id: number;
  email: string;
  displayName: string;
  role: Role;
}

/** What the interface must show first: a first-account form, the sign-in form, or the application. */
export type AuthStateDto =
  | { phase: 'setup'; legacyEntryCount: number; needsSetupCode: boolean }
  | { phase: 'signed-out' }
  | { phase: 'signed-in'; user: AccountUserDto };

export interface MemberDto extends AccountUserDto {
  isDisabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export type InvitationState = 'pending' | 'used' | 'expired' | 'revoked';

export interface InvitationDto {
  id: number;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  state: InvitationState;
}

/** A link's secret, shown to the administrator once, when the link is created. */
export interface IssuedLinkDto {
  token: string;
  expiresAt: string;
}

export type LinkKind = 'invitation' | 'reset';

/** What a link says about itself, before anyone uses it. */
export interface LinkPreviewDto {
  kind: LinkKind;
  /** The person who sent an invitation. */
  inviterName: string | null;
  /** The administrator's note on an invitation (the first name of the person it is for). */
  label: string | null;
  /** The account a reset link is for. */
  accountName: string | null;
}
