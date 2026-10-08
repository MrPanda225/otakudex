/**
 * Brakes against guessing and flooding, in memory (they start over when the server restarts, and are
 * not shared between processes: enough for a single server, see docs/06 section 9).
 */

const FREE_FAILURES = 4; // the 5th failure is the first one that costs time
const FIRST_WAIT_SECONDS = 1;
const MAX_WAIT_SECONDS = 15 * 60;
const FORGET_AFTER_MS = 60 * 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;

interface FailureRecord {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
}

export interface LoginThrottle {
  /** Whole seconds left to wait before `key` may try again; 0 when it is free to try. */
  waitSeconds(key: string, now: Date): number;
  recordFailure(key: string, now: Date): void;
  recordSuccess(key: string): void;
}

/**
 * Failed sign-ins counted per account name, known or not (OWASP Authentication: count per account, and
 * make unknown accounts behave the same). From the 5th failure: 1 s, doubled each time, 15 min at most.
 * Attempts made while locked are refused without being counted, so waiting is never made longer by retrying.
 */
export function createLoginThrottle(): LoginThrottle {
  const records = new Map<string, FailureRecord>();

  function forgetStale(nowMs: number): void {
    for (const [key, record] of records) {
      if (nowMs - record.lastFailureAt > FORGET_AFTER_MS) records.delete(key);
    }
    // Still too many (a flood of invented names): drop the oldest first.
    for (const key of records.keys()) {
      if (records.size <= MAX_TRACKED_KEYS) break;
      records.delete(key);
    }
  }

  return {
    waitSeconds(key, now) {
      const record = records.get(key);
      if (!record) return 0;
      const nowMs = now.getTime();
      if (nowMs - record.lastFailureAt > FORGET_AFTER_MS) {
        records.delete(key);
        return 0;
      }
      return record.lockedUntil > nowMs ? Math.ceil((record.lockedUntil - nowMs) / 1000) : 0;
    },

    recordFailure(key, now) {
      const nowMs = now.getTime();
      const previous = records.get(key);
      const failures = previous && nowMs - previous.lastFailureAt <= FORGET_AFTER_MS ? previous.failures + 1 : 1;
      const waitSeconds =
        failures > FREE_FAILURES ? Math.min(MAX_WAIT_SECONDS, FIRST_WAIT_SECONDS * 2 ** (failures - FREE_FAILURES - 1)) : 0;
      records.delete(key); // re-insert last, so the oldest entries stay first
      records.set(key, { failures, lastFailureAt: nowMs, lockedUntil: nowMs + waitSeconds * 1000 });
      if (records.size > MAX_TRACKED_KEYS) forgetStale(nowMs);
    },

    recordSuccess(key) {
      records.delete(key);
    },
  };
}

interface WindowRecord {
  count: number;
  resetAt: number;
}

/**
 * The key an address is counted under: an IPv4 address as it is; an IPv6 address by its /64, because one
 * ordinary connection owns billions of addresses of that network and could otherwise dodge the count.
 */
export function addressKey(address: string): string {
  const unwrapped = address.replace(/^::ffff:/i, ''); // an IPv4 address seen through an IPv6 socket
  if (!unwrapped.includes(':')) return unwrapped;
  const [left = '', right] = (unwrapped.split('%')[0] ?? unwrapped).split('::');
  const leftGroups = left === '' ? [] : left.split(':');
  const rightGroups = right === undefined || right === '' ? [] : right.split(':');
  const missing = right === undefined ? 0 : Math.max(0, 8 - leftGroups.length - rightGroups.length);
  const groups = [...leftGroups, ...Array<string>(missing).fill('0'), ...rightGroups];
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export interface RequestRateLimiter {
  /** Counts one request from `key`; false when `key` is over its allowance for the current window. */
  allow(key: string, now: Date): boolean;
}

/** A fixed window per key (an IP address): a flood of sign-in attempts must not eat the server's CPU. */
export function createRequestRateLimiter(options: { limit: number; windowMs: number }): RequestRateLimiter {
  const windows = new Map<string, WindowRecord>();

  return {
    allow(key, now) {
      const nowMs = now.getTime();
      if (windows.size > MAX_TRACKED_KEYS) {
        for (const [candidate, record] of windows) if (record.resetAt <= nowMs) windows.delete(candidate);
        // Still too many live windows (a flood of distinct addresses): drop the oldest, the table must stay bounded.
        for (const candidate of windows.keys()) {
          if (windows.size <= MAX_TRACKED_KEYS) break;
          windows.delete(candidate);
        }
      }
      const current = windows.get(key);
      if (!current || current.resetAt <= nowMs) {
        windows.set(key, { count: 1, resetAt: nowMs + options.windowMs });
        return true;
      }
      current.count += 1;
      return current.count <= options.limit;
    },
  };
}
