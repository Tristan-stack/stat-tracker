'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getAggregateMetrics,
  getTokenWithMetrics,
  getAcceptanceCriteria,
  findOptimalPercent,
  findOptimalMcap,
  suggestSnipeMode,
} from '@/lib/token-calculations';
import type { Token, TokenWithMetrics, ExitMode } from '@/types/token';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const MAX_TPS = 5;
const WALLET_SLOTS = 5;
/** Frais fixes (€) par couple wallet × token pour le mode revenu optimisé. */
const FEE_EUR_PER_PAIR = 2;

interface TakeProfitInput {
  executionType: 'tp' | 'initial';
  /** Valeur saisie : gain % ou MCap absolu selon `targetMode`. */
  targetValue: string;
  withdrawPercent: string;
  targetMode: ExitMode;
}

/** Brut avant résolution par token (entrée différente → % effectif différent en mode MCap). */
interface TakeProfitParsed {
  executionType: 'tp' | 'initial';
  rawTarget: number;
  targetMode: ExitMode;
  withdrawPercent: number;
}

function parseTakeProfits(inputs: TakeProfitInput[]): TakeProfitParsed[] {
  return inputs
    .map((tp) => ({
      executionType: tp.executionType,
      rawTarget: parseDecimal(tp.targetValue),
      targetMode: tp.targetMode,
      withdrawPercent:
        tp.executionType === 'initial'
          ? 0
          : parseDecimal(tp.withdrawPercent),
    }))
    .filter((tp) =>
      tp.executionType === 'initial'
        ? tp.rawTarget > 0
        : tp.rawTarget > 0 && tp.withdrawPercent > 0
    );
}

function mcapToPercent(entryPrice: number, mcap: number): number {
  return entryPrice > 0 ? ((mcap / entryPrice) - 1) * 100 : Infinity;
}

function autoInitialSellPercentFromTarget(targetPercent: number): number | null {
  const multiple = 1 + targetPercent / 100;
  if (!Number.isFinite(multiple) || multiple <= 0) return null;
  return Math.max(0, Math.min(100, (1 / multiple) * 100));
}

/** Convertit chaque TP (% ou MCap) en % de gain vs entrée, puis trie pour l’ordre d’exécution. */
function resolveTpsForToken(
  takeProfits: TakeProfitParsed[],
  token: TokenWithMetrics
): { targetPercent: number; withdrawPercent: number; executionType: 'tp' | 'initial' }[] {
  return takeProfits
    .map((tp) => ({
      executionType: tp.executionType,
      targetPercent:
        tp.targetMode === 'percent'
          ? tp.rawTarget
          : mcapToPercent(token.entryPrice, tp.rawTarget),
      withdrawPercent: tp.withdrawPercent,
    }))
    .filter((tp) => Number.isFinite(tp.targetPercent) && tp.targetPercent > 0)
    .sort((a, b) => a.targetPercent - b.targetPercent);
}

function simulateTokenMultiTp(
  amount: number,
  token: TokenWithMetrics,
  takeProfits: { targetPercent: number; withdrawPercent: number; executionType: 'tp' | 'initial' }[]
): number {
  let remainingFraction = 1;
  let totalReceived = 0;

  for (const tp of takeProfits) {
    if (remainingFraction <= 0) break;
    if (token.maxGainPercent >= tp.targetPercent) {
      let soldFraction = 0;
      if (tp.executionType === 'initial') {
        const multiple = 1 + tp.targetPercent / 100;
        if (multiple > 0) {
          // Vendre uniquement la fraction nécessaire pour récupérer la mise initiale.
          const requiredFractionOfOriginal = 1 / multiple;
          soldFraction = Math.min(remainingFraction, requiredFractionOfOriginal);
        }
      } else {
        soldFraction = remainingFraction * Math.min(tp.withdrawPercent, 100) / 100;
      }

      if (soldFraction <= 0) continue;
      totalReceived += amount * soldFraction * (1 + tp.targetPercent / 100);
      remainingFraction -= soldFraction;
    } else {
      break;
    }
  }

  if (remainingFraction > 0) {
    totalReceived += amount * remainingFraction * (1 + token.maxLossPercent / 100);
  }

  return totalReceived;
}

