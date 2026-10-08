import type {
  AccountUserDto,
  AuthStateDto,
  Bucket,
  DuelCandidateDto,
  EntryDto,
  EntryPatch,
  EpisodeResultDto,
  InvitationDto,
  IssuedLinkDto,
  LinkKind,
  LinkPreviewDto,
  ManualAnimeInput,
  MemberDto,
  PickerFilters,
  PickerResultDto,
  SearchResultDto,
  StatsDto,
  Status,
} from '../../shared/domain.ts';
import type { Lang } from '../../shared/i18n/lang.ts';
import { currentLang, translateNow } from './i18n/index.tsx';

/**
 * An error with a message already written for the user, in the language the request asked for. `code` is the
 * server's message key: decide on it, never on the wording.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let sessionExpiredHandler: (() => void) | null = null;

/**
 * Registers what happens when the server answers "not signed in" (the session expired, or the account was
 * closed). The handler decides whether it matters: a wrong password on the sign-in screen also answers 401.
 */
export function onSessionExpired(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function request<T>(method: string, path: string, body?: unknown, lang: Lang = currentLang()): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      // The server words its refusals in the language of the screen.
      headers: { 'Accept-Language': lang, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(translateNow('api.unreachable'), 0);
  }
  if (!response.ok) {
    if (response.status === 401) sessionExpiredHandler?.();
    const { message, code } = await readError(response);
    throw new ApiError(message, response.status, code);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function readError(response: Response): Promise<{ message: string; code: string | null }> {
  try {
    const payload = (await response.json()) as { message?: unknown; code?: unknown };
    if (typeof payload.message === 'string') return { message: payload.message, code: typeof payload.code === 'string' ? payload.code : null };
  } catch {
    // not JSON: fall through to the generic message
  }
  return { message: translateNow('api.unexpected'), code: null };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : translateNow('api.unexpected');
}

export const api = {
  listLibrary: () => request<EntryDto[]>('GET', '/api/library'),
  search: (query: string) => request<SearchResultDto[]>('GET', `/api/search?q=${encodeURIComponent(query)}`),
  addFromKitsu: (kitsuId: number, status: Status) => request<EntryDto>('POST', '/api/library', { kitsuId, status }),
  addManual: (input: ManualAnimeInput) => request<EntryDto>('POST', '/api/library/manual', input),
  patchEntry: (id: number, patch: EntryPatch) => request<EntryDto>('PATCH', `/api/library/${id}`, patch),
  removeEntry: (id: number) => request<void>('DELETE', `/api/library/${id}`),
  markEpisode: (id: number) => request<EpisodeResultDto>('POST', `/api/library/${id}/episode`),
  undoEpisode: (id: number) => request<EntryDto>('DELETE', `/api/library/${id}/episode`),
  duelCandidates: (bucket: Bucket, excludedId: number) =>
    request<DuelCandidateDto[]>('GET', `/api/ranking/candidates?bucket=${bucket}&exclude=${excludedId}`),
  placeRank: (id: number, bucket: Bucket, index: number) => request<EntryDto>('PUT', `/api/ranking/${id}`, { bucket, index }),
  stats: () => request<StatsDto>('GET', '/api/stats'),
  pick: (filters: PickerFilters) => {
    const params = new URLSearchParams();
    if (filters.maxTotalMinutes !== undefined) params.set('maxMinutes', String(filters.maxTotalMinutes));
    if (filters.subtype) params.set('subtype', filters.subtype);
    return request<PickerResultDto>('GET', `/api/picker?${params.toString()}`);
  },
  /** The synopsis of one of my entries in the language asked for: translated by the server when it can. */
  synopsis: (entryId: number, lang: Lang) => request<{ text: string | null; status: 'original' | 'translated' | 'unavailable' }>('GET', `/api/library/${entryId}/synopsis?lang=${lang}`),
  /** The covers behind the sign-in screens: public, the same for everybody, never from a library. */
  backdrop: () => request<{ images: string[] }>('GET', '/api/backdrop'),
  restore: (file: unknown) => request<{ entryCount: number }>('POST', '/api/import', file),

  auth: {
    /** `lang` is given when the answer is asked for before the screen has settled on its language (see early-state.ts). */
    state: (lang?: Lang) => request<AuthStateDto>('GET', '/api/auth/state', undefined, lang),
    setup: (input: { displayName: string; email: string; password: string; setupCode?: string }) => request<{ user: AccountUserDto }>('POST', '/api/auth/setup', input),
    login: (input: { email: string; password: string }) => request<{ user: AccountUserDto }>('POST', '/api/auth/login', input),
    logout: () => request<void>('POST', '/api/auth/logout'),
    checkLink: (token: string, kind: LinkKind) => request<LinkPreviewDto>('POST', '/api/auth/link/check', { token, kind }),
    join: (input: { token: string; displayName: string; email: string; password: string }) => request<{ user: AccountUserDto }>('POST', '/api/auth/join', input),
    reset: (input: { token: string; password: string }) => request<{ user: AccountUserDto }>('POST', '/api/auth/reset', input),
    changePassword: (input: { currentPassword: string; newPassword: string }) => request<{ user: AccountUserDto }>('POST', '/api/auth/password', input),
  },

  admin: {
    members: () => request<MemberDto[]>('GET', '/api/admin/members'),
    setDisabled: (memberId: number, isDisabled: boolean) => request<MemberDto>('PATCH', `/api/admin/members/${memberId}`, { isDisabled }),
    createResetLink: (memberId: number) => request<IssuedLinkDto>('POST', `/api/admin/members/${memberId}/reset-link`),
    invitations: () => request<InvitationDto[]>('GET', '/api/admin/invitations'),
    createInvitation: (label: string) => request<IssuedLinkDto>('POST', '/api/admin/invitations', { label }),
    revokeInvitation: (invitationId: number) => request<void>('DELETE', `/api/admin/invitations/${invitationId}`),
  },
};
