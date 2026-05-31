import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeWalletPnl } from '@/lib/pnl/compute-wallet-pnl';
import { collectSolanaTradesInRange, type PnlTradeRow } from '@/lib/pnl/collect-solana-trades-in-range';
import { fetchSolUsdFromGmgn } from '@/lib/gmgn/first-buy-notional';
import { fetchWalletStats } from '@/lib/gmgn/wallet-stats';

vi.mock('@/lib/pnl/collect-solana-trades-in-range', () => ({
  collectSolanaTradesInRange: vi.fn(),
}));
vi.mock('@/lib/gmgn/first-buy-notional', () => ({
  fetchSolUsdFromGmgn: vi.fn(),
}));
vi.mock('@/lib/gmgn/wallet-stats', () => ({
  fetchWalletStats: vi.fn(),
}));

const mockCollect = vi.mocked(collectSolanaTradesInRange);
const mockSolUsd = vi.mocked(fetchSolUsdFromGmgn);
const mockStats = vi.mocked(fetchWalletStats);

function trade(partial: Partial<PnlTradeRow>): PnlTradeRow {
  return {
    mint: 'MINT',
    side: 'buy',
    tsSec: 1000,
    usd: null,
    sol: null,
    feeUsd: 0,
    feeSol: 0,
    tokenName: null,
    ...partial,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('computeWalletPnl — agrégation (custom)', () => {
  it('calcule le PNL réalisé par token (vente − achat)', async () => {
    mockSolUsd.mockResolvedValue(200);
    mockCollect.mockResolvedValue({
      rows: [
        trade({ mint: 'A', side: 'buy', usd: 100, sol: 0.5, tokenName: 'Alpha' }),
        trade({ mint: 'A', side: 'sell', usd: 150, sol: 0.75 }),
        trade({ mint: 'B', side: 'buy', usd: 80, sol: 0.4 }),
        trade({ mint: 'B', side: 'sell', usd: 50, sol: 0.25 }),
      ],
      truncated: false,
    });

    const { result } = await computeWalletPnl('w', 0, 1, 'custom');

    expect(result.source).toBe('activity');
    expect(result.realizedUsd).toBe(20); // (150-100) + (50-80)
    expect(result.tokenCount).toBe(2);
    expect(result.tradeCount).toBe(4);
    // 1 token gagnant (A) sur 2 vendus
    expect(result.winRatePercent).toBe(50);
    const tokenA = result.perToken.find((t) => t.mint === 'A');
    expect(tokenA?.realizedUsd).toBe(50);
    expect(tokenA?.tokenName).toBe('Alpha');
  });

  it('déduit les frais de trading du PNL réalisé', async () => {
    mockSolUsd.mockResolvedValue(200);
    mockCollect.mockResolvedValue({
      rows: [
        trade({ mint: 'A', side: 'buy', usd: 100, feeUsd: 1.5 }),
        trade({ mint: 'A', side: 'sell', usd: 150, feeUsd: 2 }),
      ],
      truncated: false,
    });

    const { result } = await computeWalletPnl('w', 0, 1, 'custom');
    // (150 - 100) - (1.5 + 2) = 46.5
    expect(result.realizedUsd).toBeCloseTo(46.5);
    expect(result.perToken[0].realizedUsd).toBeCloseTo(46.5);
  });

  it('avertit quand l’activité est tronquée', async () => {
    mockSolUsd.mockResolvedValue(null);
    mockCollect.mockResolvedValue({ rows: [], truncated: true });

    const { result, warnings } = await computeWalletPnl('w', 0, 1, 'custom');
    expect(result.truncated).toBe(true);
    expect(warnings.some((w) => w.includes('tronqué'))).toBe(true);
  });

  it('gère une fenêtre sans activité (zéros)', async () => {
    mockSolUsd.mockResolvedValue(200);
    mockCollect.mockResolvedValue({ rows: [], truncated: false });

    const { result } = await computeWalletPnl('w', 0, 1, 'custom');
    expect(result.realizedUsd).toBe(0);
    expect(result.tokenCount).toBe(0);
    expect(result.winRatePercent).toBeNull();
  });
});

describe('computeWalletPnl — GMGN stats (7d/30d)', () => {
  it('utilise wallet_stats quand des données existent', async () => {
    mockStats.mockResolvedValue({
      realizedProfit: 1234,
      unrealizedProfit: 56,
      winratePercent: 62.5,
      boughtUsd: 5000,
      soldUsd: 6234,
      totalCost: 5000,
      buyCount: 10,
      sellCount: 8,
      tokenCount: 12,
    });

    const { result } = await computeWalletPnl('w', 0, 1, '7d');
    expect(result.source).toBe('gmgn_stats');
    expect(result.realizedUsd).toBe(1234);
    expect(result.unrealizedUsd).toBe(56);
    expect(result.winRatePercent).toBe(62.5);
    expect(result.boughtUsd).toBe(5000);
    expect(result.soldUsd).toBe(6234);
    expect(result.tokenCount).toBe(12);
    expect(result.tradeCount).toBe(18);
    expect(mockCollect).not.toHaveBeenCalled();
  });

  it('bascule sur l’agrégation si wallet_stats est vide', async () => {
    mockStats.mockResolvedValue({
      realizedProfit: null,
      unrealizedProfit: null,
      winratePercent: null,
      boughtUsd: null,
      soldUsd: null,
      totalCost: null,
      buyCount: null,
      sellCount: null,
      tokenCount: null,
    });
    mockSolUsd.mockResolvedValue(200);
    mockCollect.mockResolvedValue({
      rows: [trade({ mint: 'A', side: 'sell', usd: 10 })],
      truncated: false,
    });

    const { result } = await computeWalletPnl('w', 0, 1, '7d');
    expect(result.source).toBe('activity');
    expect(mockCollect).toHaveBeenCalledOnce();
  });
});
