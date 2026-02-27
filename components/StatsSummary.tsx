'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAggregateMetrics, getTokenWithMetrics } from '@/lib/token-calculations';
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

function parseDecimal(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export interface StatsSummaryProps {
  tokens: Token[];
}

export function StatsSummary({ tokens }: StatsSummaryProps) {
  const metrics = getAggregateMetrics(tokens);
  const [simulatedAmount, setSimulatedAmount] = useState('');

  const amount = parseDecimal(simulatedAmount);
  const hasAmount = amount > 0 && tokens.length > 0;

  const tokensWithMetrics = tokens.map(getTokenWithMetrics);

  const totals = hasAmount
    ? tokensWithMetrics.reduce(
        (acc, t) => {
          const gainTarget = (amount * t.targetExitPercent) / 100;
          const gainMax = (amount * t.maxGainPercent) / 100;
          const gainLow = (amount * t.maxLossPercent) / 100;
          return {
            target: acc.target + gainTarget,
            max: acc.max + gainMax,
            low: acc.low + gainLow,
          };
        },
        { target: 0, max: 0, low: 0 }
      )
    : { target: 0, max: 0, low: 0 };

  const investedTotal = hasAmount ? amount * tokens.length : 0;

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
                  ? `Tu peux viser plus haut en moyenne. Sortie optimisée recommandée : ${formatPercent(
                      metrics.averageMaxGainPercent
                    )}`
                  : metrics.averageOptimalTargetPercent > metrics.averageMaxGainPercent
                    ? `Tu vises au-dessus du potentiel moyen. Sortie optimisée recommandée : ${formatPercent(
                        metrics.averageMaxGainPercent
                      )}`
                    : 'Aligné avec le potentiel moyen.'}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Objectifs atteints</p>
            <p className="mt-2 text-2xl font-semibold">
              {metrics.tokenCount === 0
                ? '-'
                : `${formatNum(metrics.targetReachedRate * 100, 0)} % (${Math.round(
                    metrics.targetReachedRate * metrics.tokenCount
                  )}/${metrics.tokenCount})`}
            </p>
          </div>
        </div>

        <div className="mt-2 space-y-4 rounded-lg border bg-muted/30 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full max-w-xs space-y-2">
              <Label htmlFor="simulated-amount">Montant investi par token (à l&apos;entrée)</Label>
              <Input
                id="simulated-amount"
                inputMode="decimal"
                placeholder="Ex. 1 000"
                value={simulatedAmount}
                onChange={(e) => setSimulatedAmount(e.target.value)}
              />
            </div>
            {hasAmount && (
              <p className="text-xs text-muted-foreground sm:text-sm">
                Simule le résultat global en investissant ce montant sur chaque token.
              </p>
            )}
          </div>
          {hasAmount && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  À ton objectif actuel
                </p>
                <p className="text-sm">
                  Investi total:{' '}
                  <span className="font-semibold">{formatNum(investedTotal, 2)}</span>
                </p>
                <p className="text-sm">
                  Gain total:{' '}
                  <span className="font-semibold">{formatNum(totals.target, 2)}</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Au gain max théorique
                </p>
                <p className="text-sm">
                  Investi total:{' '}
                  <span className="font-semibold">{formatNum(investedTotal, 2)}</span>
                </p>
                <p className="text-sm">
                  Gain total:{' '}
                  <span className="font-semibold">{formatNum(totals.max, 2)}</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Au plus bas atteint
                </p>
                <p className="text-sm">
                  Investi total:{' '}
                  <span className="font-semibold">{formatNum(investedTotal, 2)}</span>
                </p>
                <p className="text-sm">
                  Résultat total (gain / perte):{' '}
                  <span className="font-semibold">{formatNum(totals.low, 2)}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

