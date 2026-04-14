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

vi.mock('@/lib/helius/funding-chain', () => ({
  traceFundingChain: vi.fn(),
}));

import { getEnhancedTransactionsByAddress } from '@/lib/helius/client';
import { traceFundingChain } from '@/lib/helius/funding-chain';
import { findSiblingWallets, getChildWallets } from './sibling-wallets';

const mockGetTxs = vi.mocked(getEnhancedTransactionsByAddress);
const mockTraceChain = vi.mocked(traceFundingChain);

const LAMPORTS = 1_000_000_000;

function makeOutgoingTx(
  from: string,
  to: string,
  solAmount: number,
  timestamp: number
): HeliusEnhancedTransaction {
  return {
    description: '',
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

describe('sibling-wallets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findSiblingWallets', () => {
    it('returns siblings funded by the same mother', async () => {
      mockTraceChain.mockResolvedValue({
        wallet: 'RuggerWallet',
        mother: 'MotherAddr',
        depth: 2,
        chain: ['RuggerWallet', 'IntermediateWallet', 'MotherAddr'],
        stoppedBy: 'depth',
      });

      mockGetTxs.mockResolvedValue([
        makeOutgoingTx('MotherAddr', 'SiblingA', 1.5, 1000),
        makeOutgoingTx('MotherAddr', 'SiblingB', 2.0, 1001),
        makeOutgoingTx('MotherAddr', 'RuggerWallet', 3.0, 999),
      ]);

      const result = await findSiblingWallets('RuggerWallet');

      expect(result.motherAddress).toBe('MotherAddr');
      expect(result.ruggerChain).toEqual(['RuggerWallet', 'IntermediateWallet', 'MotherAddr']);
      expect(result.siblings).toHaveLength(2);
      expect(result.siblings[0].walletAddress).toBe('SiblingA');
      expect(result.siblings[1].walletAddress).toBe('SiblingB');
    });

    it('returns empty siblings when no mother found', async () => {
      mockTraceChain.mockResolvedValue({
        wallet: 'RuggerWallet',
        mother: null,
        depth: 0,
        chain: ['RuggerWallet'],
        stoppedBy: 'no_funder',
      });

      const result = await findSiblingWallets('RuggerWallet');

      expect(result.motherAddress).toBeNull();
      expect(result.siblings).toHaveLength(0);
    });

    it('passes maxDepth to traceFundingChain', async () => {
      mockTraceChain.mockResolvedValue({
        wallet: 'W',
        mother: null,
        depth: 0,
        chain: ['W'],
        stoppedBy: 'no_funder',
      });

      await findSiblingWallets('W', { maxDepth: 3 });

      expect(mockTraceChain).toHaveBeenCalledWith('W', { maxDepth: 3 });
    });
  });

  describe('getChildWallets', () => {
    it('finds outgoing SOL transfers from mother', async () => {
      mockGetTxs.mockResolvedValue([
        makeOutgoingTx('MotherAddr', 'ChildA', 2.0, 1000),
        makeOutgoingTx('MotherAddr', 'ChildB', 1.5, 1001),
      ]);

      const result = await getChildWallets('MotherAddr', 'RuggerWallet');

      expect(result).toHaveLength(2);
      expect(result[0].walletAddress).toBe('ChildA');
      expect(result[0].amountReceived).toBe(2.0);
      expect(result[1].walletAddress).toBe('ChildB');
    });

    it('excludes the rugger wallet', async () => {
      mockGetTxs.mockResolvedValue([
        makeOutgoingTx('MotherAddr', 'RuggerWallet', 5.0, 1000),
        makeOutgoingTx('MotherAddr', 'ChildA', 1.0, 1001),
      ]);

      const result = await getChildWallets('MotherAddr', 'RuggerWallet');

      expect(result).toHaveLength(1);
      expect(result[0].walletAddress).toBe('ChildA');
    });

    it('excludes known exchanges', async () => {
      mockGetTxs.mockResolvedValue([
        makeOutgoingTx('MotherAddr', '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', 10.0, 1000),
        makeOutgoingTx('MotherAddr', 'ChildA', 1.0, 1001),
      ]);

      const result = await getChildWallets('MotherAddr', 'Rugger');

      expect(result).toHaveLength(1);
      expect(result[0].walletAddress).toBe('ChildA');
    });

    it('excludes dust transfers', async () => {
      mockGetTxs.mockResolvedValue([
        makeOutgoingTx('MotherAddr', 'ChildA', 0.001, 1000),
        makeOutgoingTx('MotherAddr', 'ChildB', 1.0, 1001),
      ]);

      const result = await getChildWallets('MotherAddr', 'Rugger');

      expect(result).toHaveLength(1);
      expect(result[0].walletAddress).toBe('ChildB');
    });

    it('deduplicates wallets (keeps first occurrence)', async () => {
      mockGetTxs.mockResolvedValue([
        makeOutgoingTx('MotherAddr', 'ChildA', 2.0, 1000),
        makeOutgoingTx('MotherAddr', 'ChildA', 3.0, 1001),
      ]);

      const result = await getChildWallets('MotherAddr', 'Rugger');

      expect(result).toHaveLength(1);
      expect(result[0].amountReceived).toBe(2.0);
    });

    it('respects limit', async () => {
      const txs = Array.from({ length: 10 }, (_, i) =>
        makeOutgoingTx('MotherAddr', `Child${i}`, 1.0, 1000 + i)
      );
      mockGetTxs.mockResolvedValue(txs);

      const result = await getChildWallets('MotherAddr', 'Rugger', 3);

      expect(result).toHaveLength(3);
    });

    it('excludes self-transfers', async () => {
      mockGetTxs.mockResolvedValue([
        makeOutgoingTx('MotherAddr', 'MotherAddr', 5.0, 1000),
        makeOutgoingTx('MotherAddr', 'ChildA', 1.0, 1001),
      ]);

      const result = await getChildWallets('MotherAddr', 'Rugger');

      expect(result).toHaveLength(1);
      expect(result[0].walletAddress).toBe('ChildA');
    });
  });
});
