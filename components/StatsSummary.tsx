'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAggregateMetrics, getTokenWithMetrics, getAcceptanceCriteria } from '@/lib/token-calculations';
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
  targetPercent: string;
  withdrawPercent: string;
}

interface TakeProfitParsed {
  targetPercent: number;
  withdrawPercent: number;
}

function parseTakeProfits(inputs: TakeProfitInput[]): TakeProfitParsed[] {
  return inputs
    .map((tp) => ({
      targetPercent: parseDecimal(tp.targetPercent),
      withdrawPercent: parseDecimal(tp.withdrawPercent),
    }))
    .filter((tp) => tp.targetPercent > 0 && tp.withdrawPercent > 0)
    .sort((a, b) => a.targetPercent - b.targetPercent);
}

function mcapToPercent(entryPrice: number, mcap: number): number {
  return entryPrice > 0 ? ((mcap / entryPrice) - 1) * 100 : Infinity;
}

interface OptimalResult {
  value: number;
  avgProfitPercent: number;
  winCount: number;
  winRate: number;
  avgGainPerWinner: number;
  avgLossPerLoser: number;
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
): { result: OptimalResult; score: number } {
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
    },
    score: scoreOptimal(avg, winRate),
  };
}

function findOptimalPercent(twm: TokenWithMetrics[]): OptimalResult | null {
  if (twm.length === 0) return null;

  const candidates = [...new Set(twm.map((t) => t.maxGainPercent).filter((g) => g >= 0))].sort((a, b) => a - b);
  if (candidates.length === 0) return null;

  let best: { result: OptimalResult; score: number } | null = null;

  for (const target of candidates) {
    let totalGain = 0;
    let totalLoss = 0;
    let wins = 0;
    for (const t of twm) {
      if (t.maxGainPercent >= target) { totalGain += target; wins++; } else { totalLoss += t.maxLossPercent; }
    }
    const candidate = buildOptimalResult(target, totalGain, totalLoss, wins, twm.length);
    if (best === null || candidate.score > best.score) best = candidate;
  }

  return best && best.result.avgProfitPercent > 0 ? best.result : null;
}

function findOptimalMcap(twm: TokenWithMetrics[]): OptimalResult | null {
  if (twm.length === 0) return null;

  const candidates = [...new Set(twm.map((t) => t.high).filter((h) => h > 0))].sort((a, b) => a - b);
  if (candidates.length === 0) return null;

  let best: { result: OptimalResult; score: number } | null = null;

  for (const mcap of candidates) {
    let totalGain = 0;
    let totalLoss = 0;
    let wins = 0;
    for (const t of twm) {
      if (t.high >= mcap) { totalGain += ((mcap / t.entryPrice) - 1) * 100; wins++; } else { totalLoss += t.maxLossPercent; }
    }
    const candidate = buildOptimalResult(mcap, totalGain, totalLoss, wins, twm.length);
    if (best === null || candidate.score > best.score) best = candidate;
  }

  return best && best.result.avgProfitPercent > 0 ? best.result : null;
}

function resolveTpsForToken(
  takeProfits: TakeProfitParsed[],
  token: TokenWithMetrics,
  tpMode: ExitMode
): TakeProfitParsed[] {
  if (tpMode === 'percent') return takeProfits;
  return takeProfits
    .map((tp) => ({
      targetPercent: mcapToPercent(token.entryPrice, tp.targetPercent),
      withdrawPercent: tp.withdrawPercent,
    }))
    .filter((tp) => Number.isFinite(tp.targetPercent))
    .sort((a, b) => a.targetPercent - b.targetPercent);
}

