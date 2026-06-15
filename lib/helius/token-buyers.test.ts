import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HeliusEnhancedTransaction, SignatureInfo } from './client';

vi.mock('@/lib/helius/client', () => ({
  getSignaturesForAddress: vi.fn(),
  parseTransactions: vi.fn(),
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

vi.mock('@/lib/helius/token-buyers-cache', () => ({
  loadCachedTokenBuyers: vi.fn().mockResolvedValue(null),
  storeCachedTokenBuyers: vi.fn().mockResolvedValue(undefined),
}));

import { getSignaturesForAddress, parseTransactions } from '@/lib/helius/client';
import { loadCachedTokenBuyers, storeCachedTokenBuyers } from '@/lib/helius/token-buyers-cache';
import { getTokenBuyers } from './token-buyers';

const mockGetSigs = vi.mocked(getSignaturesForAddress);
const mockParseTxs = vi.mocked(parseTransactions);
const mockLoadCache = vi.mocked(loadCachedTokenBuyers);
const mockStoreCache = vi.mocked(storeCachedTokenBuyers);

const TOKEN_MINT = 'TokenMint111111111111111111111111111111111';

function makeSig(signature: string, blockTime = 1700000000): SignatureInfo {
  return { signature, slot: 100, err: null, memo: null, blockTime };
}

function makePumpfunSwapTx(
  buyer: string,
  tokenMint: string,
  timestamp: number,
  solAmount = 1_000_000_000
): HeliusEnhancedTransaction {
  return {
    description: 'swap on pump.fun',
    type: 'SWAP',
    source: 'PUMP_FUN',
    fee: 5000,
    feePayer: buyer,
    signature: `sig_${buyer}_${timestamp}`,
    slot: 100,
    timestamp,
    nativeTransfers: [],
    tokenTransfers: [],
    events: {
      swap: {
        nativeInput: { account: buyer, amount: String(solAmount) },
        nativeOutput: null,
        tokenInputs: [],
        tokenOutputs: [
          {
            userAccount: buyer,
            tokenAccount: 'ata_' + buyer,
            mint: tokenMint,
            rawTokenAmount: { tokenAmount: '1000000', decimals: 6 },
          },
        ],
      },
    },
  };
}

function makeNonPumpfunSwapTx(
  buyer: string,
  tokenMint: string,
  timestamp: number
): HeliusEnhancedTransaction {
  return {
    description: 'swap on raydium',
    type: 'SWAP',
    source: 'RAYDIUM',
    fee: 5000,
    feePayer: buyer,
    signature: `sig_raydium_${buyer}_${timestamp}`,
    slot: 100,
    timestamp,
    nativeTransfers: [],
    tokenTransfers: [],
    events: {
      swap: {
        nativeInput: { account: buyer, amount: '1000000000' },
        nativeOutput: null,
        tokenInputs: [],
        tokenOutputs: [
          {
            userAccount: buyer,
            tokenAccount: 'ata_' + buyer,
            mint: tokenMint,
            rawTokenAmount: { tokenAmount: '1000000', decimals: 6 },
          },
        ],
      },
    },
  };
}

function makeTransferTx(
  from: string,
  to: string,
  timestamp: number
): HeliusEnhancedTransaction {
  return {
    description: 'transfer',
    type: 'TRANSFER',
    source: 'SYSTEM_PROGRAM',
    fee: 5000,
    feePayer: from,
    signature: `sig_transfer_${timestamp}`,
    slot: 100,
    timestamp,
    nativeTransfers: [{ fromUserAccount: from, toUserAccount: to, amount: 1_000_000_000 }],
    tokenTransfers: [],
    events: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadCache.mockResolvedValue(null);
  mockStoreCache.mockResolvedValue(undefined);
});

describe('getTokenBuyers', () => {
  it('extracts buyers from Pump.fun swap transactions', async () => {
    mockGetSigs.mockResolvedValueOnce([makeSig('sig1'), makeSig('sig2')]);
    mockParseTxs.mockResolvedValueOnce([
      makePumpfunSwapTx('BuyerA', TOKEN_MINT, 1700000000, 500_000_000),
      makePumpfunSwapTx('BuyerB', TOKEN_MINT, 1700000100, 1_000_000_000),
    ]);

    const buyers = await getTokenBuyers(TOKEN_MINT);

    expect(buyers).toHaveLength(2);
    expect(buyers[0].walletAddress).toBe('BuyerA');
    expect(buyers[0].amountSol).toBe(0.5);
    expect(buyers[1].walletAddress).toBe('BuyerB');
    expect(buyers[1].amountSol).toBe(1);
    expect(buyers[0].tokenAddress).toBe(TOKEN_MINT);
    expect(buyers[0].purchasedAt).toBeDefined();
  });

  it('deduplicates wallets (keeps first occurrence)', async () => {
    mockGetSigs.mockResolvedValueOnce([makeSig('sig1'), makeSig('sig2')]);
    mockParseTxs.mockResolvedValueOnce([
      makePumpfunSwapTx('BuyerA', TOKEN_MINT, 1700000000),
      makePumpfunSwapTx('BuyerA', TOKEN_MINT, 1700000100),
    ]);

    const buyers = await getTokenBuyers(TOKEN_MINT);
    expect(buyers).toHaveLength(1);
    expect(buyers[0].walletAddress).toBe('BuyerA');
  });

  it('caps at buyerLimit', async () => {
    const sigs = Array.from({ length: 10 }, (_, i) => makeSig(`sig${i}`));
    const txs = Array.from({ length: 10 }, (_, i) =>
      makePumpfunSwapTx(`Buyer${i}`, TOKEN_MINT, 1700000000 + i)
    );

    mockGetSigs.mockResolvedValueOnce(sigs);
    mockParseTxs.mockResolvedValueOnce(txs);

    const buyers = await getTokenBuyers(TOKEN_MINT, { buyerLimit: 3 });
    expect(buyers).toHaveLength(3);
  });

  it('extracts buyers from non-Pump DEX swaps when SWAP has token output (e.g. Raydium)', async () => {
    mockGetSigs.mockResolvedValueOnce([makeSig('sig1'), makeSig('sig2'), makeSig('sig3')]);
    mockParseTxs.mockResolvedValueOnce([
      makeNonPumpfunSwapTx('BuyerRay', TOKEN_MINT, 1700000000),
      makeTransferTx('Sender', 'Receiver', 1700000050),
      makePumpfunSwapTx('BuyerPF', TOKEN_MINT, 1700000100),
    ]);

    const buyers = await getTokenBuyers(TOKEN_MINT);
    expect(buyers).toHaveLength(2);
    expect(buyers.map((b) => b.walletAddress)).toEqual(['BuyerRay', 'BuyerPF']);
  });

  it('ignores plain transfer transactions', async () => {
    mockGetSigs.mockResolvedValueOnce([makeSig('sig1'), makeSig('sig2')]);
    mockParseTxs.mockResolvedValueOnce([
      makeTransferTx('Sender', 'Receiver', 1700000000),
      makePumpfunSwapTx('BuyerA', TOKEN_MINT, 1700000100),
    ]);

    const buyers = await getTokenBuyers(TOKEN_MINT);
    expect(buyers).toHaveLength(1);
    expect(buyers[0].walletAddress).toBe('BuyerA');
  });

  it('ignores Pump.fun swaps for a different token', async () => {
    mockGetSigs.mockResolvedValueOnce([makeSig('sig1')]);
    mockParseTxs.mockResolvedValueOnce([
      makePumpfunSwapTx('BuyerA', 'DifferentTokenMint999', 1700000000),
    ]);

    const buyers = await getTokenBuyers(TOKEN_MINT);
    expect(buyers).toHaveLength(0);
  });

  it('returns empty array when no signatures exist', async () => {
    mockGetSigs.mockResolvedValueOnce([]);

    const buyers = await getTokenBuyers(TOKEN_MINT);
    expect(buyers).toHaveLength(0);
    expect(mockParseTxs).not.toHaveBeenCalled();
  });

  it('skips error signatures', async () => {
    mockGetSigs.mockResolvedValueOnce([
      { signature: 'errSig', slot: 100, err: { code: 1 }, memo: null, blockTime: 1700000000 },
      makeSig('goodSig'),
    ]);
    mockParseTxs.mockResolvedValueOnce([
      makePumpfunSwapTx('BuyerA', TOKEN_MINT, 1700000000),
    ]);

    const buyers = await getTokenBuyers(TOKEN_MINT);
    expect(buyers).toHaveLength(1);

    const parsedSigs = mockParseTxs.mock.calls[0][0];
    expect(parsedSigs).toEqual(['goodSig']);
  });

  it('paginates when first page is full and buyer limit not met', async () => {
    const page1Sigs = Array.from({ length: 1000 }, (_, i) => makeSig(`p1_sig${i}`));
    const page2Sigs = [makeSig('p2_sig0')];

    const page1Txs = Array.from({ length: 5 }, (_, i) =>
      makePumpfunSwapTx(`BuyerP1_${i}`, TOKEN_MINT, 1700000000 + i)
    );
    const page2Txs = [makePumpfunSwapTx('BuyerP2_0', TOKEN_MINT, 1700001000)];

    mockGetSigs
      .mockResolvedValueOnce(page1Sigs)
      .mockResolvedValueOnce(page2Sigs);
    mockParseTxs
      .mockResolvedValue(page1Txs)
      .mockResolvedValueOnce(page1Txs)
      .mockResolvedValueOnce(page2Txs);

    const buyers = await getTokenBuyers(TOKEN_MINT, { buyerLimit: 10 });
    expect(buyers.length).toBeGreaterThanOrEqual(5);
    expect(mockGetSigs).toHaveBeenCalledTimes(2);
  });
});

describe('getTokenBuyers — cache token→buyers', () => {
  it('court-circuite Helius sur cache hit (aucun appel signatures)', async () => {
    mockLoadCache.mockResolvedValueOnce([
      {
        walletAddress: 'CachedBuyer',
        tokenAddress: TOKEN_MINT,
        tokenName: null,
        purchasedAt: '2025-01-01T00:00:00Z',
        amountSol: 1,
      },
    ]);

    const buyers = await getTokenBuyers(TOKEN_MINT, { buyerLimit: 50 });

    expect(buyers).toHaveLength(1);
    expect(buyers[0].walletAddress).toBe('CachedBuyer');
    expect(mockGetSigs).not.toHaveBeenCalled();
    expect(mockStoreCache).not.toHaveBeenCalled();
  });

  it('met en cache après un scan complet (mint + limit)', async () => {
    mockGetSigs.mockResolvedValueOnce([makeSig('sig1')]);
    mockParseTxs.mockResolvedValueOnce([makePumpfunSwapTx('BuyerA', TOKEN_MINT, 1700000000)]);

    await getTokenBuyers(TOKEN_MINT, { buyerLimit: 50 });

    expect(mockStoreCache).toHaveBeenCalledTimes(1);
    expect(mockStoreCache.mock.calls[0][0]).toBe(TOKEN_MINT);
    expect(mockStoreCache.mock.calls[0][1]).toBe(50);
  });

  it('ne consulte ni n’écrit le cache en pagination ad hoc (beforeSignature)', async () => {
    mockGetSigs.mockResolvedValueOnce([]);

    await getTokenBuyers(TOKEN_MINT, { beforeSignature: 'cursor', buyerLimit: 50 });

    expect(mockLoadCache).not.toHaveBeenCalled();
    expect(mockStoreCache).not.toHaveBeenCalled();
  });
});
