import { useEffect, useState } from 'preact/hooks';

export type Route = 'dex' | 'arena' | 'stats' | 'tonight';

const ROUTES: readonly Route[] = ['dex', 'arena', 'stats', 'tonight'];

/** The page named by a URL or a bare hash ("#/arena"); the Dex when it names none. */
export function parseRoute(urlOrHash: string): Route {
  const name = urlOrHash.includes('#') ? urlOrHash.slice(urlOrHash.indexOf('#')).replace(/^#\/?/, '') : urlOrHash.replace(/^#?\/?/, '');
  return ROUTES.find((route) => route === name) ?? 'dex';
}

function readRoute(): Route {
  return parseRoute(window.location.hash);
}

const scrollByRoute = new Map<Route, number>();
// Registered once at load, before the view library's own listener, so the position is the one the
// user left, not one clamped by the next page being shorter.
window.addEventListener('hashchange', (event) => scrollByRoute.set(parseRoute(event.oldURL), window.scrollY));

/** Puts the page back where the user left it (top for a page not visited yet). */
export function restoreScroll(route: Route): void {
  window.scrollTo({ top: scrollByRoute.get(route) ?? 0, behavior: 'instant' });
}

/** Current page, from the URL hash (#/arena). Re-renders when the hash changes. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Returns `value` once it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** localStorage that never throws (private mode, blocked storage). */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // preference simply will not persist
  }
}

/**
 * State kept for the browser session: it survives going to another page and coming back, and is
 * forgotten when the tab closes. Falls back to plain state when storage is unavailable.
 */
export function useSessionState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.sessionStorage.getItem(key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  const update = (next: T) => {
    setValue(next);
    try {
      window.sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      // the value still lives in memory for this page
    }
  };
  return [value, update];
}

/** Whether a CSS media query currently matches; follows changes (rotation, resizing). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    onChange();
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** True while the user is typing in a field, so global shortcuts must stay out of the way. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}
