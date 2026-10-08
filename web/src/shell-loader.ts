import type { Lang } from '../../shared/i18n/lang.ts';
import { loadApp } from './i18n/catalogue.ts';
import { isReturning } from './lib/returning.ts';

/**
 * The application itself (pages, charts, the entry sheet, administration) is a separate file: the sign-in
 * screens do not need it, so they do not carry it. It is asked for here, once, either when someone is
 * signed in or, earlier, when the browser has nothing better to do.
 */
export const loadSignedInApp = () => import('./SignedInApp.tsx');

/** Starts downloading the application while the person reads the sign-in screen, without delaying it. */
export function prefetchSignedInApp(): void {
  const start = () => void loadSignedInApp();
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4_000 });
  else setTimeout(start, 1_500);
}

/**
 * When the browser remembers an open session, the application and its texts are fetched now, beside the
 * question "who is signed in?", instead of one after the other once the answer is in (NFR-61). The later
 * `import()` calls get the same module back, so nothing is downloaded twice.
 */
export function warmUpForReturningPerson(lang: Lang): void {
  if (!isReturning()) return;
  const ignoreFailure = () => undefined; // the real request, made later, reports the failure
  void loadSignedInApp().catch(ignoreFailure);
  void loadApp(lang).catch(ignoreFailure);
}
