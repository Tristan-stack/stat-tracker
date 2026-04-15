import { describe, expect, it } from 'vitest';
import { runWithConcurrency } from '@/lib/analysis/async-pool';

describe('runWithConcurrency', () => {
  it('returns mapped results preserving item order', async () => {
    const out = await runWithConcurrency([1, 2, 3, 4], 2, async (item) => item * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });

  it('honors minimum concurrency of 1', async () => {
    const out = await runWithConcurrency([1, 2], 0, async (item) => item + 1);
    expect(out).toEqual([2, 3]);
  });
});
