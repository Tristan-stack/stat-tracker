'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAggregateMetrics, getTokenWithMetrics, getAcceptanceCriteria } from '@/lib/token-calculations';
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
  showSimulation?: boolean;
}

export function StatsSummary({ tokens, showSimulation = true }: StatsSummaryProps) {
  const metrics = getAggregateMetrics(tokens);
  const acceptance = getAcceptanceCriteria(tokens);
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

  const averageRealisticPercent = tokens.length > 0 ? realisticPercentSum / tokens.length : 0;

  const investedTotal = hasAmount ? amount * tokens.length : 0;
  const gainRealistic = hasAmount ? (amount * realisticPercentSum) / 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Résumé</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 lg:grid-cols-6">
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <p className="truncate text-sm font-medium text-muted-foreground">Ma rentabilité réaliste</p>
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
            <p className="text-sm font-medium text-muted-foreground">Moyenne de l&apos;entrée</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {metrics.tokenCount === 0 ? '—' : formatNum(metrics.averageEntryPrice)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">Perte max moyenne</p>
            <p className="mt-2 text-2xl font-semibold text-red-600 dark:text-red-400">
              {metrics.tokenCount === 0 ? '—' : formatPercent(metrics.averageMaxLossPercent)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">Stop loss conseillé</p>
            <p className="mt-2 text-2xl font-semibold text-orange-600 dark:text-orange-400">
              {metrics.tokenCount === 0 ? '—' : formatPercent(metrics.averageMaxLossPercent * 0.65)}
            </p>
            {metrics.tokenCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                65 % de la perte max moyenne
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">Objectif sortie moyen (ce que tu vises)</p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                metrics.averageOptimalTargetPercent >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {metrics.tokenCount === 0 ? '-' : `${formatPercent(metrics.averageOptimalTargetPercent)}`}
            </p>
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

        {metrics.tokenCount > 0 && (
          <div
            className={`flex flex-wrap items-center gap-4 rounded-lg border px-4 py-3 ${
              acceptance.meetsAllCriteria
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
            }`}
          >
            <p className="text-sm font-medium">
              {acceptance.meetsAllCriteria ? 'Critères d\'acceptation remplis' : 'Critères d\'acceptation non remplis'}
            </p>
            <span
              className={`text-sm ${
                acceptance.meetsWinRateCriteria
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              Win rate : {formatNum(acceptance.winRate, 1)} % {acceptance.meetsWinRateCriteria ? '≥' : '<'} 45 %
            </span>
            <span
              className={`text-sm ${
                acceptance.meetsLossStreakCriteria
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              Pertes consécutives max : {acceptance.maxConsecutiveLosses} {acceptance.meetsLossStreakCriteria ? '≤' : '>'} 6
            </span>
          </div>
        )}

        {showSimulation && (
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
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