interface MultiTpSimulationResult {
  investedTotal: number;
  totalReceived: number;
  profit: number;
  profitPercent: number;
  tokensWithAtLeastOneTp: number;
  tokensFullLoss: number;
  totalFees: number;
  profitBeforeFees: number;
}

function getMultiTpSimulation(
  amount: number,
  tokensWithMetrics: TokenWithMetrics[],
  takeProfits: TakeProfitParsed[]
): MultiTpSimulationResult {
  const investedTotal = amount * tokensWithMetrics.length;
  let totalReceived = 0;
  let tokensWithAtLeastOneTp = 0;

  for (const token of tokensWithMetrics) {
    const resolved = resolveTpsForToken(takeProfits, token);
    totalReceived += simulateTokenMultiTp(amount, token, resolved);
    const firstTarget = resolved.length > 0 ? resolved[0].targetPercent : Infinity;
    if (token.maxGainPercent >= firstTarget) tokensWithAtLeastOneTp++;
  }

  const profitBeforeFees = totalReceived - investedTotal;
  const profit = profitBeforeFees;
  const profitPercent = investedTotal > 0 ? (profit / investedTotal) * 100 : 0;
  const tokensFullLoss = tokensWithMetrics.length - tokensWithAtLeastOneTp;

  return {
    investedTotal,
    totalReceived,
    profit,
    profitPercent,
    tokensWithAtLeastOneTp,
    tokensFullLoss,
    totalFees: 0,
    profitBeforeFees,
  };
}

function getMultiTpSimulationWalletAmounts(
  walletAmounts: number[],
  tokensWithMetrics: TokenWithMetrics[],
  takeProfits: TakeProfitParsed[]
): MultiTpSimulationResult | null {
  const N = tokensWithMetrics.length;
  if (N === 0 || walletAmounts.length === 0) return null;

  let investedTotal = 0;
  let totalReceived = 0;
  for (const amt of walletAmounts) {
    investedTotal += amt * N;
    for (const token of tokensWithMetrics) {
      const resolved = resolveTpsForToken(takeProfits, token);
      totalReceived += simulateTokenMultiTp(amt, token, resolved);
    }
  }

  let tokensWithAtLeastOneTp = 0;
  for (const token of tokensWithMetrics) {
    const resolved = resolveTpsForToken(takeProfits, token);
    const firstTarget = resolved.length > 0 ? resolved[0].targetPercent : Infinity;
    if (token.maxGainPercent >= firstTarget) tokensWithAtLeastOneTp++;
  }

  const tokensFullLoss = tokensWithMetrics.length - tokensWithAtLeastOneTp;
  const W = walletAmounts.length;
  const totalFees = FEE_EUR_PER_PAIR * N * W;
  const profitBeforeFees = totalReceived - investedTotal;
  const profit = profitBeforeFees - totalFees;
  const profitPercent = investedTotal > 0 ? (profit / investedTotal) * 100 : 0;

  return {
    investedTotal,
    totalReceived,
    profit,
    profitPercent,
    tokensWithAtLeastOneTp,
    tokensFullLoss,
    totalFees,
    profitBeforeFees,
  };
}

const DEFAULT_TP: TakeProfitInput = {
  executionType: 'tp',
  targetValue: '',
  withdrawPercent: '',
  targetMode: 'percent',
};

export interface StatsSummaryProps {
  tokens: Token[];
  showSimulation?: boolean;
}

