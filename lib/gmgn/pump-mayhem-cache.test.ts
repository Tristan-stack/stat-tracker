import { afterEach, describe, expect, it, vi } from 'vitest';

describe('gmgnMayhemCacheTtlSeconds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses default 604800 when env empty', async () => {
    vi.stubEnv('GMGN_MAYHEM_CACHE_TTL_SECONDS', '');
    vi.resetModules();
    const { gmgnMayhemCacheTtlSeconds } = await import('@/lib/gmgn/pump-mayhem-cache');
    expect(gmgnMayhemCacheTtlSeconds()).toBe(604800);
  });

  it('clamps below minimum to 120', async () => {
    vi.stubEnv('GMGN_MAYHEM_CACHE_TTL_SECONDS', '10');
    vi.resetModules();
    const { gmgnMayhemCacheTtlSeconds } = await import('@/lib/gmgn/pump-mayhem-cache');
    expect(gmgnMayhemCacheTtlSeconds()).toBe(120);
  });

  it('clamps above maximum to 30 days', async () => {
    vi.stubEnv('GMGN_MAYHEM_CACHE_TTL_SECONDS', '999999999');
    vi.resetModules();
    const { gmgnMayhemCacheTtlSeconds } = await import('@/lib/gmgn/pump-mayhem-cache');
    expect(gmgnMayhemCacheTtlSeconds()).toBe(2592000);
  });
});
