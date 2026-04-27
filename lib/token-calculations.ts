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
  distribution: Array<{ length: number; occurrences: number }>;
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
    return { maxLength: 0, maxLengthOccurrences: 0, distribution: [] };
  }

  const counts = new Map<number, number>();
  for (const len of streakLengths) {
    counts.set(len, (counts.get(len) ?? 0) + 1);
  }
  const distribution = [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([length, occurrences]) => ({ length, occurrences }));

  const maxLength = distribution[0].length;
  const maxLengthOccurrences = distribution[0].occurrences;
  return { maxLength, maxLengthOccurrences, distribution };
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
      lossStreakDistribution: [],
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
  const lossStreakDistribution = streakInfo.distribution;
  const meetsWinRateCriteria = winRate >= 45;
  const meetsLossStreakCriteria = maxConsecutiveLosses <= 6;
  return {
    winRate,
    maxConsecutiveLosses,
    maxConsecutiveLossOccurrences,
    lossStreakDistribution,
    meetsWinRateCriteria,
    meetsLossStreakCriteria,
    meetsAllCriteria: meetsWinRateCriteria && meetsLossStreakCriteria,
  };
}

/**
 * Résultat d’une stratégie de sortie (TP) simulée sur l’historique.
 * `winRate` est entre 0 et 1 (comme dans l’UI : ×100 pour afficher en %).
 * En mode « MCap », `value` est le **niveau de prix** visé (même unité que `high`), pas une capitalisation USD.
 */
export interface OptimalExitResult {
  value: number;
  avgProfitPercent: number;
  winCount: number;
  winRate: number;
  avgGainPerWinner: number;
  avgLossPerLoser: number;
  total: number;
}

export interface OptimalEntryMcapFilterResult {
  kind: 'min' | 'max';
  value: number;
  tokenCount: number;
  coverageRate: number;
  avgRealisticPercent: number;
  avgGainPercent: number;
  avgLossPercent: number;
}

function scoreOptimal(avgProfit: number, winRate: number): number {
  if (avgProfit <= 0) return -Infinity;
  return avgProfit * winRate;
}

function buildOptimalResult(
  value: number,
  totalGain: number,
  totalLoss: number,
  wins: number,
  total: number
): { result: OptimalExitResult; score: number } {
  const losers = total - wins;
  const avg = (totalGain + totalLoss) / total;
  const winRate = wins / total;
  return {
    result: {
      value,
      avgProfitPercent: avg,
      winCount: wins,
      winRate,
      avgGainPerWinner: wins > 0 ? totalGain / wins : 0,
      avgLossPerLoser: losers > 0 ? totalLoss / losers : 0,
      total,
    },
    score: scoreOptimal(avg, winRate),
  };
}

/** Objectif % qui maximise rentabilité moyenne × taux de réussite (même logique que le résumé UI). */
export function findOptimalPercent(twm: TokenWithMetrics[]): OptimalExitResult | null {
  if (twm.length === 0) return null;

  const candidates = [...new Set(twm.map((t) => t.maxGainPercent).filter((g) => g >= 0))].sort(
    (a, b) => a - b
  );
  if (candidates.length === 0) return null;

  let best: { result: OptimalExitResult; score: number } | null = null;

  for (const target of candidates) {
    let totalGain = 0;
    let totalLoss = 0;
    let wins = 0;
    for (const t of twm) {
      if (t.maxGainPercent >= target) {
        totalGain += target;
        wins++;
      } else {
        totalLoss += t.maxLossPercent;
      }
    }
    const candidate = buildOptimalResult(target, totalGain, totalLoss, wins, twm.length);
    if (best === null || candidate.score > best.score) best = candidate;
  }

  return best && best.result.avgProfitPercent > 0 ? best.result : null;
}

/**
 * Objectif « MCap » = niveau de prix `high` atteignable ; même score que pour le %.
 */
export function findOptimalMcap(twm: TokenWithMetrics[]): OptimalExitResult | null {
  if (twm.length === 0) return null;

  const candidates = [...new Set(twm.map((t) => t.high).filter((h) => h > 0))].sort((a, b) => a - b);
  if (candidates.length === 0) return null;

  let best: { result: OptimalExitResult; score: number } | null = null;

  for (const mcap of candidates) {
    let totalGain = 0;
    let totalLoss = 0;
    let wins = 0;
    for (const t of twm) {
      if (t.high >= mcap) {
        totalGain += ((mcap / t.entryPrice) - 1) * 100;
        wins++;
      } else {
        totalLoss += t.maxLossPercent;
      }
    }
    const candidate = buildOptimalResult(mcap, totalGain, totalLoss, wins, twm.length);
    if (best === null || candidate.score > best.score) best = candidate;
  }

  return best && best.result.avgProfitPercent > 0 ? best.result : null;
}

