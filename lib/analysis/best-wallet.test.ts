import { describe, expect, it } from 'vitest';
import { gainPercent, rankBestWallets } from '@/lib/analysis/best-wallet';

describe('best-wallet ranking', () => {
  it('computes gain percent safely', () => {
    expect(gainPercent(1, 2)).toBe(100);
    expect(gainPercent(0, 2)).toBe(0);
  });

  it('ranks wallets coverage first then TP performance', () => {
    const ranked = rankBestWallets(
      [
        {
          walletAddress: 'A',
          previews: [
            { tokenAddress: 'T1', entryPrice: 1, high: 2 },
            { tokenAddress: 'T2', entryPrice: 1, high: 1.4 },
          ],
        },
        {
          walletAddress: 'B',
          previews: [
            { tokenAddress: 'T1', entryPrice: 1, high: 3 },
          ],
        },
      ],
      ['T1', 'T2'],
      80
    );

    expect(ranked[0]?.walletAddress).toBe('A');
    expect(ranked[0]?.tpHitCount).toBe(1);
    expect(ranked[1]?.walletAddress).toBe('B');
    expect(ranked[1]?.tpHitCount).toBe(1);
  });

  it('returns empty result when no top tokens', () => {
    const ranked = rankBestWallets(
      [{ walletAddress: 'A', previews: [] }],
      [],
      50
    );
    expect(ranked).toEqual([]);
  });
});
