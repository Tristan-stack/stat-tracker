import { getTokenWithMetrics } from '@/lib/token-calculations';
import type { AiStrategyPayload } from '@/types/ai';
import type { RuggerAiContext } from '@/lib/ai/rugger-context';

function clampConfidence(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.66) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export function buildFallbackStrategy(context: RuggerAiContext): AiStrategyPayload {
  const withMetrics = context.tokens.map(getTokenWithMetrics);
  const sortedByGain = [...withMetrics].sort((a, b) => b.maxGainPercent - a.maxGainPercent);
  const topHalf = sortedByGain.slice(0, Math.max(1, Math.floor(sortedByGain.length / 2)));

  const avgTopEntry =
    topHalf.length > 0 ? topHalf.reduce((acc, item) => acc + item.entryPrice, 0) / topHalf.length : 0;
  const avgTopGain =
    topHalf.length > 0 ? topHalf.reduce((acc, item) => acc + item.maxGainPercent, 0) / topHalf.length : 0;
  const avgTopLoss =
    topHalf.length > 0 ? topHalf.reduce((acc, item) => acc + item.maxLossPercent, 0) / topHalf.length : 0;

  const trendDelta =
    context.trends.previous30d.tokenCount > 0
      ? context.trends.last30d.targetHitRatePercent - context.trends.previous30d.targetHitRatePercent
      : 0;

  const trendShiftWarning =
    context.trends.previous30d.tokenCount >= 8 && trendDelta <= -12
      ? `Baisse nette de performance récente (${trendDelta.toFixed(1)} points de hit rate vs période précédente).`
      : null;

  const tokenCoverage = Math.min(1, context.tokenCount / 40);
  const confidence = clampConfidence(tokenCoverage);

  return {
    recommendedStrategy:
      context.tokenCount === 0
        ? "Pas assez d'historique pour proposer une stratégie fiable. Ajoute davantage de tokens."
        : `Priorise les tokens dont l'entrée reste proche de ${Math.round(avgTopEntry)} et vise un setup de prise de profit graduel autour de ${Math.round(avgTopGain)}%.`,
    suggestedFilters: {
      entryMcapMin: avgTopEntry > 0 ? Math.round(avgTopEntry * 0.6) : undefined,
      entryMcapMax: avgTopEntry > 0 ? Math.round(avgTopEntry * 1.4) : undefined,
      minHighPercent: Math.max(10, Math.round(avgTopGain * 0.45)),
      maxLossPercent: Math.min(-2, Math.round(avgTopLoss * 1.1)),
      recentWindowDays: 14,
    },
    riskNotes: [
      'Valider manuellement les signaux sur les derniers trades avant exécution réelle.',
      "Exclure les tokens avec des mèches extrêmes et volume insuffisant.",
    ],
    trendShiftWarning,
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    confidence,
  };
}
