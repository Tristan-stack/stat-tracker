interface Entry<V> {
  value: V;
  expiresAt: number;
}

export interface MemoryCache<V> {
  get(key: string): V | null;
  set(key: string, value: V, ttlMs: number): void;
  delete(key: string): void;
  /** Supprime toutes les entrées dont la clé commence par `prefix`. Retourne le nombre supprimé. */
  invalidateByPrefix(prefix: string): number;
  size(): number;
}

/**
 * Cache mémoire générique à TTL (par entrée). Mutualise le pattern
 * Map + expiresAt + invalidation par préfixe précédemment réimplémenté
 * dans chaque module de cache in-process.
 */
export function createMemoryCache<V>(): MemoryCache<V> {
  const store = new Map<string, Entry<V>>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value, ttlMs) {
      store.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
    },
    delete(key) {
      store.delete(key);
    },
    invalidateByPrefix(prefix) {
      let deleted = 0;
      for (const key of store.keys()) {
        if (!key.startsWith(prefix)) continue;
        store.delete(key);
        deleted += 1;
      }
      return deleted;
    },
    size() {
      return store.size;
    },
  };
}
