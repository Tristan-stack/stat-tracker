import type { Token, TokenWithMetrics, AggregateMetrics, AcceptanceCriteria } from '@/types/token';

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
      averageEntryPrice: 0,
      averageMaxGainPercent: 0,
      averageMaxLossPercent: 0,
      averageOptimalTargetPercent: 0,
      targetReachedRate: 0,
      tokenCount: 0,
    };
  }
  const withMetrics = tokens.map(getTokenWithMetrics);
  const totalEntry = tokens.reduce((sum, t) => sum + t.entryPrice, 0);
  const totalMaxGain = withMetrics.reduce((sum, t) => sum + t.maxGainPercent, 0);
  const totalMaxLoss = withMetrics.reduce((sum, t) => sum + t.maxLossPercent, 0);
  const totalTargetPercent = tokens.reduce((sum, t) => sum + t.targetExitPercent, 0);
  const reachedCount = withMetrics.filter((t) => t.targetReached).length;
  return {
    averageEntryPrice: totalEntry / tokens.length,
    averageMaxGainPercent: totalMaxGain / tokens.length,
    averageMaxLossPercent: totalMaxLoss / tokens.length,
    averageOptimalTargetPercent: totalTargetPercent / tokens.length,
    targetReachedRate: reachedCount / tokens.length,
    tokenCount: tokens.length,
  };
}

export function getConsecutiveLossStreakInfo(tokens: Token[]): {
  maxLength: number;
  maxLengthOccurrences: number;
} {
  const withMetrics = tokens.map(getTokenWithMetrics);
  let current = 0;
  const streakLengths: number[] = [];
  for (const t of withMetrics) {
    if (!t.targetReached) {
      current++;
    } else {
      if (current > 0) streakLengths.push(current);
      current = 0;
    }
  }
  if (current > 0) streakLengths.push(current);

  if (streakLengths.length === 0) {
    return { maxLength: 0, maxLengthOccurrences: 0 };
  }
  const maxLength = Math.max(...streakLengths);
  const maxLengthOccurrences = streakLengths.filter((l) => l === maxLength).length;
  return { maxLength, maxLengthOccurrences };
}

export function getMaxConsecutiveLosses(tokens: Token[]): number {
  return getConsecutiveLossStreakInfo(tokens).maxLength;
}

export function getAcceptanceCriteria(tokens: Token[]): AcceptanceCriteria {
  if (tokens.length === 0) {
    return {
      winRate: 0,
      maxConsecutiveLosses: 0,
      maxConsecutiveLossOccurrences: 0,
      meetsWinRateCriteria: false,
      meetsLossStreakCriteria: true,
      meetsAllCriteria: false,
    };
  }
  const withMetrics = tokens.map(getTokenWithMetrics);
  const reachedCount = withMetrics.filter((t) => t.targetReached).length;
  const winRate = (reachedCount / tokens.length) * 100;
  const streakInfo = getConsecutiveLossStreakInfo(tokens);
  const maxConsecutiveLosses = streakInfo.maxLength;
  const maxConsecutiveLossOccurrences = streakInfo.maxLengthOccurrences;
  const meetsWinRateCriteria = winRate >= 45;
  const meetsLossStreakCriteria = maxConsecutiveLosses <= 6;
  return {
    winRate,
    maxConsecutiveLosses,
    maxConsecutiveLossOccurrences,
    meetsWinRateCriteria,
    meetsLossStreakCriteria,
    meetsAllCriteria: meetsWinRateCriteria && meetsLossStreakCriteria,
  };
}
