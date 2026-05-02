import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/gmgn/first-buy-notional', () => ({
  parseFirstBuyNotional: () => ({ usd: null, sol: null }),
  fetchSolUsdFromGmgn: vi.fn(),
  mergeNotionalWithSolUsd: (a: { usd: number | null; sol: number | null }) => a,
}));

vi.mock('@/lib/gmgn/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gmgn/client')>();
  return {
    ...actual,
    fetchTokenKline: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/lib/gmgn/collect-solana-buys-in-range', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gmgn/collect-solana-buys-in-range')>();
  return {
    ...actual,
    collectSolanaBuysInRange: vi.fn(),
  };
});

import { fetchTokenKline, type WalletActivityRow } from '@/lib/gmgn/client';
import { collectSolanaBuysInRange } from '@/lib/gmgn/collect-solana-buys-in-range';
import { buildWalletPurchasePreviews } from '@/lib/gmgn/wallet-purchases';

function mockRow(mint: string, priceUsd: number, tsSec: number): WalletActivityRow {
  return {
    event_type: 'buy',
    side: 'buy',
    price_usd: String(priceUsd),
    timestamp: tsSec,
    token: { address: mint, name: `N-${mint.slice(0, 4)}`, symbol: 'S' },
  } as WalletActivityRow;
}

describe('buildWalletPurchasePreviews kline batching', () => {
  beforeEach(() => {
    vi.mocked(fetchTokenKline).mockClear();
    vi.mocked(collectSolanaBuysInRange).mockReset();
  });

  it('first full batch enriches only indices in [0, batch) ∩ [0, cap) and leaves the rest truncated', async () => {
    const t0 = Math.floor(Date.now() / 1000) - 7200;
    const rows = [
      mockRow('Mint111111111111111111111111111111111111111', 1, t0),
      mockRow('Mint222222222222222222222222222222222222222222', 2, t0 + 10),
      mockRow('Mint333333333333333333333333333333333333333333', 3, t0 + 20),
    ];
    vi.mocked(collectSolanaBuysInRange).mockResolvedValue(rows);

    const fromMs = (t0 - 60) * 1000;
    const toMs = Date.now();

    const r = await buildWalletPurchasePreviews('SomeWallet11111111111111111111111111111111', fromMs, toMs, {
      klineEnrichTotalCap: 10,
      klineEnrichOffset: 0,
      klineEnrichBatchSize: 2,
      klineSliceOnly: false,
    });

    expect(r.purchases).toHaveLength(3);
    expect(r.purchases[0]?.truncatedKlines).toBe(false);
    expect(r.purchases[1]?.truncatedKlines).toBe(false);
    expect(r.purchases[2]?.truncatedKlines).toBe(true);
    expect(vi.mocked(fetchTokenKline)).toHaveBeenCalledTimes(2);
    expect(r.meta?.klineEnrichCap).toBe(3);
  });

  it('klineSliceOnly returns only patches for the requested slice', async () => {
    const t0 = Math.floor(Date.now() / 1000) - 7200;
    const rows = [
      mockRow('Mint111111111111111111111111111111111111111', 1, t0),
      mockRow('Mint222222222222222222222222222222222222222222', 2, t0 + 10),
      mockRow('Mint333333333333333333333333333333333333333333', 3, t0 + 20),
    ];
    vi.mocked(collectSolanaBuysInRange).mockResolvedValue(rows);

    const fromMs = (t0 - 60) * 1000;
    const toMs = Date.now();

    const r = await buildWalletPurchasePreviews('SomeWallet11111111111111111111111111111111', fromMs, toMs, {
      klineEnrichTotalCap: 10,
      klineEnrichOffset: 2,
      klineEnrichBatchSize: 2,
      klineSliceOnly: true,
    });

    expect(r.purchases).toHaveLength(0);
    expect(r.purchasePatches).toHaveLength(1);
    expect(r.purchasePatches?.[0]?.tokenAddress).toBe('Mint333333333333333333333333333333333333333333');
    expect(vi.mocked(fetchTokenKline)).toHaveBeenCalledTimes(1);
    expect(r.meta?.totalPurchases).toBe(3);
  });
});
