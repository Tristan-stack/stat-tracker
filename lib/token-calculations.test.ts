import { describe, it, expect } from 'vitest';
import {
  getTargetExitPrice,
  getMaxGainPercent,
  getMaxLossPercent,
  isTargetReached,
  getTokenWithMetrics,
  getAggregateMetrics,
  getMaxConsecutiveLosses,
  getAcceptanceCriteria,
} from './token-calculations';
import type { Token } from '@/types/token';

function makeToken(overrides: Partial<Token> = {}): Token {
  return {
    id: 'test-id',
    name: 'TEST',
    entryPrice: 1,
    high: 2,
    low: 0.5,
    targetExitPercent: 100,
    ...overrides,
  };
}

describe('getTargetExitPrice', () => {
  it('calculates target exit price correctly', () => {
    expect(getTargetExitPrice(100, 50)).toBe(150);
  });

  it('handles 0% target', () => {
    expect(getTargetExitPrice(100, 0)).toBe(100);
  });

  it('handles negative target', () => {
    expect(getTargetExitPrice(100, -20)).toBe(80);
  });

  it('handles zero entry price', () => {
    expect(getTargetExitPrice(0, 100)).toBe(0);
  });

  it('handles 100% target', () => {
    expect(getTargetExitPrice(50, 100)).toBe(100);
  });
});

describe('getMaxGainPercent', () => {
  it('calculates gain percent correctly', () => {
    expect(getMaxGainPercent(100, 150)).toBe(50);
  });

  it('returns 0 for zero entry price', () => {
    expect(getMaxGainPercent(0, 150)).toBe(0);
  });

  it('handles high equal to entry', () => {
    expect(getMaxGainPercent(100, 100)).toBe(0);
  });

  it('handles high below entry', () => {
    expect(getMaxGainPercent(100, 80)).toBe(-20);
  });

  it('handles large gain', () => {
    expect(getMaxGainPercent(10, 110)).toBe(1000);
  });
});

describe('getMaxLossPercent', () => {
  it('calculates loss percent correctly', () => {
    expect(getMaxLossPercent(100, 80)).toBe(-20);
  });

  it('returns 0 for zero entry price', () => {
    expect(getMaxLossPercent(0, 80)).toBe(0);
  });

  it('handles low equal to entry', () => {
    expect(getMaxLossPercent(100, 100)).toBe(0);
  });

  it('handles low above entry (no loss)', () => {
    expect(getMaxLossPercent(100, 120)).toBe(20);
  });

  it('handles complete loss', () => {
    expect(getMaxLossPercent(100, 0)).toBe(-100);
  });
});

describe('isTargetReached', () => {
  it('returns true when high equals target', () => {
    expect(isTargetReached(150, 150)).toBe(true);
  });

  it('returns true when high exceeds target', () => {
    expect(isTargetReached(200, 150)).toBe(true);
  });

  it('returns false when high is below target', () => {
    expect(isTargetReached(100, 150)).toBe(false);
  });
});

describe('getTokenWithMetrics', () => {
  it('computes all metrics for a winning token', () => {
    const token = makeToken({ entryPrice: 100, high: 250, low: 80, targetExitPercent: 100 });
    const result = getTokenWithMetrics(token);

    expect(result.targetExitPrice).toBe(200);
    expect(result.maxGainPercent).toBe(150);
    expect(result.maxLossPercent).toBe(-20);
    expect(result.targetReached).toBe(true);
  });

  it('computes all metrics for a losing token', () => {
    const token = makeToken({ entryPrice: 100, high: 130, low: 60, targetExitPercent: 50 });
    const result = getTokenWithMetrics(token);

    expect(result.targetExitPrice).toBe(150);
    expect(result.maxGainPercent).toBe(30);
    expect(result.maxLossPercent).toBe(-40);
    expect(result.targetReached).toBe(false);
  });

  it('preserves original token properties', () => {
    const token = makeToken({ id: 'xyz', name: 'SOL' });
    const result = getTokenWithMetrics(token);
    expect(result.id).toBe('xyz');
    expect(result.name).toBe('SOL');
  });
});

describe('getAggregateMetrics', () => {
  it('returns zeros for empty array', () => {
    const metrics = getAggregateMetrics([]);
    expect(metrics).toEqual({
      averageMaxGainPercent: 0,
      averageMaxLossPercent: 0,
      averageOptimalTargetPercent: 0,
      targetReachedRate: 0,
      tokenCount: 0,
    });
  });

  it('computes averages for single token', () => {
    const tokens = [makeToken({ entryPrice: 100, high: 200, low: 80, targetExitPercent: 80 })];
    const metrics = getAggregateMetrics(tokens);

    expect(metrics.tokenCount).toBe(1);
    expect(metrics.averageMaxGainPercent).toBe(100);
    expect(metrics.averageMaxLossPercent).toBe(-20);
    expect(metrics.averageOptimalTargetPercent).toBe(80);
    expect(metrics.targetReachedRate).toBe(1);
  });

  it('computes averages for multiple tokens', () => {
    const tokens = [
      makeToken({ entryPrice: 100, high: 200, low: 80, targetExitPercent: 50 }),
      makeToken({ entryPrice: 100, high: 120, low: 50, targetExitPercent: 50 }),
    ];
    const metrics = getAggregateMetrics(tokens);

    expect(metrics.tokenCount).toBe(2);
    expect(metrics.averageMaxGainPercent).toBe((100 + 20) / 2);
    expect(metrics.averageMaxLossPercent).toBe((-20 + -50) / 2);
    expect(metrics.averageOptimalTargetPercent).toBe(50);
    expect(metrics.targetReachedRate).toBe(0.5);
  });

  it('handles all losing tokens', () => {
    const tokens = [
      makeToken({ entryPrice: 100, high: 110, low: 50, targetExitPercent: 50 }),
      makeToken({ entryPrice: 100, high: 120, low: 60, targetExitPercent: 50 }),
    ];
    const metrics = getAggregateMetrics(tokens);

    expect(metrics.targetReachedRate).toBe(0);
  });

  it('handles all winning tokens', () => {
    const tokens = [
      makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 }),
      makeToken({ entryPrice: 100, high: 300, low: 80, targetExitPercent: 50 }),
    ];
    const metrics = getAggregateMetrics(tokens);

    expect(metrics.targetReachedRate).toBe(1);
  });
});

