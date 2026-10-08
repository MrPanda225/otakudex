const KEY = 'otakudex.returning';

type MarkStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStore(): MarkStore | null {
  try {
    // Read through globalThis: this file is also type-checked (and tested) without the browser's types.
    return (globalThis as { localStorage?: MarkStore }).localStorage ?? null;
  } catch {
    return null; // storage blocked: the mark is simply not kept
  }
}

/**
 * A bare "somebody signed in here and has not signed out" mark (NFR-61). It holds no name and no token: the
 * session itself stays in its HttpOnly cookie. It only lets the browser start fetching the application early.
 */
export function isReturning(store: MarkStore | null = browserStore()): boolean {
  try {
    return store?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberReturning(store: MarkStore | null = browserStore()): void {
  try {
    store?.setItem(KEY, '1');
  } catch {
    // not kept; the next start just takes the slower path
  }
}

export function forgetReturning(store: MarkStore | null = browserStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // nothing to clean if nothing could be written
  }
}
