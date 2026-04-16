import { describe, expect, it } from 'vitest';
import {
  getBestWalletResponseCache,
  getWalletPreviewCache,
  invalidateBestWalletCachesByAnalysis,
  makeBestWalletResponseCacheKey,
  makeWalletPreviewCacheKey,
  setBestWalletResponseCache,
  setWalletPreviewCache,
} from '@/lib/analysis/best-wallet-cache';

describe('best-wallet cache', () => {
  it('builds deterministic keys', () => {
    const walletKey = makeWalletPreviewCacheKey({
      analysisId: 'a1',
      walletAddress: 'w1',
      fromMs: 1,
      toMs: 2,
    });
    const responseKey = makeBestWalletResponseCacheKey({
      analysisId: 'a1',
      tpMinPercent: 80,
      tokenLimit: 20,
      maxTieWallets: 120,
    });

    expect(walletKey).toContain('analysis:a1');
    expect(responseKey).toContain('tp:80');
    expect(responseKey).toContain('tieMax:120');
  });

  it('stores, reads, and invalidates values', () => {
    const walletKey = makeWalletPreviewCacheKey({
      analysisId: 'analysis-x',
      walletAddress: 'wallet-y',
      fromMs: 10,
      toMs: 20,
    });
    const responseKey = makeBestWalletResponseCacheKey({
      analysisId: 'analysis-x',
      tpMinPercent: 75,
      tokenLimit: 10,
      maxTieWallets: 80,
    });

    setWalletPreviewCache(walletKey, [{ tokenAddress: 'mint' }], 60_000);
    setBestWalletResponseCache(responseKey, { topWallets: [] }, 60_000);

    expect(getWalletPreviewCache(walletKey)).not.toBeNull();
    expect(getBestWalletResponseCache(responseKey)).not.toBeNull();

    const deleted = invalidateBestWalletCachesByAnalysis('analysis-x');
    expect(deleted).toBeGreaterThan(0);
    expect(getWalletPreviewCache(walletKey)).toBeNull();
    expect(getBestWalletResponseCache(responseKey)).toBeNull();
  });
});