export function StatsSummary({ tokens, showSimulation = true }: StatsSummaryProps) {
  const metrics = getAggregateMetrics(tokens);
  const acceptance = getAcceptanceCriteria(tokens);
  const [simulatedAmount, setSimulatedAmount] = useState('');
  const [optimizedRevenue, setOptimizedRevenue] = useState(false);
  const [walletEnabled, setWalletEnabled] = useState<boolean[]>(() =>
    Array.from({ length: WALLET_SLOTS }, () => false)
  );
  const [walletAmounts, setWalletAmounts] = useState<string[]>(() =>
    Array.from({ length: WALLET_SLOTS }, () => '')
  );
  const [takeProfits, setTakeProfits] = useState<TakeProfitInput[]>([{ ...DEFAULT_TP }]);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [takeProfitsRight, setTakeProfitsRight] = useState<TakeProfitInput[]>([{ ...DEFAULT_TP }]);

  const amount = parseDecimal(simulatedAmount);

  const effectiveWalletAmounts = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < WALLET_SLOTS; i++) {
      if (!walletEnabled[i]) continue;
      const v = parseDecimal(walletAmounts[i] ?? '');
      if (v > 0) out.push(v);
    }
    return out;
  }, [walletEnabled, walletAmounts]);

  const hasSimulationInput = useMemo(() => {
    if (tokens.length === 0) return false;
    if (!optimizedRevenue) return amount > 0;
    return effectiveWalletAmounts.length > 0;
  }, [tokens.length, optimizedRevenue, amount, effectiveWalletAmounts]);

  const tokensWithMetrics = useMemo(() => tokens.map(getTokenWithMetrics), [tokens]);

  const reachedCount = tokensWithMetrics.filter((t) => t.targetReached).length;
  const missedCount = tokensWithMetrics.length - reachedCount;

  const realisticPercentSum = tokensWithMetrics.reduce(
    (sum, t) => sum + (t.targetReached ? t.targetExitPercent : t.maxLossPercent),
    0
  );

  const averageRealisticPercent = tokens.length > 0 ? realisticPercentSum / tokens.length : 0;

  const simpleRealistic = useMemo(() => {
    if (!hasSimulationInput || tokens.length === 0) return null;
    const twm = tokens.map(getTokenWithMetrics);
    const N = twm.length;
    const sumPercent = twm.reduce(
      (sum, t) => sum + (t.targetReached ? t.targetExitPercent : t.maxLossPercent),
      0
    );
    if (!optimizedRevenue) {
      const investedTotal = amount * N;
      const gainBeforeFees = (amount * sumPercent) / 100;
      const totalFees = 0;
      const netGain = gainBeforeFees - totalFees;
      return {
        investedTotal,
        gainBeforeFees,
        totalFees,
        netGain,
        finalAmount: investedTotal + netGain,
        walletCount: 1,
      };
    }
    let investedTotal = 0;
    let gainBeforeFees = 0;
    for (const a of effectiveWalletAmounts) {
      investedTotal += a * N;
      gainBeforeFees += (a * sumPercent) / 100;
    }
    const W = effectiveWalletAmounts.length;
    const totalFees = FEE_EUR_PER_PAIR * N * W;
    const netGain = gainBeforeFees - totalFees;
    return {
      investedTotal,
      gainBeforeFees,
      totalFees,
      netGain,
      finalAmount: investedTotal + netGain,
      walletCount: W,
    };
  }, [hasSimulationInput, tokens, optimizedRevenue, amount, effectiveWalletAmounts]);

  const optimalPercent = useMemo(() => findOptimalPercent(tokensWithMetrics), [tokensWithMetrics]);
  const optimalMcap = useMemo(() => findOptimalMcap(tokensWithMetrics), [tokensWithMetrics]);
  const snipeSuggestion = useMemo(
    () => suggestSnipeMode(optimalPercent, optimalMcap),
    [optimalPercent, optimalMcap]
  );

  const parsedTps = useMemo(() => parseTakeProfits(takeProfits), [takeProfits]);
  const hasValidTps = parsedTps.length > 0;
  const parsedTpsRight = useMemo(() => parseTakeProfits(takeProfitsRight), [takeProfitsRight]);
  const hasValidTpsRight = parsedTpsRight.length > 0;

  const multiTpResult = useMemo(() => {
    if (!hasSimulationInput || !hasValidTps) return null;
    if (!optimizedRevenue) {
      return getMultiTpSimulation(amount, tokensWithMetrics, parsedTps);
    }
    return getMultiTpSimulationWalletAmounts(
      effectiveWalletAmounts,
      tokensWithMetrics,
      parsedTps
    );
  }, [
    hasSimulationInput,
    hasValidTps,
    optimizedRevenue,
    amount,
    effectiveWalletAmounts,
    tokensWithMetrics,
    parsedTps,
  ]);

  const multiTpResultRight = useMemo(() => {
    if (!hasSimulationInput || !hasValidTpsRight) return null;
    if (!optimizedRevenue) {
      return getMultiTpSimulation(amount, tokensWithMetrics, parsedTpsRight);
    }
    return getMultiTpSimulationWalletAmounts(
      effectiveWalletAmounts,
      tokensWithMetrics,
      parsedTpsRight
    );
  }, [
    hasSimulationInput,
    hasValidTpsRight,
    optimizedRevenue,
    amount,
    effectiveWalletAmounts,
    tokensWithMetrics,
    parsedTpsRight,
  ]);
  const compareStrategies = useMemo(
    () =>
      compareEnabled
        ? [
            { key: 'left' as const, title: 'Stratégie gauche', tps: takeProfits, result: multiTpResult },
            { key: 'right' as const, title: 'Stratégie droite', tps: takeProfitsRight, result: multiTpResultRight },
          ]
        : [{ key: 'left' as const, title: 'Stratégie', tps: takeProfits, result: multiTpResult }],
    [compareEnabled, takeProfits, takeProfitsRight, multiTpResult, multiTpResultRight]
  );

  const handleTpChange = (index: number, field: keyof TakeProfitInput, value: string | ExitMode | 'tp' | 'initial') => {
    setTakeProfits((prev) => prev.map((tp, i) => (i === index ? { ...tp, [field]: value } : tp)));
  };

  const addTp = () => {
    if (takeProfits.length >= MAX_TPS) return;
    setTakeProfits((prev) => [...prev, { ...DEFAULT_TP }]);
  };

  const removeTp = (index: number) => {
    setTakeProfits((prev) => {
      if (prev.length <= 1) return [{ ...DEFAULT_TP }];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleTpChangeFor = (
    strategy: 'left' | 'right',
    index: number,
    field: keyof TakeProfitInput,
    value: string | ExitMode | 'tp' | 'initial'
  ) => {
    const setter = strategy === 'left' ? setTakeProfits : setTakeProfitsRight;
    setter((prev) => prev.map((tp, i) => (i === index ? { ...tp, [field]: value } : tp)));
  };

  const addTpFor = (strategy: 'left' | 'right') => {
    const current = strategy === 'left' ? takeProfits : takeProfitsRight;
    if (current.length >= MAX_TPS) return;
    const setter = strategy === 'left' ? setTakeProfits : setTakeProfitsRight;
    setter((prev) => [...prev, { ...DEFAULT_TP }]);
  };

  const removeTpFor = (strategy: 'left' | 'right', index: number) => {
    const setter = strategy === 'left' ? setTakeProfits : setTakeProfitsRight;
    setter((prev) => {
      if (prev.length <= 1) return [{ ...DEFAULT_TP }];
      return prev.filter((_, i) => i !== index);
    });
  };

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
          {optimalPercent && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-muted-foreground">Sortie % équilibrée</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatPercent(optimalPercent.value)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Moy. {formatPercent(optimalPercent.avgProfitPercent)} — {formatNum(optimalPercent.winRate * 100, 0)}% winrate ({optimalPercent.winCount}/{metrics.tokenCount})
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Gain moy. {formatPercent(optimalPercent.avgGainPerWinner)} / Perte moy. {formatPercent(optimalPercent.avgLossPerLoser)}
              </p>
            </div>
          )}
          {optimalMcap && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-muted-foreground">Sortie MCap équilibrée</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatNum(optimalMcap.value, 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Moy. {formatPercent(optimalMcap.avgProfitPercent)} — {formatNum(optimalMcap.winRate * 100, 0)}% winrate ({optimalMcap.winCount}/{metrics.tokenCount})
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Gain moy. {formatPercent(optimalMcap.avgGainPerWinner)} / Perte moy. {formatPercent(optimalMcap.avgLossPerLoser)}
              </p>
            </div>
          )}
        </div>

        {metrics.tokenCount > 0 && (optimalPercent || optimalMcap) && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <p className="text-sm font-medium">Conseil snipe : % vs prix cible (MCap)</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Comparaison des stratégies « équilibrées » sur l’historique (meilleur score
                  rentabilité × fréquence) : objectif en % vs objectif en niveau de prix (MCap).
                </p>
              </div>
              <p className="text-sm">
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {snipeSuggestion.mode === 'percent' && 'Privilégier viser en %'}
                  {snipeSuggestion.mode === 'mcap' && 'Privilégier viser en MCap (niveau de prix)'}
                  {snipeSuggestion.mode === 'tie' && 'Les deux modes sont proches'}
                </span>
                <span className="text-muted-foreground"> — {snipeSuggestion.summary}</span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-1.5 pr-2 font-medium">Stratégie</th>
                      <th className="py-1.5 pr-2 font-medium">Objectif</th>
                      <th className="py-1.5 pr-2 font-medium">TP atteints</th>
                      <th className="py-1.5 font-medium">Moy. %</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    <tr className="border-b border-border/60">
                      <td className="py-1.5 pr-2">% équilibré</td>
                      <td className="py-1.5 pr-2">
                        {optimalPercent ? formatPercent(optimalPercent.value) : '—'}
                      </td>
                      <td className="py-1.5 pr-2">
                        {optimalPercent ? `${optimalPercent.winCount}/${optimalPercent.total}` : '—'}
                      </td>
                      <td className="py-1.5">
                        {optimalPercent ? formatPercent(optimalPercent.avgProfitPercent) : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-2">MCap équilibré</td>
                      <td className="py-1.5 pr-2">
                        {optimalMcap ? formatNum(optimalMcap.value, 0) : '—'}
                      </td>
                      <td className="py-1.5 pr-2">
                        {optimalMcap ? `${optimalMcap.winCount}/${optimalMcap.total}` : '—'}
                      </td>
                      <td className="py-1.5">
                        {optimalMcap ? formatPercent(optimalMcap.avgProfitPercent) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
              Pertes consécutives max : {acceptance.maxConsecutiveLosses}{' '}
              {acceptance.meetsLossStreakCriteria ? '≤' : '>'} 6
              {acceptance.maxConsecutiveLosses > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  ({acceptance.maxConsecutiveLossOccurrences} série
                  {acceptance.maxConsecutiveLossOccurrences !== 1 ? 's' : ''} à ce max)
                </span>
              )}
              {acceptance.lossStreakDistribution
                .filter((streak) => streak.length !== acceptance.maxConsecutiveLosses)
                .length > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  — {acceptance.lossStreakDistribution
                    .filter((streak) => streak.length !== acceptance.maxConsecutiveLosses)
                    .map(
                      (streak) =>
                        `${streak.length} perte${streak.length > 1 ? 's' : ''}: ${streak.occurrences} série${streak.occurrences > 1 ? 's' : ''}`
                    )
                    .join(' · ')}
                </span>
              )}
            </span>
          </div>
        )}

        {showSimulation && (
          <div className="mt-2 space-y-4 rounded-lg border bg-muted/30 p-4 sm:p-5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant={optimizedRevenue ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={optimizedRevenue}
                  onClick={() => setOptimizedRevenue((v) => !v)}
                >
                  Revenu optimisé
                </Button>
                <p className="text-xs text-muted-foreground max-w-xl">
                  {optimizedRevenue
                    ? `Plusieurs wallets : montant par token par wallet. Frais fixes ${FEE_EUR_PER_PAIR} € par wallet et par token (achat/vente).`
                    : 'Un seul montant par token pour toute la simulation.'}
                </p>
              </div>

              {!optimizedRevenue && (
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
                  {hasSimulationInput && (
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      Simule le résultat global en investissant ce montant sur chaque token.
                    </p>
                  )}
                </div>
              )}

              {optimizedRevenue && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Wallets (max. {WALLET_SLOTS})</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: WALLET_SLOTS }, (_, i) => (
                      <label
                        key={i}
                        className="flex flex-wrap items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 rounded border-input"
                          checked={walletEnabled[i]}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setWalletEnabled((prev) => {
                              const next = [...prev];
                              next[i] = checked;
                              return next;
                            });
                          }}
                          aria-label={`Activer wallet ${i + 1}`}
                        />
                        <span className="shrink-0 font-medium">Wallet {i + 1}</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="€ / token"
                          className="h-8 max-w-[140px] text-xs tabular-nums"
                          value={walletAmounts[i]}
                          disabled={!walletEnabled[i]}
                          onChange={(e) => {
                            const val = e.target.value;
                            setWalletAmounts((prev) => {
                              const next = [...prev];
                              next[i] = val;
                              return next;
                            });
                          }}
                          aria-label={`Montant par token wallet ${i + 1}`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {hasSimulationInput && simpleRealistic && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Résultat réaliste (simple)
                </p>
                <p className="text-sm">
                  % combiné :{' '}
                  <span className={`font-semibold ${realisticPercentSum >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatPercent(realisticPercentSum)}
                  </span>
                </p>
                <p className="text-sm">
                  Investi total:{' '}
                  <span className="font-semibold">{formatNum(simpleRealistic.investedTotal, 2)}</span>
                </p>
                {simpleRealistic.totalFees > 0 && (
                  <>
                    <p className="text-sm">
                      Bénéfice avant frais:{' '}
                      <span className={`font-semibold ${simpleRealistic.gainBeforeFees >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {simpleRealistic.gainBeforeFees >= 0 ? '+' : ''}{formatNum(simpleRealistic.gainBeforeFees, 2)}
                      </span>
                    </p>
                    <p className="text-sm">
                      Frais totaux ({FEE_EUR_PER_PAIR} € × {tokensWithMetrics.length} tokens × {simpleRealistic.walletCount} wallet{simpleRealistic.walletCount !== 1 ? 's' : ''}):{' '}
                      <span className="font-semibold tabular-nums">−{formatNum(simpleRealistic.totalFees, 2)} €</span>
                    </p>
                  </>
                )}
                <p className="text-sm">
                  Montant final:{' '}
                  <span className={`font-semibold ${simpleRealistic.finalAmount >= simpleRealistic.investedTotal ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatNum(simpleRealistic.finalAmount, 2)}
                  </span>
                </p>
                <p className="text-sm">
                  Bénéfice / Perte:{' '}
                  <span className={`font-semibold ${simpleRealistic.netGain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {simpleRealistic.netGain >= 0 ? '+' : ''}{formatNum(simpleRealistic.netGain, 2)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reachedCount} token{reachedCount !== 1 ? 's' : ''} à l&apos;objectif ({formatPercent(tokensWithMetrics.filter((t) => t.targetReached).reduce((s, t) => s + t.targetExitPercent, 0))}),{' '}
                  {missedCount} en perte ({formatPercent(tokensWithMetrics.filter((t) => !t.targetReached).reduce((s, t) => s + t.maxLossPercent, 0))})
                </p>
              </div>
            )}

            <div className="space-y-3 rounded-lg border bg-background/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Take Profits (simulation multi-TP)
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-md">
                    Chaque ligne : <strong>%</strong>, <strong>MCap</strong> ou <strong>Sell initial</strong>. En mode Sell initial, le simulateur vend automatiquement la part necessaire pour recuperer la mise.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={compareEnabled ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCompareEnabled((v) => !v)}
                >
                  Compare
                </Button>
              </div>

              <div className={cn('grid gap-4', compareEnabled ? 'md:grid-cols-2' : 'grid-cols-1')}>
                {compareStrategies.map((strategy) => (
                  <div key={strategy.key} className="space-y-2 rounded-md border bg-background/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">{strategy.title}</p>
                      {strategy.tps.length < MAX_TPS && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => addTpFor(strategy.key)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Ajouter TP
                        </Button>
                      )}
                    </div>

                    {strategy.tps.map((tp, index) => (
                      <div key={`${strategy.key}-${index}`} className="flex flex-wrap items-center gap-2">
                        <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">TP{index + 1}</span>
                        <div className="flex rounded-md border text-[10px] shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTpChangeFor(strategy.key, index, 'executionType', 'tp')}
                            className={cn(
                              'px-1.5 py-0.5 rounded-l-md font-medium transition-colors',
                              tp.executionType === 'tp'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted'
                            )}
                          >
                            TP
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTpChangeFor(strategy.key, index, 'executionType', 'initial')}
                            className={cn(
                              'px-1.5 py-0.5 rounded-r-md font-medium transition-colors',
                              tp.executionType === 'initial'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted'
                            )}
                          >
                            Sell initial
                          </button>
                        </div>
                        <div className="flex rounded-md border text-[10px] shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTpChangeFor(strategy.key, index, 'targetMode', 'percent')}
                            className={cn(
                              'px-1.5 py-0.5 rounded-l-md font-medium transition-colors',
                              tp.targetMode === 'percent'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted'
                            )}
                          >
                            %
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTpChangeFor(strategy.key, index, 'targetMode', 'mcap')}
                            className={cn(
                              'px-1.5 py-0.5 rounded-r-md font-medium transition-colors',
                              tp.targetMode === 'mcap'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted'
                            )}
                          >
                            MCap
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            inputMode="decimal"
                            className={cn('h-8 text-xs tabular-nums', tp.targetMode === 'mcap' ? 'w-24' : 'w-20')}
                            placeholder={tp.targetMode === 'mcap' ? 'MCap' : 'Gain %'}
                            value={tp.targetValue}
                            onChange={(e) => handleTpChangeFor(strategy.key, index, 'targetValue', e.target.value)}
                          />
                          {tp.targetMode === 'percent' && <span className="text-xs text-muted-foreground">%</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {tp.executionType === 'initial' ? '-> sell initial' : '-> retirer'}
                        </span>
                        {tp.executionType === 'initial' ? (
                          <div className="flex items-center gap-1">
                            <span className="rounded border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                              auto (mise)
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {(() => {
                                const target = parseDecimal(tp.targetValue);
                                if (target <= 0) return '';
                                if (tp.targetMode === 'percent') {
                                  const p = autoInitialSellPercentFromTarget(target);
                                  return p === null ? '' : `~${formatNum(p, 2)}%`;
                                }
                                const percents = tokensWithMetrics
                                  .map((t) => mcapToPercent(t.entryPrice, target))
                                  .map((p) => autoInitialSellPercentFromTarget(p))
                                  .filter((p): p is number => p !== null);
                                if (percents.length === 0) return '';
                                const avg = percents.reduce((sum, p) => sum + p, 0) / percents.length;
                                return `~${formatNum(avg, 2)}% moy`;
                              })()}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Input
                              type="text"
                              inputMode="decimal"
                              className="h-8 w-16 text-xs tabular-nums"
                              placeholder="Retrait"
                              value={tp.withdrawPercent}
                              onChange={(e) => handleTpChangeFor(strategy.key, index, 'withdrawPercent', e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeTpFor(strategy.key, index)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}

                    {hasSimulationInput && strategy.result && (
                      <div className="mt-3 space-y-1.5 border-t pt-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Resultat multi-TP
                        </p>
                        <p className="text-sm">
                          Investi total:{' '}
                          <span className="font-semibold">{formatNum(strategy.result.investedTotal, 2)}</span>
                        </p>
                        {strategy.result.totalFees > 0 && (
                          <>
                            <p className="text-sm">
                              Benefice avant frais:{' '}
                              <span className={`font-semibold ${strategy.result.profitBeforeFees >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {strategy.result.profitBeforeFees >= 0 ? '+' : ''}{formatNum(strategy.result.profitBeforeFees, 2)}
                              </span>
                            </p>
                            <p className="text-sm">
                              Frais totaux ({FEE_EUR_PER_PAIR} EUR x {tokensWithMetrics.length} x {optimizedRevenue ? effectiveWalletAmounts.length : 1} wallet{optimizedRevenue && effectiveWalletAmounts.length !== 1 ? 's' : ''}):{' '}
                              <span className="font-semibold tabular-nums">-{formatNum(strategy.result.totalFees, 2)} EUR</span>
                            </p>
                          </>
                        )}
                        <p className="text-sm">
                          Montant final:{' '}
                          <span className={`font-semibold ${strategy.result.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatNum(strategy.result.totalReceived - strategy.result.totalFees, 2)}
                          </span>
                        </p>
                        <p className="text-sm">
                          Benefice / Perte:{' '}
                          <span className={`font-semibold ${strategy.result.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {strategy.result.profit >= 0 ? '+' : ''}{formatNum(strategy.result.profit, 2)} ({strategy.result.profitPercent >= 0 ? '+' : ''}{formatNum(strategy.result.profitPercent, 2)} %)
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

