import { createMemoryCache } from '@/lib/cache';

const walletPreviewCache = createMemoryCache<unknown>();
const bestWalletResponseCache = createMemoryCache<unknown>();

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
  return walletPreviewCache.get(key) as T | null;
}

export function setWalletPreviewCache<T>(key: string, value: T, ttlMs: number): void {
  walletPreviewCache.set(key, value, ttlMs);
}

export function getBestWalletResponseCache<T>(key: string): T | null {
  return bestWalletResponseCache.get(key) as T | null;
}

export function setBestWalletResponseCache<T>(key: string, value: T, ttlMs: number): void {
  bestWalletResponseCache.set(key, value, ttlMs);
}

export function invalidateBestWalletCachesByAnalysis(analysisId: string): number {
  const prefix = `analysis:${analysisId}:`;
  return (
    walletPreviewCache.invalidateByPrefix(prefix) +
    bestWalletResponseCache.invalidateByPrefix(prefix)
  );
}

export function getBestWalletCacheStats(): { walletPreviewEntries: number; responseEntries: number } {
  return {
    walletPreviewEntries: walletPreviewCache.size(),
    responseEntries: bestWalletResponseCache.size(),
  };
}
