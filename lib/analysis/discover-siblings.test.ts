import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/helius/sibling-wallets', () => ({
  findSiblingWallets: vi.fn(),
  getChildWallets: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
}));

import { findSiblingWallets, getChildWallets } from '@/lib/helius/sibling-wallets';
import { query } from '@/lib/db';
import { discoverSiblingWallets } from './discover-siblings';

const mockFindSiblings = vi.mocked(findSiblingWallets);
const mockGetChildren = vi.mocked(getChildWallets);
const mockQuery = vi.mocked(query);

const USER_ID = 'user-123';
const RUGGER_WALLET = 'RuggerWallet';

describe('discoverSiblingWallets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
  });

  it('uses cache when available', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        mother_address: 'MotherAddr',
        chain_json: JSON.stringify(['RuggerWallet', 'MotherAddr']),
      },
    ]);

    mockGetChildren.mockResolvedValue([
      { walletAddress: 'SibA', motherAddress: 'MotherAddr', amountReceived: 1.5, receivedAt: '2025-01-01T00:00:00.000Z' },
    ]);

    const result = await discoverSiblingWallets(RUGGER_WALLET, USER_ID);

    expect(result.motherAddress).toBe('MotherAddr');
    expect(result.siblings).toHaveLength(1);
    expect(mockFindSiblings).not.toHaveBeenCalled();
  });

  it('calls Helius on cache miss and stores result', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockFindSiblings.mockResolvedValue({
      motherAddress: 'MotherAddr',
      ruggerChain: ['RuggerWallet', 'MotherAddr'],
      siblings: [
        { walletAddress: 'SibA', motherAddress: 'MotherAddr', amountReceived: 2.0, receivedAt: '2025-01-01T00:00:00.000Z' },
      ],
    });

    const result = await discoverSiblingWallets(RUGGER_WALLET, USER_ID);

    expect(result.motherAddress).toBe('MotherAddr');
    expect(result.siblings).toHaveLength(1);
    expect(mockFindSiblings).toHaveBeenCalledWith(RUGGER_WALLET, { maxDepth: 5, siblingLimit: 200 });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('skips cache when forceRefresh is true', async () => {
    mockFindSiblings.mockResolvedValue({
      motherAddress: 'MotherAddr',
      ruggerChain: ['RuggerWallet', 'MotherAddr'],
      siblings: [],
    });

    mockQuery.mockResolvedValue([]);

    await discoverSiblingWallets(RUGGER_WALLET, USER_ID, { forceRefresh: true });

    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      expect.anything()
    );
    expect(mockFindSiblings).toHaveBeenCalled();
  });

  it('does not cache when no mother found', async () => {
    mockQuery.mockResolvedValueOnce([]);

    mockFindSiblings.mockResolvedValue({
      motherAddress: null,
      ruggerChain: ['RuggerWallet'],
      siblings: [],
    });

    const result = await discoverSiblingWallets(RUGGER_WALLET, USER_ID);

    expect(result.motherAddress).toBeNull();
    expect(result.siblings).toHaveLength(0);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('passes custom options to findSiblingWallets', async () => {
    mockQuery.mockResolvedValueOnce([]);

    mockFindSiblings.mockResolvedValue({
      motherAddress: null,
      ruggerChain: ['RuggerWallet'],
      siblings: [],
    });

    await discoverSiblingWallets(RUGGER_WALLET, USER_ID, { maxDepth: 3, siblingLimit: 50 });

    expect(mockFindSiblings).toHaveBeenCalledWith(RUGGER_WALLET, { maxDepth: 3, siblingLimit: 50 });
  });

  it('returns cached chain with null mother as miss', async () => {
    mockQuery.mockResolvedValueOnce([
      { mother_address: null, chain_json: JSON.stringify(['RuggerWallet']) },
    ]);

    mockFindSiblings.mockResolvedValue({
      motherAddress: null,
      ruggerChain: ['RuggerWallet'],
      siblings: [],
    });

    const result = await discoverSiblingWallets(RUGGER_WALLET, USER_ID);

    expect(mockFindSiblings).toHaveBeenCalled();
    expect(result.motherAddress).toBeNull();
  });
});
