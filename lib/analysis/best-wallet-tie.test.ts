import { describe, expect, it } from 'vitest';
import {
  BEST_WALLET_TIE_ABSOLUTE_MAX,
  computeTieCapMeta,
  resolveBestWalletTieMax,
} from '@/lib/analysis/best-wallet-tie';

describe('resolveBestWalletTieMax', () => {
  it('uses query param when valid', () => {
    expect(resolveBestWalletTieMax('30', 120)).toBe(30);
  });

  it('clamps query param to absolute max', () => {
    expect(resolveBestWalletTieMax('9999', 120)).toBe(BEST_WALLET_TIE_ABSOLUTE_MAX);
  });

  it('falls back to env when param missing', () => {
    expect(resolveBestWalletTieMax(null, 50)).toBe(50);
  });

  it('uses default when env invalid', () => {
    expect(resolveBestWalletTieMax(null, NaN)).toBe(120);
  });
});

describe('computeTieCapMeta', () => {
  it('detects cap when tie group exceeds max', () => {
    expect(computeTieCapMeta(100, 80, 80)).toEqual({ tieCapApplied: true, tiedAfterCap: 80 });
  });

  it('no cap when all ties fit', () => {
    expect(computeTieCapMeta(5, 5, 120)).toEqual({ tieCapApplied: false, tiedAfterCap: 5 });
  });
});
