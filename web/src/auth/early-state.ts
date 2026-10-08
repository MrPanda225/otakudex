import type { AuthStateDto } from '../../../shared/domain.ts';
import type { Lang } from '../../../shared/i18n/lang.ts';

type AskForState = (lang: Lang) => Promise<AuthStateDto>;

let early: Promise<AuthStateDto> | null = null;

/**
 * Asks "who is signed in?" at once, before anything is drawn. Otherwise an English browser would wait for
 * its small text file first, because nothing below the language provider exists until that file is in
 * (NFR-61). The language is passed along, since the screen has not yet settled on one.
 */
export function startAuthStateRequest(ask: AskForState, lang: Lang): void {
  early = ask(lang);
  early.catch(() => undefined); // not read yet: the one who takes it deals with a failure
}

/** The answer asked for at start-up, once; null when there is none (or it was already taken). */
export function takeEarlyAuthState(): Promise<AuthStateDto> | null {
  const taken = early;
  early = null;
  return taken;
}
