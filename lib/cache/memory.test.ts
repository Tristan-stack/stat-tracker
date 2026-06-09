import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMemoryCache } from './memory';

afterEach(() => vi.useRealTimers());

describe('createMemoryCache', () => {
  it('get retourne null pour une clé absente', () => {
    const c = createMemoryCache<number>();
    expect(c.get('x')).toBeNull();
  });

  it('set/get conserve la valeur dans le TTL', () => {
    const c = createMemoryCache<string>();
    c.set('k', 'v', 1000);
    expect(c.get('k')).toBe('v');
  });

  it('expire après le TTL', () => {
    vi.useFakeTimers();
    const c = createMemoryCache<string>();
    c.set('k', 'v', 1000);
    vi.advanceTimersByTime(1001);
    expect(c.get('k')).toBeNull();
  });

  it('invalidateByPrefix supprime les clés correspondantes', () => {
    const c = createMemoryCache<number>();
    c.set('a:1', 1, 10000);
    c.set('a:2', 2, 10000);
    c.set('b:1', 3, 10000);
    expect(c.invalidateByPrefix('a:')).toBe(2);
    expect(c.get('a:1')).toBeNull();
    expect(c.get('b:1')).toBe(3);
    expect(c.size()).toBe(1);
  });
});
