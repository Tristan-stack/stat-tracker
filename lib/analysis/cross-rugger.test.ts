import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('@/lib/db', () => ({ query: (...args: unknown[]) => mockQuery(...args) }));

const { findCrossRuggerWallets } = await import('./cross-rugger');

const USER_ID = 'user-1';

describe('findCrossRuggerWallets', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty array for empty wallet list', async () => {
    const result = await findCrossRuggerWallets(USER_ID, []);
    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns wallets found in multiple ruggers', async () => {
    mockQuery.mockResolvedValueOnce([
      { wallet_address: 'WalletA', rugger_names: 'Rugger1, Rugger2', rugger_ids: 'r1,r2' },
    ]);

    const result = await findCrossRuggerWallets(USER_ID, ['WalletA', 'WalletB']);

    expect(result).toEqual([
      { walletAddress: 'WalletA', ruggerNames: ['Rugger1', 'Rugger2'], ruggerIds: ['r1', 'r2'] },
    ]);
    expect(mockQuery).toHaveBeenCalledOnce();
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('HAVING count(DISTINCT wa.rugger_id) > 1');
  });

  it('returns empty when no wallet is in multiple ruggers', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await findCrossRuggerWallets(USER_ID, ['WalletX']);

    expect(result).toEqual([]);
  });

  it('handles wallet in 3 ruggers correctly', async () => {
    mockQuery.mockResolvedValueOnce([
      { wallet_address: 'WalletC', rugger_names: 'R1, R2, R3', rugger_ids: 'id1,id2,id3' },
    ]);

    const result = await findCrossRuggerWallets(USER_ID, ['WalletC']);

    expect(result).toHaveLength(1);
    expect(result[0].ruggerNames).toHaveLength(3);
    expect(result[0].ruggerIds).toHaveLength(3);
  });

  it('passes user ID as first parameter for isolation', async () => {
    mockQuery.mockResolvedValueOnce([]);

    await findCrossRuggerWallets('other-user', ['W1']);

    expect(mockQuery.mock.calls[0][1]).toEqual(['other-user', 'W1']);
  });
});
