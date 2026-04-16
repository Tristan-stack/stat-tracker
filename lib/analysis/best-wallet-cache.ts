type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const walletPreviewCache = new Map<string, CacheEntry<unknown>>();
const bestWalletResponseCache = new Map<string, CacheEntry<unknown>>();

function makeEntry<T>(value: T, ttlMs: number): CacheEntry<T> {
  return {
    value,
    expiresAt: Date.now() + Math.max(0, ttlMs),
  };
}

function getFromCache<T>(store: Map<string, CacheEntry<unknown>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

function setInCache<T>(
  store: Map<string, CacheEntry<unknown>>,
  key: string,
  value: T,
  ttlMs: number
): void {
  store.set(key, makeEntry(value, ttlMs));
}

function invalidateByPrefix(store: Map<string, CacheEntry<unknown>>, prefix: string): number {
  let deleted = 0;
  for (const key of store.keys()) {
    if (!key.startsWith(prefix)) continue;
    store.delete(key);
    deleted += 1;
  }
  return deleted;
}

export function makeWalletPreviewCacheKey(input: {
  analysisId: string;
  walletAddress: string;
  fromMs: number;
  toMs: number;
}): string {
  return `analysis:${input.analysisId}:wallet:${input.walletAddress}:from:${input.fromMs}:to:${input.toMs}`;
}

export function makeBestWalletResponseCacheKey(input: {
  analysisId: string;
  tpMinPercent: number;
  tokenLimit: number;
  maxTieWallets: number;
}): string {
  return `analysis:${input.analysisId}:tp:${input.tpMinPercent}:tokens:${input.tokenLimit}:tieMax:${input.maxTieWallets}:v2`;
}

export function getWalletPreviewCache<T>(key: string): T | null {
  return getFromCache<T>(walletPreviewCache, key);
}

export function setWalletPreviewCache<T>(key: string, value: T, ttlMs: number): void {
  setInCache(walletPreviewCache, key, value, ttlMs);
}

export function getBestWalletResponseCache<T>(key: string): T | null {
  return getFromCache<T>(bestWalletResponseCache, key);
}

export function setBestWalletResponseCache<T>(key: string, value: T, ttlMs: number): void {
  setInCache(bestWalletResponseCache, key, value, ttlMs);
}

export function invalidateBestWalletCachesByAnalysis(analysisId: string): number {
  const prefix = `analysis:${analysisId}:`;
  return (
    invalidateByPrefix(walletPreviewCache, prefix) + invalidateByPrefix(bestWalletResponseCache, prefix)
  );
}

export function getBestWalletCacheStats(): { walletPreviewEntries: number; responseEntries: number } {
  return {
    walletPreviewEntries: walletPreviewCache.size,
    responseEntries: bestWalletResponseCache.size,
  };
}
