// Tiny in-memory TTL cache + in-flight request coalescing.
// Cuts Yahoo/NSE request volume by ~90%: repeated analyzes, watchlist
// scans and daily-pick batches hit RAM instead of the network.

const store = new Map();   // key -> { value, expiresAt }
const inflight = new Map(); // key -> Promise (dedups concurrent callers)

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  // Soft cap: evict oldest entries if the map grows too large.
  if (store.size > 2000) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

// Run fn() once per key even under concurrent calls; cache the result.
export async function cached(key, ttlMs, fn) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const value = await fn();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

export const TTL = {
  QUOTE: 60 * 1000,          // 1 min — prices move fast
  CHART_INTRADAY: 5 * 60 * 1000,
  CHART_DAILY: 15 * 60 * 1000,
  FUNDAMENTALS: 6 * 60 * 60 * 1000, // 6 h — fundamentals barely move
  NEWS: 30 * 60 * 1000,
  SEARCH: 10 * 60 * 1000,
  DAILY_PICK: 12 * 60 * 60 * 1000,  // 12 h — it's a *daily* pick
};
