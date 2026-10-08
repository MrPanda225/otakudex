import { MAX_DISPLAY_NAME_LENGTH } from '../../../shared/account-rules.ts';
import type { LinkKind } from '../../../shared/domain.ts';
import type { Problem } from '../i18n/problem.ts';

/** Links the administrator hands out. The secret sits after the "#": it never goes to the server in the address. */
export interface AccessLink {
  kind: LinkKind;
  token: string;
}

const LINK_PATH: Record<LinkKind, string> = { invitation: 'invitation', reset: 'reinitialisation' };
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The invitation or reset link an address hash holds ("#/invitation/<secret>"), or null for anything else. */
export function parseAccessLink(hash: string): AccessLink | null {
  const [, path, token, ...rest] = hash.replace(/^#/, '').split('/');
  if (rest.length > 0 || token === undefined || !TOKEN_PATTERN.test(token)) return null;
  const kind = (Object.keys(LINK_PATH) as LinkKind[]).find((candidate) => LINK_PATH[candidate] === path);
  return kind ? { kind, token } : null;
}

export function buildAccessLink(origin: string, link: AccessLink): string {
  return `${origin}/#/${LINK_PATH[link.kind]}/${link.token}`;
}

/** Enough to catch a typo before sending; the server decides what is really valid. */
export function emailProblem(value: string): Problem | null {
  const email = value.trim();
  if (email === '') return { key: 'problem.emailEmpty' };
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? null : { key: 'problem.emailInvalid' };
}

export function nameProblem(value: string): Problem | null {
  const name = value.trim();
  if (name === '') return { key: 'problem.nameEmpty' };
  return name.length > MAX_DISPLAY_NAME_LENGTH ? { key: 'problem.nameTooLong', params: { max: MAX_DISPLAY_NAME_LENGTH } } : null;
}

export function requiredPasswordProblem(value: string): Problem | null {
  return value === '' ? { key: 'problem.passwordEmpty' } : null;
}
