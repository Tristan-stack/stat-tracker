import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FundingChainResult } from '@/types/analysis';

vi.mock('@/lib/helius/funding-chain', () => ({
  traceFundingChain: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
}));

import { traceFundingChain } from '@/lib/helius/funding-chain';
import { query } from '@/lib/db';
import { traceFundingForWallets } from './trace-funding';

const mockTraceFunding = vi.mocked(traceFundingChain);
const mockQuery = vi.mocked(query);

const USER_ID = 'user-123';

function makeChainResult(wallet: string, mother: string | null, depth = 2): FundingChainResult {
  const chain = mother ? [wallet, `intermediate_${wallet}`, mother] : [wallet];
  return { wallet, mother, depth, chain, stoppedBy: mother ? null : 'no_funder' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue([]);
});

describe('traceFundingForWallets', () => {
  it('uses cache on hit — no Helius call made', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        wallet_address: 'WalletA',
        mother_address: 'MotherX',
        funding_depth: 3,
        chain_json: JSON.stringify(['WalletA', 'Mid', 'MotherX']),
      },
    ]);

    const result = await traceFundingForWallets(['WalletA'], USER_ID);

    expect(mockTraceFunding).not.toHaveBeenCalled();
    expect(result.chains).toHaveLength(1);
    expect(result.chains[0].wallet).toBe('WalletA');
    expect(result.chains[0].mother).toBe('MotherX');
    expect(result.chains[0].chain).toEqual(['WalletA', 'Mid', 'MotherX']);
  });

  it('calls Helius on cache miss and stores result', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    mockTraceFunding.mockResolvedValueOnce(makeChainResult('WalletA', 'MotherX'));

    const result = await traceFundingForWallets(['WalletA'], USER_ID);

    expect(mockTraceFunding).toHaveBeenCalledOnce();
    expect(mockTraceFunding).toHaveBeenCalledWith('WalletA', { maxDepth: 5 });
    expect(result.chains[0].mother).toBe('MotherX');

    const insertCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO funding_chain_cache')
    );
    expect(insertCall).toBeDefined();
  });

  it('groups wallets by mother address', async () => {
    mockQuery.mockResolvedValueOnce([]);

    mockTraceFunding
      .mockResolvedValueOnce(makeChainResult('W1', 'MotherA'))
      .mockResolvedValueOnce(makeChainResult('W2', 'MotherA'))
      .mockResolvedValueOnce(makeChainResult('W3', 'MotherB'));

    const result = await traceFundingForWallets(['W1', 'W2', 'W3'], USER_ID);

    expect(result.mothers).toHaveLength(2);

    const motherA = result.mothers.find((m) => m.address === 'MotherA')!;
    expect(motherA.walletsFunded).toBe(2);
    expect(motherA.wallets).toEqual(['W1', 'W2']);

    const motherB = result.mothers.find((m) => m.address === 'MotherB')!;
    expect(motherB.walletsFunded).toBe(1);
  });

  it('sorts mothers by walletsFunded descending', async () => {
    mockQuery.mockResolvedValueOnce([]);

    mockTraceFunding
      .mockResolvedValueOnce(makeChainResult('W1', 'SmallMother'))
      .mockResolvedValueOnce(makeChainResult('W2', 'BigMother'))
      .mockResolvedValueOnce(makeChainResult('W3', 'BigMother'))
      .mockResolvedValueOnce(makeChainResult('W4', 'BigMother'));

    const result = await traceFundingForWallets(['W1', 'W2', 'W3', 'W4'], USER_ID);

    expect(result.mothers[0].address).toBe('BigMother');
    expect(result.mothers[0].walletsFunded).toBe(3);
    expect(result.mothers[1].address).toBe('SmallMother');
  });

  it('excludes wallets with no mother from mothers list', async () => {
    mockQuery.mockResolvedValueOnce([]);

    mockTraceFunding
      .mockResolvedValueOnce(makeChainResult('W1', null))
      .mockResolvedValueOnce(makeChainResult('W2', 'MotherA'));

    const result = await traceFundingForWallets(['W1', 'W2'], USER_ID);

    expect(result.mothers).toHaveLength(1);
    expect(result.mothers[0].address).toBe('MotherA');
  });

  it('respects forceRefresh option — skips cache', async () => {
    mockTraceFunding.mockResolvedValueOnce(makeChainResult('WalletA', 'MotherX'));
    mockQuery.mockResolvedValue([]);

    const result = await traceFundingForWallets(['WalletA'], USER_ID, { forceRefresh: true });

    expect(mockTraceFunding).toHaveBeenCalledOnce();
    expect(result.chains[0].mother).toBe('MotherX');

    const selectCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('SELECT')
    );
    expect(selectCall).toBeUndefined();
  });

  it('passes custom maxDepth to traceFundingChain', async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockTraceFunding.mockResolvedValueOnce(makeChainResult('W1', 'M'));
    mockQuery.mockResolvedValue([]);

    await traceFundingForWallets(['W1'], USER_ID, { maxDepth: 3 });

    expect(mockTraceFunding).toHaveBeenCalledWith('W1', { maxDepth: 3 });
  });

  it('handles empty wallet list', async () => {
    const result = await traceFundingForWallets([], USER_ID);

    expect(result.chains).toHaveLength(0);
    expect(result.mothers).toHaveLength(0);
    expect(mockTraceFunding).not.toHaveBeenCalled();
  });
});
