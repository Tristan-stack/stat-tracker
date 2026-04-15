import { describe, it, expect } from 'vitest';
import {
  computeCoverage,
  computeConsistency,
  computeWeights,
  computeActiveDays,
  computeDurationDays,
  scoreWallets,
  type PurchaseData,
  type ScoringInput,
} from './scoring';

function makePurchase(
  tokenAddress: string,
  purchasedAt: string | null = '2024-01-15T12:00:00Z',
  amountSol: number | null = 1
): PurchaseData {
  return { tokenAddress, purchasedAt, amountSol };
}

describe('computeCoverage', () => {
  it('returns 100% when all tokens bought', () => {
    expect(computeCoverage(10, 10)).toBe(100);
  });

  it('returns correct percentage for partial coverage', () => {
    expect(computeCoverage(3, 10)).toBe(30);
  });

  it('returns 0 when no tokens bought', () => {
    expect(computeCoverage(0, 10)).toBe(0);
  });

  it('returns 0 when totalTokens is 0', () => {
    expect(computeCoverage(5, 0)).toBe(0);
  });
});

describe('computeConsistency', () => {
  it('returns high score for full coverage + regular intervals', () => {
    const purchases = Array.from({ length: 10 }, (_, i) =>
      makePurchase(`token${i}`, new Date(2024, 0, 1 + i * 3).toISOString())
    );
    const score = computeConsistency(purchases, 10);
    expect(score).toBeGreaterThan(80);
  });

  it('returns low score for low coverage', () => {
    const purchases = [makePurchase('token0', '2024-01-01T00:00:00Z')];
    const score = computeConsistency(purchases, 10);
    expect(score).toBeLessThan(15);
  });

  it('returns lower score for irregular intervals', () => {
    const regularPurchases = [
      makePurchase('token0', '2024-01-01T00:00:00Z'),
      makePurchase('token1', '2024-01-04T00:00:00Z'),
      makePurchase('token2', '2024-01-07T00:00:00Z'),
      makePurchase('token3', '2024-01-10T00:00:00Z'),
    ];
    const irregularPurchases = [
      makePurchase('token0', '2024-01-01T00:00:00Z'),
      makePurchase('token1', '2024-01-02T00:00:00Z'),
      makePurchase('token2', '2024-01-20T00:00:00Z'),
      makePurchase('token3', '2024-01-21T00:00:00Z'),
    ];

    const regularScore = computeConsistency(regularPurchases, 4);
    const irregularScore = computeConsistency(irregularPurchases, 4);

    expect(regularScore).toBeGreaterThan(irregularScore);
  });

  it('single buy = coverage factor only', () => {
    const purchases = [makePurchase('token0', '2024-01-01T00:00:00Z')];
    const score = computeConsistency(purchases, 5);
    expect(score).toBeCloseTo(20, 0);
  });

  it('returns 0 for no purchases', () => {
    expect(computeConsistency([], 10)).toBe(0);
  });

  it('returns 0 when totalTokens is 0', () => {
    expect(computeConsistency([makePurchase('t')], 0)).toBe(0);
  });
});

describe('computeWeights', () => {
  it('assigns 100 to the wallet spending the most SOL', () => {
    const inputs: ScoringInput[] = [
      { walletAddress: 'W1', purchases: [makePurchase('t1', null, 10)], totalRuggerTokens: 5 },
      { walletAddress: 'W2', purchases: [makePurchase('t1', null, 5)], totalRuggerTokens: 5 },
    ];
    const weights = computeWeights(inputs);
    expect(weights.get('W1')).toBe(100);
    expect(weights.get('W2')).toBeCloseTo(74.72, 1);
  });

  it('falls back to tx count when no SOL data', () => {
    const inputs: ScoringInput[] = [
      {
        walletAddress: 'W1',
        purchases: [makePurchase('t1', null, null), makePurchase('t2', null, null), makePurchase('t3', null, null)],
        totalRuggerTokens: 5,
      },
      {
        walletAddress: 'W2',
        purchases: [makePurchase('t1', null, null)],
        totalRuggerTokens: 5,
      },
    ];
    const weights = computeWeights(inputs);
    expect(weights.get('W1')).toBe(100);
    expect(weights.get('W2')).toBeCloseTo(50, 0);
  });

  it('handles empty inputs', () => {
    const weights = computeWeights([]);
    expect(weights.size).toBe(0);
  });
});

describe('computeActiveDays', () => {
  it('counts distinct days', () => {
    const purchases = [
      makePurchase('t1', '2024-01-01T08:00:00Z'),
      makePurchase('t2', '2024-01-01T20:00:00Z'),
      makePurchase('t3', '2024-01-03T12:00:00Z'),
    ];
    expect(computeActiveDays(purchases)).toBe(2);
  });

  it('returns 0 for no purchases', () => {
    expect(computeActiveDays([])).toBe(0);
  });

  it('ignores purchases without dates', () => {
    const purchases = [makePurchase('t1', null), makePurchase('t2', '2024-01-05T00:00:00Z')];
    expect(computeActiveDays(purchases)).toBe(1);
  });
});

describe('computeDurationDays', () => {
  it('returns days between first and last purchase', () => {
    const purchases = [
      makePurchase('t1', '2024-01-01T00:00:00Z'),
      makePurchase('t2', '2024-01-31T00:00:00Z'),
    ];
    expect(computeDurationDays(purchases)).toBe(30);
  });

  it('returns 0 for single purchase', () => {
    expect(computeDurationDays([makePurchase('t1', '2024-01-01T00:00:00Z')])).toBe(0);
  });

  it('returns 0 for no purchases', () => {
    expect(computeDurationDays([])).toBe(0);
  });
});

describe('scoreWallets', () => {
  it('computes all metrics for a batch of wallets', () => {
    const inputs: ScoringInput[] = [
      {
        walletAddress: 'W1',
        purchases: [
          makePurchase('t1', '2024-01-01T00:00:00Z', 5),
          makePurchase('t2', '2024-01-04T00:00:00Z', 3),
          makePurchase('t3', '2024-01-07T00:00:00Z', 2),
        ],
        totalRuggerTokens: 5,
      },
      {
        walletAddress: 'W2',
        purchases: [makePurchase('t1', '2024-01-01T00:00:00Z', 1)],
        totalRuggerTokens: 5,
      },
    ];

    const results = scoreWallets(inputs);

    expect(results).toHaveLength(2);

    const w1 = results.find((r) => r.walletAddress === 'W1')!;
    expect(w1.tokensBought).toBe(3);
    expect(w1.totalTokens).toBe(5);
    expect(w1.coveragePercent).toBe(60);
    expect(w1.consistency).toBeGreaterThan(0);
    expect(w1.weight).toBe(100);
    expect(w1.activeDaysInScope).toBe(3);
    expect(w1.spanDaysInScope).toBe(6);
    expect(w1.firstBuyAt).toBe('2024-01-01T00:00:00Z');
    expect(w1.lastBuyAt).toBe('2024-01-07T00:00:00Z');

    const w2 = results.find((r) => r.walletAddress === 'W2')!;
    expect(w2.tokensBought).toBe(1);
    expect(w2.weight).toBeCloseTo(28.9, 1);
  });

  it('handles empty input', () => {
    expect(scoreWallets([])).toEqual([]);
  });
});
