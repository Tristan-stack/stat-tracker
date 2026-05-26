import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HeliusEnhancedTransaction } from '@/lib/helius/client';

vi.mock('@/lib/helius/client', () => ({
  getEnhancedTransactionsByAddress: vi.fn(),
}));

vi.mock('@/lib/gmgn/pumpfun-mint', () => ({
  isPumpfunMint: vi.fn(),
}));

import { getEnhancedTransactionsByAddress } from '@/lib/helius/client';
import { isPumpfunMint } from '@/lib/gmgn/pumpfun-mint';
import { discoverRuggerTokens } from '@/lib/analysis/discover-rugger-tokens';

const mockGetTxs = vi.mocked(getEnhancedTransactionsByAddress);
const mockIsPumpfunMint = vi.mocked(isPumpfunMint);

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
