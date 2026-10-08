export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
}

interface TtlCacheOptions<V> {
  ttlMs: number;
  maxEntries: number;
  /** Total size limit, with `weigh` giving the size of one value (for example bytes). */
  maxWeight?: number;
  weigh?: (value: V) => number;
  /** Injectable clock so tests control time. */
  now?: () => number;
}

/**
 * Small in-memory cache whose entries expire after `ttlMs`.
 * When it holds too many entries, or weighs too much, the oldest entries are dropped first.
 */
export function createTtlCache<V>(options: TtlCacheOptions<V>): TtlCache<V> {
  const { ttlMs, maxEntries, maxWeight = Infinity, weigh = () => 0, now = Date.now } = options;
  const entries = new Map<string, { value: V; weight: number; expiresAt: number }>();
  let totalWeight = 0;

  function remove(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    totalWeight -= entry.weight;
    entries.delete(key);
  }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        remove(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      remove(key); // re-inserting moves the key to the "newest" end
      const weight = weigh(value);
      entries.set(key, { value, weight, expiresAt: now() + ttlMs });
      totalWeight += weight;
      while (entries.size > maxEntries || totalWeight > maxWeight) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        remove(oldestKey);
      }
    },
  };
}
