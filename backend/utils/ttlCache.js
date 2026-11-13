// Tiny in-memory cache with a per-entry time-to-live and a size cap (oldest entry evicted first).
// Per-process only: with several server instances each keeps its own copy, which is fine for
// short-lived, read-only data such as dashboard figures.
//
//   const cache = createTtlCache({ ttlMs: 60000, max: 500 });
//   const hit = cache.get(key); if (hit !== undefined) return hit;
//   cache.set(key, value);
//
// `cache.ttlMs` may be changed at runtime (0 disables caching).
const createTtlCache = ({ ttlMs = 60000, max = 500, now = () => Date.now() } = {}) => {
  const store = new Map();
  const cache = {
    ttlMs,
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (!(cache.ttlMs > 0)) return value;
      store.delete(key);
      store.set(key, { value, expiresAt: now() + cache.ttlMs });
      while (store.size > max) store.delete(store.keys().next().value);
      return value;
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    get size() {
      return store.size;
    },
  };
  return cache;
};

module.exports = { createTtlCache };