export type SnipeSuggestionMode = 'percent' | 'mcap' | 'tie';

export function suggestSnipeMode(
  optimalPercent: OptimalExitResult | null,
  optimalMcap: OptimalExitResult | null
): { mode: SnipeSuggestionMode; summary: string } {
  if (!optimalPercent && !optimalMcap) {
    return {
      mode: 'tie',
      summary: 'Pas assez de données pour comparer % et MCap.',
    };
  }
  if (!optimalMcap) {
    return {
      mode: 'percent',
      summary: 'Seul le mode % est calculable sur cet historique.',
    };
  }
  if (!optimalPercent) {
    return {
      mode: 'mcap',
      summary: 'Seul le mode MCap est calculable sur cet historique.',
    };
  }
  const p = optimalPercent;
  const m = optimalMcap;
  if (p.winCount > m.winCount) {
    return {
      mode: 'percent',
      summary: `Le mode % atteint plus souvent le TP (${p.winCount}/${p.total} vs ${m.winCount}/${m.total}).`,
    };
  }
  if (m.winCount > p.winCount) {
    return {
      mode: 'mcap',
      summary: `Le mode MCap atteint plus souvent le TP (${m.winCount}/${m.total} vs ${p.winCount}/${p.total}).`,
    };
  }
  if (p.avgProfitPercent > m.avgProfitPercent) {
    return {
      mode: 'percent',
      summary: `Même nombre de TP atteints ; le mode % est plus rentable en moyenne sur le mouvement.`,
    };
  }
  if (m.avgProfitPercent > p.avgProfitPercent) {
    return {
      mode: 'mcap',
      summary: `Même nombre de TP atteints ; le mode MCap est plus rentable en moyenne sur le mouvement.`,
    };
  }
  return {
    mode: 'tie',
    summary: 'Les deux modes sont équivalents sur le score et le nombre de TP atteints.',
  };
}

function scoreEntryMcapFilter(avgRealisticPercent: number, coverageRate: number): number {
  if (coverageRate <= 0) return -Infinity;
  return avgRealisticPercent * coverageRate;
}

export function findOptimalEntryMcapFilter(
  twm: TokenWithMetrics[],
  kind: 'min' | 'max'
): OptimalEntryMcapFilterResult | null {
  if (twm.length === 0) return null;

  const candidates = [...new Set(twm.map((t) => t.entryPrice).filter((v) => v > 0))].sort((a, b) => a - b);
  if (candidates.length === 0) return null;

  let best: { result: OptimalEntryMcapFilterResult; score: number } | null = null;
  const totalCount = twm.length;

  for (const candidateValue of candidates) {
    const filtered =
      kind === 'min'
        ? twm.filter((t) => t.entryPrice >= candidateValue)
        : twm.filter((t) => t.entryPrice <= candidateValue);
    if (filtered.length === 0) continue;

    const gainValues = filtered.map((t) => t.targetExitPercent);
    const lossValues = filtered.map((t) => t.maxLossPercent);
    const realisticValues = filtered.map((t) => (t.targetReached ? t.targetExitPercent : t.maxLossPercent));

    const avgGainPercent = gainValues.reduce((sum, v) => sum + v, 0) / filtered.length;
    const avgLossPercent = lossValues.reduce((sum, v) => sum + v, 0) / filtered.length;
    const avgRealisticPercent = realisticValues.reduce((sum, v) => sum + v, 0) / filtered.length;
    const coverageRate = filtered.length / totalCount;

    const result: OptimalEntryMcapFilterResult = {
      kind,
      value: candidateValue,
      tokenCount: filtered.length,
      coverageRate,
      avgRealisticPercent,
      avgGainPercent,
      avgLossPercent,
    };
    const score = scoreEntryMcapFilter(avgRealisticPercent, coverageRate);
    if (best === null || score > best.score) best = { result, score };
  }

  return best?.result ?? null;
}
