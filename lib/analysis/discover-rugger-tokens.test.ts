import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HeliusEnhancedTransaction } from '@/lib/helius/client';

vi.mock('@/lib/helius/client', () => ({
  getEnhancedTransactionsByAddress: vi.fn(),
}));

import { getEnhancedTransactionsByAddress } from '@/lib/helius/client';
import { discoverRuggerTokens } from '@/lib/analysis/discover-rugger-tokens';

const mockGetTxs = vi.mocked(getEnhancedTransactionsByAddress);

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
  });

  it('inclut les mints d une tx pump.fun', async () => {
    mockGetTxs.mockResolvedValueOnce([makeSwapTx('PUMP_FUN', PUMP_MINT)]);

    const tokens = await discoverRuggerTokens(RUGGER, []);

    expect(tokens.some((t) => t.address === PUMP_MINT)).toBe(true);
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
});
