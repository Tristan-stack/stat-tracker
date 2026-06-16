import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// HELIUS_RPS=10 → 100 ms entre appels ; HELIUS_TRACER_RPS=100 → 10 ms. On vérifie que
// `enterTracerThrottle` bascule bien `throttleHelius` sur le throttle rapide du tracer.
describe('throttleHelius — routing défaut vs tracer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('HELIUS_RPS', '10');
    vi.stubEnv('HELIUS_TRACER_RPS', '100');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('par défaut, espace les appels de l’intervalle HELIUS_RPS (100 ms)', async () => {
    const { throttleHelius } = await import('./throttle');
    await throttleHelius(); // 1er créneau : immédiat
    const second = throttleHelius();
    let resolved = false;
    void second.then(() => { resolved = true; });

    await vi.advanceTimersByTimeAsync(99);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(resolved).toBe(true);
  });

  it('sous enterTracerThrottle, utilise l’intervalle HELIUS_TRACER_RPS (10 ms)', async () => {
    const { throttleHelius, enterTracerThrottle } = await import('./throttle');
    enterTracerThrottle();
    await throttleHelius(); // 1er créneau : immédiat
    const second = throttleHelius();
    let resolved = false;
    void second.then(() => { resolved = true; });

    await vi.advanceTimersByTimeAsync(9);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(resolved).toBe(true);
  });
});
