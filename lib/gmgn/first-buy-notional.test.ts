import { describe, expect, it } from 'vitest';
import { GMGN_WSOL_MINT, mergeNotionalWithSolUsd, parseFirstBuyNotional, parseFlexiblePositive } from '@/lib/gmgn/first-buy-notional';
import type { WalletActivityRow } from '@/lib/gmgn/client';

describe('parseFlexiblePositive', () => {
  it('accepte nombre et chaînes FR', () => {
    expect(parseFlexiblePositive(12.5)).toBe(12.5);
    expect(parseFlexiblePositive('3,14')).toBeCloseTo(3.14);
    expect(parseFlexiblePositive('')).toBeNull();
    expect(parseFlexiblePositive(0)).toBeNull();
    expect(parseFlexiblePositive(-1)).toBeNull();
  });
});

describe('parseFirstBuyNotional', () => {
  it('lit amount_usd et cost_sol plats', () => {
    const row = {
      amount_usd: '42.5',
      cost_sol: '0.25',
    } as unknown as WalletActivityRow;
    expect(parseFirstBuyNotional(row)).toEqual({ usd: 42.5, sol: 0.25 });
  });

  it('lit quote_amount quand quote_token est WSOL', () => {
    const row = {
      quote_token: { address: GMGN_WSOL_MINT, symbol: 'SOL' },
      quote_amount: '1.5',
    } as unknown as WalletActivityRow;
    expect(parseFirstBuyNotional(row)).toEqual({ usd: null, sol: 1.5 });
  });

  it('lit volume imbriqué', () => {
    const row = {
      volume: { volume_usd: '100', volume_sol: '0.5' },
    } as unknown as WalletActivityRow;
    expect(parseFirstBuyNotional(row)).toEqual({ usd: 100, sol: 0.5 });
  });
});

describe('mergeNotionalWithSolUsd', () => {
  it('déduit SOL depuis USD', () => {
    expect(mergeNotionalWithSolUsd({ usd: 200, sol: null }, 100)).toEqual({ usd: 200, sol: 2 });
  });

  it('déduit USD depuis SOL', () => {
    expect(mergeNotionalWithSolUsd({ usd: null, sol: 2 }, 100)).toEqual({ usd: 200, sol: 2 });
  });

  it('ne change rien si solUsd absent', () => {
    expect(mergeNotionalWithSolUsd({ usd: 10, sol: null }, null)).toEqual({ usd: 10, sol: null });
  });

  it('ignore solUsd nul ou négatif', () => {
    expect(mergeNotionalWithSolUsd({ usd: 10, sol: null }, 0)).toEqual({ usd: 10, sol: null });
  });
});
