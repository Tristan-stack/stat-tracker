import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenBuyer } from '@/types/analysis';

vi.mock('@/lib/helius/token-buyers', () => ({
  getTokenBuyers: vi.fn(),
}));

import { getTokenBuyers } from '@/lib/helius/token-buyers';
import { discoverBuyers } from './discover-buyers';

const mockGetTokenBuyers = vi.mocked(getTokenBuyers);

function makeBuyer(wallet: string, tokenAddr: string, timestamp = '2024-01-01T00:00:00.000Z'): TokenBuyer {
  return {
    walletAddress: wallet,
    tokenAddress: tokenAddr,
    tokenName: null,
    purchasedAt: timestamp,
    amountSol: 1,
  };
}

const TOKENS = [
  { address: 'Token1', name: 'Token One' },
  { address: 'Token2', name: 'Token Two' },
  { address: 'Token3', name: 'Token Three' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('discoverBuyers', () => {
  it('cross-references wallets across multiple tokens', async () => {
    mockGetTokenBuyers
      .mockResolvedValueOnce([
        makeBuyer('WalletA', 'Token1'),
        makeBuyer('WalletB', 'Token1'),
        makeBuyer('WalletC', 'Token1'),
      ])
      .mockResolvedValueOnce([
        makeBuyer('WalletA', 'Token2'),
        makeBuyer('WalletB', 'Token2'),
      ])
      .mockResolvedValueOnce([
        makeBuyer('WalletA', 'Token3'),
      ]);

    const result = await discoverBuyers(TOKENS);

    expect(result.tokenCount).toBe(3);
    expect(result.totalUniqueBuyers).toBe(3);

    const walletA = result.buyers.find((b) => b.walletAddress === 'WalletA')!;
    expect(walletA.tokensBought).toBe(3);
    expect(walletA.coveragePercent).toBe(100);
    expect(walletA.totalTokens).toBe(3);

    const walletB = result.buyers.find((b) => b.walletAddress === 'WalletB')!;
    expect(walletB.tokensBought).toBe(2);
    expect(walletB.coveragePercent).toBeCloseTo(66.67, 0);

    const walletC = result.buyers.find((b) => b.walletAddress === 'WalletC')!;
    expect(walletC.tokensBought).toBe(1);
  });

  it('sorts by tokens bought (most first)', async () => {
    mockGetTokenBuyers
      .mockResolvedValueOnce([makeBuyer('WalletC', 'Token1')])
      .mockResolvedValueOnce([makeBuyer('WalletA', 'Token2'), makeBuyer('WalletC', 'Token2')])
      .mockResolvedValueOnce([makeBuyer('WalletA', 'Token3'), makeBuyer('WalletB', 'Token3'), makeBuyer('WalletC', 'Token3')]);

    const result = await discoverBuyers(TOKENS);

    expect(result.buyers[0].walletAddress).toBe('WalletC');
    expect(result.buyers[0].tokensBought).toBe(3);
    expect(result.buyers[1].walletAddress).toBe('WalletA');
    expect(result.buyers[1].tokensBought).toBe(2);
    expect(result.buyers[2].walletAddress).toBe('WalletB');
    expect(result.buyers[2].tokensBought).toBe(1);
  });

  it('filters out excluded wallets (rugger wallet)', async () => {
    const ruggerWallet = 'RuggerWallet123';

    mockGetTokenBuyers
      .mockResolvedValueOnce([
        makeBuyer(ruggerWallet, 'Token1'),
        makeBuyer('WalletA', 'Token1'),
      ])
      .mockResolvedValueOnce([
        makeBuyer(ruggerWallet, 'Token2'),
        makeBuyer('WalletA', 'Token2'),
      ])
      .mockResolvedValueOnce([]);

    const result = await discoverBuyers(TOKENS, { excludeWallets: [ruggerWallet] });

    expect(result.buyers).toHaveLength(1);
    expect(result.buyers[0].walletAddress).toBe('WalletA');
  });

  it('handles case-insensitive wallet exclusion', async () => {
    mockGetTokenBuyers
      .mockResolvedValueOnce([makeBuyer('RUGGERWALLET', 'Token1'), makeBuyer('WalletA', 'Token1')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await discoverBuyers(TOKENS, { excludeWallets: ['ruggerwallet'] });

    expect(result.buyers).toHaveLength(1);
    expect(result.buyers[0].walletAddress).toBe('WalletA');
  });

  it('enriches purchases with token name', async () => {
    mockGetTokenBuyers
      .mockResolvedValueOnce([makeBuyer('WalletA', 'Token1')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await discoverBuyers(TOKENS);

    expect(result.buyers[0].purchases[0].tokenName).toBe('Token One');
  });

  it('handles zero tokens gracefully', async () => {
    const result = await discoverBuyers([]);

    expect(result.buyers).toHaveLength(0);
    expect(result.tokenCount).toBe(0);
    expect(result.totalUniqueBuyers).toBe(0);
    expect(mockGetTokenBuyers).not.toHaveBeenCalled();
  });

  it('deduplicates same token for same wallet', async () => {
    mockGetTokenBuyers
      .mockResolvedValueOnce([
        makeBuyer('WalletA', 'Token1', '2024-01-01T00:00:00.000Z'),
        makeBuyer('WalletA', 'Token1', '2024-01-02T00:00:00.000Z'),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await discoverBuyers(TOKENS);

    expect(result.buyers).toHaveLength(1);
    expect(result.buyers[0].tokensBought).toBe(1);
    expect(result.buyers[0].purchases).toHaveLength(1);
  });
});
