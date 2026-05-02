import { describe, expect, it } from 'vitest';
import { buildFallbackStrategy } from '@/lib/ai/rugger-strategy';
import type { RuggerAiContext } from '@/lib/ai/rugger-context';

function buildContext(overrides?: Partial<RuggerAiContext>): RuggerAiContext {
  return {
    ruggerId: 'rugger-1',
    tokenCount: 2,
    nowIso: new Date().toISOString(),
    tokens: [
      {
        id: 'a',
        name: 'mint-a',
        entryPrice: 100_000,
        high: 250_000,
        low: 70_000,
        targetExitPercent: 80,
        purchasedAt: new Date().toISOString(),
      },
      {
        id: 'b',
        name: 'mint-b',
        entryPrice: 140_000,
        high: 210_000,
        low: 100_000,
        targetExitPercent: 60,
        purchasedAt: new Date().toISOString(),
      },
    ],
    trends: {
      last7d: { tokenCount: 2, avgMaxGainPercent: 70, avgMaxLossPercent: -25, targetHitRatePercent: 60 },
      last14d: { tokenCount: 2, avgMaxGainPercent: 70, avgMaxLossPercent: -25, targetHitRatePercent: 60 },
      last30d: { tokenCount: 2, avgMaxGainPercent: 70, avgMaxLossPercent: -25, targetHitRatePercent: 60 },
      previous30d: {
        tokenCount: 10,
        avgMaxGainPercent: 90,
        avgMaxLossPercent: -20,
        targetHitRatePercent: 80,
      },
    },
    statusBreakdown: { verification: 2 },
    latestAnalysis: null,
    ...overrides,
  };
}

describe('buildFallbackStrategy', () => {
  it('returns a strategy payload with structured filters', () => {
    const strategy = buildFallbackStrategy(buildContext());
    expect(strategy.recommendedStrategy.length).toBeGreaterThan(10);
    expect(strategy.suggestedFilters.entryMcapMin).toBeTypeOf('number');
    expect(strategy.suggestedFilters.entryMcapMax).toBeTypeOf('number');
    expect(strategy.confidence).toBe('low');
  });

  it('warns when recent trend sharply degrades', () => {
    const strategy = buildFallbackStrategy(buildContext());
    expect(strategy.trendShiftWarning).toContain('Baisse nette de performance récente');
  });
});