function simulateTokenMultiTp(
  amount: number,
  token: TokenWithMetrics,
  takeProfits: TakeProfitParsed[]
): number {
  let remainingFraction = 1;
  let totalReceived = 0;

  for (const tp of takeProfits) {
    if (remainingFraction <= 0) break;
    if (token.maxGainPercent >= tp.targetPercent) {
      const soldFraction = remainingFraction * Math.min(tp.withdrawPercent, 100) / 100;
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
  takeProfits: TakeProfitParsed[],
  tpMode: ExitMode
): MultiTpSimulationResult {
  const investedTotal = amount * tokensWithMetrics.length;
  let totalReceived = 0;
  let tokensWithAtLeastOneTp = 0;

  for (const token of tokensWithMetrics) {
    const resolved = resolveTpsForToken(takeProfits, token, tpMode);
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
  takeProfits: TakeProfitParsed[],
  tpMode: ExitMode
): MultiTpSimulationResult | null {
  const N = tokensWithMetrics.length;
  if (N === 0 || walletAmounts.length === 0) return null;

  let investedTotal = 0;
  let totalReceived = 0;
  for (const amt of walletAmounts) {
    investedTotal += amt * N;
    for (const token of tokensWithMetrics) {
      const resolved = resolveTpsForToken(takeProfits, token, tpMode);
      totalReceived += simulateTokenMultiTp(amt, token, resolved);
    }
  }

  let tokensWithAtLeastOneTp = 0;
  for (const token of tokensWithMetrics) {
    const resolved = resolveTpsForToken(takeProfits, token, tpMode);
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

const DEFAULT_TP: TakeProfitInput = { targetPercent: '', withdrawPercent: '' };

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
  const [tpMode, setTpMode] = useState<ExitMode>('percent');

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

  const parsedTps = useMemo(() => parseTakeProfits(takeProfits), [takeProfits]);
  const hasValidTps = parsedTps.length > 0;

  const multiTpResult = useMemo(() => {
    if (!hasSimulationInput || !hasValidTps) return null;
    if (!optimizedRevenue) {
      return getMultiTpSimulation(amount, tokensWithMetrics, parsedTps, tpMode);
    }
    return getMultiTpSimulationWalletAmounts(
      effectiveWalletAmounts,
      tokensWithMetrics,
      parsedTps,
      tpMode
    );
  }, [
    hasSimulationInput,
    hasValidTps,
    optimizedRevenue,
    amount,
    effectiveWalletAmounts,
    tokensWithMetrics,
    parsedTps,
    tpMode,
  ]);

  const handleTpChange = (index: number, field: keyof TakeProfitInput, value: string) => {
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
                <div className="flex items-center gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Take Profits (simulation multi-TP)
                  </p>
                  <div className="flex rounded-md border text-xs">
                    <button
                      type="button"
                      onClick={() => setTpMode('percent')}
                      className={cn(
                        'px-2 py-0.5 rounded-l-md transition-colors font-medium',
                        tpMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setTpMode('mcap')}
                      className={cn(
                        'px-2 py-0.5 rounded-r-md transition-colors font-medium',
                        tpMode === 'mcap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      MCap
                    </button>
                  </div>
                </div>
                {takeProfits.length < MAX_TPS && (
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addTp}>
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter TP
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {takeProfits.map((tp, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-medium text-muted-foreground w-8">
                      TP{index + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        className={cn('h-8 text-xs tabular-nums', tpMode === 'mcap' ? 'w-24' : 'w-20')}
                        placeholder={tpMode === 'mcap' ? 'MCap' : 'Gain %'}
                        value={tp.targetPercent}
                        onChange={(e) => handleTpChange(index, 'targetPercent', e.target.value)}
                      />
                      {tpMode === 'percent' && <span className="text-xs text-muted-foreground">%</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">→ retirer</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-8 w-16 text-xs tabular-nums"
                        placeholder="Retrait"
                        value={tp.withdrawPercent}
                        onChange={(e) => handleTpChange(index, 'withdrawPercent', e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeTp(index)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              {hasSimulationInput && multiTpResult && (
                <div className="mt-3 space-y-1.5 border-t pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Résultat multi-TP
                  </p>
                  <p className="text-sm">
                    Investi total:{' '}
                    <span className="font-semibold">{formatNum(multiTpResult.investedTotal, 2)}</span>
                  </p>
                  {multiTpResult.totalFees > 0 && (
                    <>
                      <p className="text-sm">
                        Bénéfice avant frais:{' '}
                        <span className={`font-semibold ${multiTpResult.profitBeforeFees >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {multiTpResult.profitBeforeFees >= 0 ? '+' : ''}{formatNum(multiTpResult.profitBeforeFees, 2)}
                        </span>
                      </p>
                      <p className="text-sm">
                        Frais totaux ({FEE_EUR_PER_PAIR} € × {tokensWithMetrics.length} × {optimizedRevenue ? effectiveWalletAmounts.length : 1} wallet{optimizedRevenue && effectiveWalletAmounts.length !== 1 ? 's' : ''}):{' '}
                        <span className="font-semibold tabular-nums">−{formatNum(multiTpResult.totalFees, 2)} €</span>
                      </p>
                    </>
                  )}
                  <p className="text-sm">
                    Montant final:{' '}
                    <span className={`font-semibold ${multiTpResult.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatNum(multiTpResult.totalReceived - multiTpResult.totalFees, 2)}
                    </span>
                  </p>
                  <p className="text-sm">
                    Bénéfice / Perte:{' '}
                    <span className={`font-semibold ${multiTpResult.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {multiTpResult.profit >= 0 ? '+' : ''}{formatNum(multiTpResult.profit, 2)}{' '}
                      ({multiTpResult.profitPercent >= 0 ? '+' : ''}{formatNum(multiTpResult.profitPercent, 2)} %)
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="text-green-600 dark:text-green-400">{multiTpResult.tokensWithAtLeastOneTp}</span> token{multiTpResult.tokensWithAtLeastOneTp !== 1 ? 's' : ''} avec au moins 1 TP atteint,{' '}
                    <span className="text-red-600 dark:text-red-400">{multiTpResult.tokensFullLoss}</span> en perte totale (aucun TP atteint)
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

