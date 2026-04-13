import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HeliusEnhancedTransaction } from './client';

vi.mock('@/lib/helius/client', () => ({
  getEnhancedTransactionsByAddress: vi.fn(),
  DUST_SOL_THRESHOLD: 0.01,
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

vi.mock('@/lib/helius/exchange-addresses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/helius/exchange-addresses')>();
  return { ...actual };
});

import { getEnhancedTransactionsByAddress } from '@/lib/helius/client';
import { traceFundingChain } from './funding-chain';

const mockGetTxs = vi.mocked(getEnhancedTransactionsByAddress);

const LAMPORTS = 1_000_000_000;

function makeSolTransferTx(
  from: string,
  to: string,
  solAmount: number,
  timestamp: number
): HeliusEnhancedTransaction {
  return {
    description: `${from} transferred ${solAmount} SOL to ${to}`,
    type: 'TRANSFER',
    source: 'SYSTEM_PROGRAM',
    fee: 5000,
    feePayer: from,
    signature: `sig_${from}_${to}_${timestamp}`,
    slot: 100,
    timestamp,
    nativeTransfers: [
      { fromUserAccount: from, toUserAccount: to, amount: solAmount * LAMPORTS },
    ],
    tokenTransfers: [],
    events: {},
  };
}

function makeEmptyTxPage(): HeliusEnhancedTransaction[] {
  return [];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('traceFundingChain', () => {
  it('traces a linear chain: A <- B <- C <- Mother', async () => {
    mockGetTxs
      .mockResolvedValueOnce([makeSolTransferTx('FunderB', 'WalletA', 2, 1700000000)])
      .mockResolvedValueOnce([makeSolTransferTx('FunderC', 'FunderB', 5, 1699999000)])
      .mockResolvedValueOnce([makeSolTransferTx('Mother', 'FunderC', 10, 1699998000)])
      .mockResolvedValueOnce(makeEmptyTxPage());

    const result = await traceFundingChain('WalletA', { maxDepth: 5 });

    expect(result.wallet).toBe('WalletA');
    expect(result.chain).toEqual(['WalletA', 'FunderB', 'FunderC', 'Mother']);
    expect(result.depth).toBe(3);
    expect(result.stoppedBy).toBe('no_funder');
    expect(result.mother).toBe('Mother');
  });

  it('stops on circular reference: A <- B <- A', async () => {
    mockGetTxs
      .mockResolvedValueOnce([makeSolTransferTx('FunderB', 'WalletA', 2, 1700000000)])
      .mockResolvedValueOnce([makeSolTransferTx('WalletA', 'FunderB', 1, 1699999000)]);

    const result = await traceFundingChain('WalletA', { maxDepth: 5 });

    expect(result.stoppedBy).toBe('circular');
    expect(result.chain).toEqual(['WalletA', 'FunderB']);
    expect(result.mother).toBe('FunderB');
  });

  it('stops on known exchange address', async () => {
    const binanceAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

    mockGetTxs
      .mockResolvedValueOnce([makeSolTransferTx(binanceAddress, 'WalletA', 5, 1700000000)]);

    const result = await traceFundingChain('WalletA', { maxDepth: 5 });

    expect(result.stoppedBy).toBe('exchange');
    expect(result.mother).toBeNull();
    expect(result.chain).toEqual(['WalletA', binanceAddress]);
  });

  it('stops at depth limit', async () => {
    mockGetTxs
      .mockResolvedValueOnce([makeSolTransferTx('F1', 'WalletA', 2, 1700000000)])
      .mockResolvedValueOnce([makeSolTransferTx('F2', 'F1', 2, 1699999000)])
      .mockResolvedValueOnce([makeSolTransferTx('F3', 'F2', 2, 1699998000)]);

    const result = await traceFundingChain('WalletA', { maxDepth: 3 });

    expect(result.stoppedBy).toBe('depth');
    expect(result.depth).toBe(3);
    expect(result.chain).toEqual(['WalletA', 'F1', 'F2', 'F3']);
    expect(result.mother).toBe('F3');
  });

  it('ignores dust transfers (< 0.01 SOL)', async () => {
    mockGetTxs.mockResolvedValueOnce([
      makeSolTransferTx('DustSender', 'WalletA', 0.001, 1700000000),
      makeSolTransferTx('RealFunder', 'WalletA', 1.5, 1700000100),
    ]);
    mockGetTxs.mockResolvedValueOnce(makeEmptyTxPage());

    const result = await traceFundingChain('WalletA', { maxDepth: 5 });

    expect(result.chain).toContain('RealFunder');
    expect(result.chain).not.toContain('DustSender');
  });

  it('flags noisy wallets (>500 incoming transfers)', async () => {
    const manyTransfers: HeliusEnhancedTransaction[] = Array.from(
      { length: 501 },
      (_, i) => makeSolTransferTx(`Sender${i}`, 'NoisyWallet', 0.1, 1700000000 + i)
    );

    mockGetTxs.mockResolvedValueOnce([
      makeSolTransferTx('NoisyWallet', 'WalletA', 5, 1700000000),
    ]);
    mockGetTxs.mockResolvedValueOnce(manyTransfers);

    const result = await traceFundingChain('WalletA', { maxDepth: 5 });

    expect(result.stoppedBy).toBe('noisy');
    expect(result.mother).toBeNull();
  });

  it('returns no_funder when wallet has no incoming SOL', async () => {
    mockGetTxs.mockResolvedValueOnce(makeEmptyTxPage());

    const result = await traceFundingChain('WalletA', { maxDepth: 5 });

    expect(result.stoppedBy).toBe('no_funder');
    expect(result.mother).toBeNull();
    expect(result.chain).toEqual(['WalletA']);
    expect(result.depth).toBe(0);
  });

  it('picks earliest significant funder when multiple exist', async () => {
    mockGetTxs.mockResolvedValueOnce([
      makeSolTransferTx('LateFunder', 'WalletA', 10, 1700002000),
      makeSolTransferTx('EarlyFunder', 'WalletA', 0.5, 1700000000),
    ]);
    mockGetTxs.mockResolvedValueOnce(makeEmptyTxPage());

    const result = await traceFundingChain('WalletA', { maxDepth: 5 });

    expect(result.chain[1]).toBe('EarlyFunder');
  });

  it('defaults to maxDepth 5', async () => {
    for (let i = 1; i <= 6; i++) {
      mockGetTxs.mockResolvedValueOnce([
        makeSolTransferTx(`F${i}`, i === 1 ? 'WalletA' : `F${i - 1}`, 2, 1700000000 - i * 1000),
      ]);
    }

    const result = await traceFundingChain('WalletA');

    expect(result.stoppedBy).toBe('depth');
    expect(result.depth).toBe(5);
    expect(result.chain).toHaveLength(6);
  });
});
