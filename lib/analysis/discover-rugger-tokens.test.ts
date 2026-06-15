import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HeliusEnhancedTransaction } from '@/lib/helius/client';

vi.mock('@/lib/helius/client', () => ({
  getEnhancedTransactionsByAddress: vi.fn(),
}));

vi.mock('@/lib/gmgn/pumpfun-mint', () => ({
  isPumpfunMint: vi.fn(),
}));

vi.mock('@/lib/helius/token-buyers', () => ({
  getTokenBuyers: vi.fn(),
}));

import { getEnhancedTransactionsByAddress } from '@/lib/helius/client';
import { isPumpfunMint } from '@/lib/gmgn/pumpfun-mint';
import { getTokenBuyers } from '@/lib/helius/token-buyers';
import {
  discoverRuggerTokens,
  validateTokensByCrossReference,
} from '@/lib/analysis/discover-rugger-tokens';

const mockGetTxs = vi.mocked(getEnhancedTransactionsByAddress);
const mockIsPumpfunMint = vi.mocked(isPumpfunMint);
const mockGetTokenBuyers = vi.mocked(getTokenBuyers);

const RUGGER = 'RuggerWallet111111111111111111111111111';
const PUMP_MINT = 'PumpMint11111111111111111111111111111';
const RAY_MINT = 'RayMint11111111111111111111111111111';

function makeSwapTx(source: string, mint: string): HeliusEnhancedTransaction {
  return {
    description: '',
    type: 'SWAP',
    source,
    fee: 0,
    feePayer: RUGGER,
    signature: `sig_${source || 'empty'}_${mint}`,
    slot: 1,
    timestamp: 1,
    nativeTransfers: [],
    tokenTransfers: [
      {
        fromUserAccount: RUGGER,
        toUserAccount: 'Other1111111111111111111111111111',
        fromTokenAccount: 'fromAta',
        toTokenAccount: 'toAta',
        tokenAmount: 100,
        mint,
        tokenStandard: 'Fungible',
      },
    ],
    events: {},
  };
}

describe('discoverRuggerTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPumpfunMint.mockImplementation(async (mint: string) => mint === PUMP_MINT);
  });

  it('inclut les mints d une tx pump.fun', async () => {
    mockGetTxs.mockResolvedValueOnce([makeSwapTx('PUMP_FUN', PUMP_MINT)]);

    const tokens = await discoverRuggerTokens(RUGGER, []);

    expect(tokens.some((t) => t.address === PUMP_MINT)).toBe(true);
    expect(mockIsPumpfunMint).toHaveBeenCalledWith(PUMP_MINT);
  });

  it("n'inclut pas les mints d'une tx Raydium", async () => {
    mockGetTxs.mockResolvedValueOnce([makeSwapTx('RAYDIUM', RAY_MINT)]);

    const tokens = await discoverRuggerTokens(RUGGER, []);

    expect(tokens.some((t) => t.address === RAY_MINT)).toBe(false);
  });

  it('ignore une tx sans source', async () => {
    mockGetTxs.mockResolvedValueOnce([makeSwapTx('', PUMP_MINT)]);

    const tokens = await discoverRuggerTokens(RUGGER, []);

    expect(tokens.some((t) => t.address === PUMP_MINT)).toBe(false);
  });

  it('exclut un mint présent dans une tx PUMP_FUN mais launchpad Meteora (GMGN)', async () => {
    const meteoraMint = 'D5ZtcVEqK4eyYCZaU48Pq2pFZMkfbnNJEXQwjoTubrrr';
    mockGetTxs.mockResolvedValueOnce([makeSwapTx('PUMP_FUN', meteoraMint)]);
    mockIsPumpfunMint.mockImplementation(async (mint: string) => mint === PUMP_MINT);

    const tokens = await discoverRuggerTokens(RUGGER, []);

    expect(tokens.some((t) => t.address === meteoraMint)).toBe(false);
    expect(mockIsPumpfunMint).toHaveBeenCalledWith(meteoraMint);
  });

  it('filtre aussi les tokens enregistrés non pump.fun', async () => {
    mockGetTxs.mockResolvedValueOnce([]);
    const registered = [{ address: RAY_MINT, name: 'Ray' }];

    const tokens = await discoverRuggerTokens(RUGGER, registered);

    expect(tokens).toHaveLength(0);
    expect(mockIsPumpfunMint).toHaveBeenCalledWith(RAY_MINT);
  });
});

describe('validateTokensByCrossReference — résilience par token', () => {
  const TOKEN_A = 'TokenA1111111111111111111111111111111';
  const TOKEN_B = 'TokenB2222222222222222222222222222222';

  it('un token en échec (429) dégrade en partiel sans faire planter la validation', async () => {
    mockGetTokenBuyers.mockImplementation(async (mint: string) => {
      if (mint === TOKEN_B) throw new Error('Helius REST /v0/transactions: HTTP 429');
      return [
        {
          walletAddress: 'WalletX',
          tokenAddress: mint,
          tokenName: null,
          purchasedAt: '2025-01-01T00:00:00Z',
          amountSol: 1,
        },
      ];
    });

    const result = await validateTokensByCrossReference(
      [
        { address: TOKEN_A, name: null },
        { address: TOKEN_B, name: null },
      ],
      new Set<string>(),
      { buyerLimit: 50, concurrency: 2 }
    );

    expect(result.stats.candidateCount).toBe(2);
    expect(result.stats.failedTokenCount).toBe(1);
  });
});
