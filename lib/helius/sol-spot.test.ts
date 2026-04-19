import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/helius/client', () => ({
  heliusRpc: vi.fn(),
}));

describe('fetchSolUsdFromHeliusDas', () => {
  it('lit token_info.price_info.price_per_token dans les bornes', async () => {
    const { heliusRpc } = await import('@/lib/helius/client');
    vi.mocked(heliusRpc).mockResolvedValueOnce({
      token_info: { price_info: { price_per_token: 142.5 } },
    });
    const { fetchSolUsdFromHeliusDas } = await import('@/lib/helius/sol-spot');
    await expect(fetchSolUsdFromHeliusDas()).resolves.toBe(142.5);
  });

  it('retourne null si prix hors bornes', async () => {
    const { heliusRpc } = await import('@/lib/helius/client');
    vi.mocked(heliusRpc).mockResolvedValueOnce({
      token_info: { price_info: { price_per_token: 2 } },
    });
    const { fetchSolUsdFromHeliusDas } = await import('@/lib/helius/sol-spot');
    await expect(fetchSolUsdFromHeliusDas()).resolves.toBeNull();
  });

  it('retourne null si price_info absent', async () => {
    const { heliusRpc } = await import('@/lib/helius/client');
    vi.mocked(heliusRpc).mockResolvedValueOnce({ token_info: {} });
    const { fetchSolUsdFromHeliusDas } = await import('@/lib/helius/sol-spot');
    await expect(fetchSolUsdFromHeliusDas()).resolves.toBeNull();
  });
});
