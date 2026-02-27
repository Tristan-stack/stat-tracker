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

  const reachedCount = tokensWithMetrics.filter((t) => t.targetReached).length;
  const missedCount = tokensWithMetrics.length - reachedCount;

  const realisticPercentSum = tokensWithMetrics.reduce(
    (sum, t) => sum + (t.targetReached ? t.targetExitPercent : t.maxLossPercent),
    0
  );
  const maxGainPercentSum = tokensWithMetrics.reduce((sum, t) => sum + t.maxGainPercent, 0);
  const maxLossPercentSum = tokensWithMetrics.reduce((sum, t) => sum + t.maxLossPercent, 0);

  const averageRealisticPercent = tokens.length > 0 ? realisticPercentSum / tokens.length : 0;

  const investedTotal = hasAmount ? amount * tokens.length : 0;
  const gainRealistic = hasAmount ? (amount * realisticPercentSum) / 100 : 0;
  const gainMax = hasAmount ? (amount * maxGainPercentSum) / 100 : 0;
  const gainLow = hasAmount ? (amount * maxLossPercentSum) / 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Résumé</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="text-sm font-medium text-muted-foreground">Ma rentabilité réaliste</p>
            <p
              className={`mt-2 text-3xl font-bold tabular-nums sm:text-4xl ${
                averageRealisticPercent >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {metrics.tokenCount === 0 ? '—' : formatPercent(averageRealisticPercent)}
            </p>
            {metrics.tokenCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {reachedCount}/{metrics.tokenCount} objectifs atteints
              </p>
            )}
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
                  Résultat réaliste
                </p>
                <p className="text-sm">
                  % combiné :{' '}
                  <span className={`font-semibold ${realisticPercentSum >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatPercent(realisticPercentSum)}
                  </span>
                </p>
                <p className="text-sm">
                  Investi total:{' '}
                  <span className="font-semibold">{formatNum(investedTotal, 2)}</span>
                </p>
                <p className="text-sm">
                  Montant final:{' '}
                  <span className={`font-semibold ${gainRealistic >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatNum(investedTotal + gainRealistic, 2)}
                  </span>
                </p>
                <p className="text-sm">
                  Bénéfice / Perte:{' '}
                  <span className={`font-semibold ${gainRealistic >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {gainRealistic >= 0 ? '+' : ''}{formatNum(gainRealistic, 2)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reachedCount} token{reachedCount !== 1 ? 's' : ''} à l&apos;objectif ({formatPercent(tokensWithMetrics.filter((t) => t.targetReached).reduce((s, t) => s + t.targetExitPercent, 0))}),{' '}
                  {missedCount} en perte ({formatPercent(tokensWithMetrics.filter((t) => !t.targetReached).reduce((s, t) => s + t.maxLossPercent, 0))})
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Au gain max théorique
                </p>
                <p className="text-sm">
                  % combiné :{' '}
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {formatPercent(maxGainPercentSum)}
                  </span>
                </p>
                <p className="text-sm">
                  Investi total:{' '}
                  <span className="font-semibold">{formatNum(investedTotal, 2)}</span>
                </p>
                <p className="text-sm">
                  Gain total:{' '}
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    +{formatNum(gainMax, 2)}
                  </span>
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Au plus bas atteint
                </p>
                <p className="text-sm">
                  % combiné :{' '}
                  <span className={`font-semibold ${maxLossPercentSum >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatPercent(maxLossPercentSum)}
                  </span>
                </p>
                <p className="text-sm">
                  Investi total:{' '}
                  <span className="font-semibold">{formatNum(investedTotal, 2)}</span>
                </p>
                <p className="text-sm">
                  Résultat (gain / perte):{' '}
                  <span className={`font-semibold ${gainLow >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {gainLow >= 0 ? '+' : ''}{formatNum(gainLow, 2)}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

