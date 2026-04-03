import type { StatusId } from './rugger';

export type ExitMode = 'percent' | 'mcap';

export interface Token {
  id: string;
  name: string;
  entryPrice: number;
  high: number;
  low: number;
  targetExitPercent: number;
  statusId?: StatusId;
  /** Exclu des statistiques et simulations (ligne toujours visible dans le tableau). */
  hidden?: boolean;
}

export interface TokenWithMetrics extends Token {
  targetExitPrice: number;
  maxGainPercent: number;
  maxLossPercent: number;
  targetReached: boolean;
}

export interface AggregateMetrics {
  averageEntryPrice: number;
  averageMaxGainPercent: number;
  averageMaxLossPercent: number;
  averageOptimalTargetPercent: number;
  targetReachedRate: number;
  tokenCount: number;
}

export interface AcceptanceCriteria {
  winRate: number;
  maxConsecutiveLosses: number;
  meetsWinRateCriteria: boolean;
  meetsLossStreakCriteria: boolean;
  meetsAllCriteria: boolean;
}
