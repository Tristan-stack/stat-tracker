import type { Token, TokenWithMetrics, AggregateMetrics } from '@/types/token';

export function getTargetExitPrice(entryPrice: number, targetExitPercent: number): number {
  return entryPrice * (1 + targetExitPercent / 100);
}

export function getMaxGainPercent(entryPrice: number, high: number): number {
  if (entryPrice <= 0) return 0;
  return ((high - entryPrice) / entryPrice) * 100;
}

export function getMaxLossPercent(entryPrice: number, low: number): number {
  if (entryPrice <= 0) return 0;
  return ((low - entryPrice) / entryPrice) * 100;
}

export function isTargetReached(high: number, targetExitPrice: number): boolean {
  return high >= targetExitPrice;
}

export function getTokenWithMetrics(token: Token): TokenWithMetrics {
  const targetExitPrice = getTargetExitPrice(token.entryPrice, token.targetExitPercent);
  const maxGainPercent = getMaxGainPercent(token.entryPrice, token.high);
  const maxLossPercent = getMaxLossPercent(token.entryPrice, token.low);
  const targetReached = isTargetReached(token.high, targetExitPrice);
  return {
    ...token,
    targetExitPrice,
    maxGainPercent,
    maxLossPercent,
    targetReached,
  };
}

export function getAggregateMetrics(tokens: Token[]): AggregateMetrics {
  if (tokens.length === 0) {
    return {
      averageMaxGainPercent: 0,
      averageMaxLossPercent: 0,
      averageOptimalTargetPercent: 0,
      targetReachedRate: 0,
      tokenCount: 0,
    };
  }
  const withMetrics = tokens.map(getTokenWithMetrics);
  const totalMaxGain = withMetrics.reduce((sum, t) => sum + t.maxGainPercent, 0);
  const totalMaxLoss = withMetrics.reduce((sum, t) => sum + t.maxLossPercent, 0);
  const totalTargetPercent = tokens.reduce((sum, t) => sum + t.targetExitPercent, 0);
  const reachedCount = withMetrics.filter((t) => t.targetReached).length;
  return {
    averageMaxGainPercent: totalMaxGain / tokens.length,
    averageMaxLossPercent: totalMaxLoss / tokens.length,
    averageOptimalTargetPercent: totalTargetPercent / tokens.length,
    targetReachedRate: reachedCount / tokens.length,
    tokenCount: tokens.length,
  };
}