describe('getMaxConsecutiveLosses', () => {
  it('returns 0 for empty array', () => {
    expect(getMaxConsecutiveLosses([])).toBe(0);
  });

  it('returns 0 when all tokens are winners', () => {
    const tokens = [
      makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 }),
      makeToken({ entryPrice: 100, high: 300, low: 80, targetExitPercent: 50 }),
    ];
    expect(getMaxConsecutiveLosses(tokens)).toBe(0);
  });

  it('counts a single loss', () => {
    const tokens = [
      makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 }),
      makeToken({ entryPrice: 100, high: 110, low: 60, targetExitPercent: 50 }),
      makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 }),
    ];
    expect(getMaxConsecutiveLosses(tokens)).toBe(1);
  });

  it('counts consecutive losses correctly', () => {
    const win = makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 });
    const loss = makeToken({ entryPrice: 100, high: 110, low: 60, targetExitPercent: 50 });
    const tokens = [win, loss, loss, loss, win, loss, loss, win];
    expect(getMaxConsecutiveLosses(tokens)).toBe(3);
  });

  it('handles all losses', () => {
    const loss = makeToken({ entryPrice: 100, high: 110, low: 60, targetExitPercent: 50 });
    const tokens = [loss, loss, loss, loss, loss];
    expect(getMaxConsecutiveLosses(tokens)).toBe(5);
  });

  it('handles streak at end', () => {
    const win = makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 });
    const loss = makeToken({ entryPrice: 100, high: 110, low: 60, targetExitPercent: 50 });
    const tokens = [win, win, loss, loss, loss, loss];
    expect(getMaxConsecutiveLosses(tokens)).toBe(4);
  });
});

describe('getAcceptanceCriteria', () => {
  it('returns defaults for empty array', () => {
    const criteria = getAcceptanceCriteria([]);
    expect(criteria.winRate).toBe(0);
    expect(criteria.maxConsecutiveLosses).toBe(0);
    expect(criteria.meetsWinRateCriteria).toBe(false);
    expect(criteria.meetsLossStreakCriteria).toBe(true);
    expect(criteria.meetsAllCriteria).toBe(false);
  });

  it('meets all criteria when win rate >= 45% and max consecutive losses <= 6', () => {
    const win = makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 });
    const loss = makeToken({ entryPrice: 100, high: 110, low: 60, targetExitPercent: 50 });
    const tokens = [win, win, win, win, win, loss, loss, loss, loss];
    const criteria = getAcceptanceCriteria(tokens);

    expect(criteria.winRate).toBeCloseTo(55.56, 1);
    expect(criteria.maxConsecutiveLosses).toBe(4);
    expect(criteria.meetsWinRateCriteria).toBe(true);
    expect(criteria.meetsLossStreakCriteria).toBe(true);
    expect(criteria.meetsAllCriteria).toBe(true);
  });

  it('fails win rate criteria when below 45%', () => {
    const win = makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 });
    const loss = makeToken({ entryPrice: 100, high: 110, low: 60, targetExitPercent: 50 });
    const tokens = [win, win, loss, loss, loss, loss, loss];
    const criteria = getAcceptanceCriteria(tokens);

    expect(criteria.winRate).toBeCloseTo(28.57, 1);
    expect(criteria.meetsWinRateCriteria).toBe(false);
    expect(criteria.meetsAllCriteria).toBe(false);
  });

  it('fails loss streak criteria when exceeding 6', () => {
    const win = makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 });
    const loss = makeToken({ entryPrice: 100, high: 110, low: 60, targetExitPercent: 50 });
    const tokens = Array(10).fill(win).concat(Array(7).fill(loss));
    const criteria = getAcceptanceCriteria(tokens);

    expect(criteria.maxConsecutiveLosses).toBe(7);
    expect(criteria.meetsLossStreakCriteria).toBe(false);
    expect(criteria.meetsAllCriteria).toBe(false);
  });

  it('exactly at 45% win rate passes', () => {
    const win = makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 });
    const loss = makeToken({ entryPrice: 100, high: 110, low: 60, targetExitPercent: 50 });
    const tokens = Array(9).fill(win).concat(Array(11).fill(loss));
    const criteria = getAcceptanceCriteria(tokens);

    expect(criteria.winRate).toBe(45);
    expect(criteria.meetsWinRateCriteria).toBe(true);
  });

  it('exactly 6 consecutive losses passes', () => {
    const win = makeToken({ entryPrice: 100, high: 200, low: 90, targetExitPercent: 50 });
    const loss = makeToken({ entryPrice: 100, high: 110, low: 60, targetExitPercent: 50 });
    const tokens = [...Array(10).fill(win), ...Array(6).fill(loss)];
    const criteria = getAcceptanceCriteria(tokens);

    expect(criteria.maxConsecutiveLosses).toBe(6);
    expect(criteria.meetsLossStreakCriteria).toBe(true);
  });
});
