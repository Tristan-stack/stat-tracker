'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAggregateMetrics } from '@/lib/token-calculations';
import type { Token } from '@/types/token';

function formatNum(value: number, decimals = 2): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNum(value, 2)} %`;
}

export interface StatsSummaryProps {
  tokens: Token[];
}

export function StatsSummary({ tokens }: StatsSummaryProps) {
  const metrics = getAggregateMetrics(tokens);
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Résumé</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="text-sm font-medium text-muted-foreground">Ma rentabilité actuelle</p>
            <p
              className={`mt-2 text-3xl font-bold tabular-nums sm:text-4xl ${
                metrics.averageOptimalTargetPercent >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {metrics.tokenCount === 0 ? '—' : formatPercent(metrics.averageOptimalTargetPercent)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Tokens</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.tokenCount}</p>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Moyenne rentabilité (gain max %)</p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                metrics.averageMaxGainPercent >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatPercent(metrics.averageMaxGainPercent)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Objectif sortie moyen (ce que tu vises)</p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                metrics.averageOptimalTargetPercent >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {metrics.tokenCount === 0 ? '-' : `${formatPercent(metrics.averageOptimalTargetPercent)}`}
            </p>
            {metrics.tokenCount > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {metrics.averageOptimalTargetPercent < metrics.averageMaxGainPercent
                  ? `Tu peux viser plus haut en moyenne. Sortie optimisée recommandée : ${formatPercent(metrics.averageMaxGainPercent)}`
                  : metrics.averageOptimalTargetPercent > metrics.averageMaxGainPercent
                    ? `Tu vises au-dessus du potentiel moyen. Sortie optimisée recommandée : ${formatPercent(metrics.averageMaxGainPercent)}`
                    : 'Aligné avec le potentiel moyen.'}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Objectifs atteints</p>
            <p className="mt-2 text-2xl font-semibold">
              {metrics.tokenCount === 0
                ? '-'
                : `${formatNum(metrics.targetReachedRate * 100, 0)} % (${Math.round(metrics.targetReachedRate * metrics.tokenCount)}/${metrics.tokenCount})`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
