import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createThrottle } from './throttle';

describe('createThrottle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('le premier appel passe sans attendre', async () => {
    const t = createThrottle(650);
    await expect(t.throttle()).resolves.toBeUndefined();
  });

  it('espace les appels consécutifs de minIntervalMs', async () => {
    const t = createThrottle(650);
    await t.throttle();
    const second = t.throttle();
    let resolved = false;
    void second.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(649);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(resolved).toBe(true);
  });

  it('penalize repousse le prochain créneau', async () => {
    const t = createThrottle(100);
    t.penalize(5000);
    const next = t.throttle();
    let resolved = false;
    void next.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(resolved).toBe(true);
  });
});
