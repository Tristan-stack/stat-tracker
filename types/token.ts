import type { StatusId } from './rugger';

export type ExitMode = 'percent' | 'mcap';

export interface Token {
  id: string;
  /** Identifiant canonique : adresse mint (Solana) lorsqu’elle est connue. */
  name: string;
  /** Nom / symbole affiché (optionnel). */
  tokenName?: string;
  entryPrice: number;
  high: number;
  low: number;
  targetExitPercent: number;
  statusId?: StatusId;
  /** Date d’achat (ISO) — optionnel ; tri/filtre via coalesce avec createdAt côté API. */
  purchasedAt?: string;
  /** Mint Solana — optionnel (import GMGN). */
  tokenAddress?: string;
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
  /** Nombre de séries distinctes dont la longueur est égale au max de pertes consécutives. */
  maxConsecutiveLossOccurrences: number;
  /** Répartition complète des séries de pertes consécutives (longueur -> occurrences), triée décroissante. */
  lossStreakDistribution: Array<{ length: number; occurrences: number }>;
  meetsWinRateCriteria: boolean;
  meetsLossStreakCriteria: boolean;
  meetsAllCriteria: boolean;
}
