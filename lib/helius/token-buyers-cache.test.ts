import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TokenBuyer } from '@/types/analysis';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));

import { query } from '@/lib/db';
import {
  loadCachedTokenBuyers,
  storeCachedTokenBuyers,
  tokenBuyersCacheTtlMs,
} from './token-buyers-cache';

const mockQuery = vi.mocked(query);

function makeBuyer(wallet: string): TokenBuyer {
  return {
    walletAddress: wallet,
    tokenAddress: 'Mint',
    tokenName: null,
    purchasedAt: '2025-01-01T00:00:00Z',
    amountSol: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('tokenBuyersCacheTtlMs', () => {
  it('défaut 24h quand env absent', () => {
    expect(tokenBuyersCacheTtlMs()).toBe(24 * 3_600_000);
  });

  it('clamp sous le minimum à 1h', () => {
    vi.stubEnv('TOKEN_BUYERS_CACHE_TTL_HOURS', '0');
    expect(tokenBuyersCacheTtlMs()).toBe(3_600_000);
  });

  it('clamp au-dessus du maximum à 720h', () => {
    vi.stubEnv('TOKEN_BUYERS_CACHE_TTL_HOURS', '100000');
    expect(tokenBuyersCacheTtlMs()).toBe(720 * 3_600_000);
  });

  it('respecte une valeur valide', () => {
    vi.stubEnv('TOKEN_BUYERS_CACHE_TTL_HOURS', '6');
    expect(tokenBuyersCacheTtlMs()).toBe(6 * 3_600_000);
  });
});

describe('loadCachedTokenBuyers', () => {
  it('renvoie null sur cache vide', async () => {
    mockQuery.mockResolvedValueOnce([]);
    expect(await loadCachedTokenBuyers('Mint', 50)).toBeNull();
  });

  it('parse les buyers et tronque à limit', async () => {
    const buyers = ['W0', 'W1', 'W2', 'W3', 'W4'].map(makeBuyer);
    mockQuery.mockResolvedValueOnce([{ buyers_json: JSON.stringify(buyers) }]);

    const out = await loadCachedTokenBuyers('Mint', 3);

    expect(out).toHaveLength(3);
    expect(out?.[0].walletAddress).toBe('W0');
  });

  it('dégrade en miss (null) si la table est absente / DB en erreur', async () => {
    mockQuery.mockRejectedValueOnce(new Error('relation "token_buyers_cache" does not exist'));
    expect(await loadCachedTokenBuyers('Mint', 50)).toBeNull();
  });

  it('renvoie null pour un mint vide sans toucher la DB', async () => {
    expect(await loadCachedTokenBuyers('   ', 50)).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('storeCachedTokenBuyers', () => {
  it('insère avec ON CONFLICT (token_mint, buyer_limit) et sérialise les buyers', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const buyers = [makeBuyer('W1')];

    await storeCachedTokenBuyers('Mint', 50, buyers);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('on conflict (token_mint, buyer_limit)');
    expect(params[0]).toBe('Mint');
    expect(params[1]).toBe(50);
    expect(JSON.parse(params[2] as string)).toEqual(buyers);
  });

  it('avale les erreurs DB sans throw (cache best-effort)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(storeCachedTokenBuyers('Mint', 50, [])).resolves.toBeUndefined();
  });
});
