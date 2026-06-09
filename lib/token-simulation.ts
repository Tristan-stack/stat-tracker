import type { TokenWithMetrics, ExitMode } from '@/types/token';

export const MAX_TPS = 5;
export const WALLET_SLOTS = 5;
/** Frais fixes (€) par couple wallet × token pour le mode revenu optimisé. */
export const FEE_EUR_PER_PAIR = 2;

export function parseDecimal(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export interface TakeProfitInput {
  executionType: 'tp' | 'initial';
  /** Valeur saisie : gain % ou MCap absolu selon `targetMode`. */
  targetValue: string;
  withdrawPercent: string;
  targetMode: ExitMode;
}

/** Brut avant résolution par token (entrée différente → % effectif différent en mode MCap). */
export interface TakeProfitParsed {
  executionType: 'tp' | 'initial';
  rawTarget: number;
  targetMode: ExitMode;
  withdrawPercent: number;
}

export const DEFAULT_TP: TakeProfitInput = {
  executionType: 'tp',
  targetValue: '',
  withdrawPercent: '',
  targetMode: 'percent',
};

export function parseTakeProfits(inputs: TakeProfitInput[]): TakeProfitParsed[] {
  return inputs
    .map((tp) => ({
      executionType: tp.executionType,
      rawTarget: parseDecimal(tp.targetValue),
      targetMode: tp.targetMode,
      withdrawPercent: tp.executionType === 'initial' ? 0 : parseDecimal(tp.withdrawPercent),
    }))
    .filter((tp) =>
      tp.executionType === 'initial'
        ? tp.rawTarget > 0
        : tp.rawTarget > 0 && tp.withdrawPercent > 0
    );
}

export function mcapToPercent(entryPrice: number, mcap: number): number {
  return entryPrice > 0 ? (mcap / entryPrice - 1) * 100 : Infinity;
}

export function autoInitialSellPercentFromTarget(targetPercent: number): number | null {
  const multiple = 1 + targetPercent / 100;
  if (!Number.isFinite(multiple) || multiple <= 0) return null;
  return Math.max(0, Math.min(100, (1 / multiple) * 100));
}

/** Convertit chaque TP (% ou MCap) en % de gain vs entrée, puis trie pour l'ordre d'exécution. */
export function resolveTpsForToken(
  takeProfits: TakeProfitParsed[],
  token: TokenWithMetrics
): { targetPercent: number; withdrawPercent: number; executionType: 'tp' | 'initial' }[] {
  return takeProfits
    .map((tp) => ({
      executionType: tp.executionType,
      targetPercent: tp.targetMode === 'percent' ? tp.rawTarget : mcapToPercent(token.entryPrice, tp.rawTarget),
      withdrawPercent: tp.withdrawPercent,
    }))
    .filter((tp) => Number.isFinite(tp.targetPercent) && tp.targetPercent > 0)
    .sort((a, b) => a.targetPercent - b.targetPercent);
}

export function simulateTokenMultiTp(
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
          const requiredFractionOfOriginal = 1 / multiple;
          soldFraction = Math.min(remainingFraction, requiredFractionOfOriginal);
        }
      } else {
        soldFraction = (remainingFraction * Math.min(tp.withdrawPercent, 100)) / 100;
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

export function simulateTokenSimpleRealistic(amount: number, token: TokenWithMetrics): number {
  const realizedPercent = token.targetReached ? token.targetExitPercent : token.maxLossPercent;
  return amount * (1 + realizedPercent / 100);
}

export interface MultiTpSimulationResult {
  investedTotal: number;
  totalReceived: number;
  profit: number;
  profitPercent: number;
  tokensWithAtLeastOneTp: number;
  tokensFullLoss: number;
  totalFees: number;
  profitBeforeFees: number;
}

export interface DailyPnlPoint {
  dayKey: string;
  dayLabel: string;
  pnl: number;
}

export interface BestWorstDaySummary {
  bestDay: DailyPnlPoint;
  worstDay: DailyPnlPoint;
  averageDayPnl: number;
}

export function getLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMultiTpSimulation(
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

export function getMultiTpSimulationWalletAmounts(
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
