export interface Token {
  id: string;
  name: string;
  entryPrice: number;
  high: number;
  low: number;
  targetExitPercent: number;
}

export interface TokenWithMetrics extends Token {
  targetExitPrice: number;
  maxGainPercent: number;
  maxLossPercent: number;
  targetReached: boolean;
}

export interface AggregateMetrics {
  averageMaxGainPercent: number;
  averageOptimalTargetPercent: number;
  targetReachedRate: number;
  tokenCount: number;
}
