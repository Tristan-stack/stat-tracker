export interface PurchaseData {
  tokenAddress: string;
  purchasedAt: string | null;
  amountSol: number | null;
}

export interface ScoringInput {
  walletAddress: string;
  purchases: PurchaseData[];
  totalRuggerTokens: number;
}

export interface ScoringResult {
  walletAddress: string;
  tokensBought: number;
  totalTokens: number;
  coveragePercent: number;
  consistency: number;
  weight: number;
  activeDays: number;
  firstBuyAt: string | null;
  lastBuyAt: string | null;
  avgHoldDurationHours: number | null;
}

export function computeCoverage(tokensBought: number, totalTokens: number): number {
  if (totalTokens === 0) return 0;
  return (tokensBought / totalTokens) * 100;
}

export function computeConsistency(purchases: PurchaseData[], totalTokens: number): number {
  if (totalTokens === 0) return 0;
  const uniqueTokens = new Set(purchases.map((p) => p.tokenAddress)).size;
  const coverageFactor = uniqueTokens / totalTokens;

  const timestamps = purchases
    .map((p) => (p.purchasedAt ? new Date(p.purchasedAt).getTime() : null))
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  if (timestamps.length <= 1) return coverageFactor * 100;

  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push(timestamps[i] - timestamps[i - 1]);
  }

  const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (meanGap === 0) return coverageFactor * 100;

  const variance = gaps.reduce((s, g) => s + (g - meanGap) ** 2, 0) / gaps.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / meanGap;
  const regularityFactor = 1 - Math.min(1, cv);

  return coverageFactor * regularityFactor * 100;
}

export function computeWeights(inputs: ScoringInput[]): Map<string, number> {
  const totals = new Map<string, number>();

  let hasSolData = false;
  for (const input of inputs) {
    let total = 0;
    for (const p of input.purchases) {
      if (p.amountSol !== null && p.amountSol > 0) {
        total += p.amountSol;
        hasSolData = true;
      }
    }
    totals.set(input.walletAddress, total);
  }

  if (!hasSolData) {
    const counts = new Map<string, number>();
    let maxCount = 0;
    for (const input of inputs) {
      counts.set(input.walletAddress, input.purchases.length);
      maxCount = Math.max(maxCount, input.purchases.length);
    }
    const result = new Map<string, number>();
    for (const [addr, count] of counts) {
      result.set(addr, maxCount > 0 ? (count / maxCount) * 100 : 0);
    }
    return result;
  }

  let maxTotal = 0;
  for (const total of totals.values()) {
    maxTotal = Math.max(maxTotal, total);
  }

  const result = new Map<string, number>();
  for (const [addr, total] of totals) {
    result.set(addr, maxTotal > 0 ? (total / maxTotal) * 100 : 0);
  }
  return result;
}

export function computeActiveDays(purchases: PurchaseData[]): number {
  const days = new Set<string>();
  for (const p of purchases) {
    if (p.purchasedAt) {
      days.add(p.purchasedAt.slice(0, 10));
    }
  }
  return days.size;
}

export function computeDurationDays(purchases: PurchaseData[]): number {
  const timestamps = purchases
    .map((p) => (p.purchasedAt ? new Date(p.purchasedAt).getTime() : null))
    .filter((t): t is number => t !== null);

  if (timestamps.length < 2) return 0;

  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  return (max - min) / (1000 * 60 * 60 * 24);
}

function getFirstLastBuy(purchases: PurchaseData[]): { first: string | null; last: string | null } {
  const timestamps = purchases
    .filter((p) => p.purchasedAt)
    .map((p) => p.purchasedAt!)
    .sort();

  if (timestamps.length === 0) return { first: null, last: null };
  return { first: timestamps[0], last: timestamps[timestamps.length - 1] };
}

export function scoreWallets(inputs: ScoringInput[]): ScoringResult[] {
  const weights = computeWeights(inputs);

  return inputs.map((input) => {
    const uniqueTokens = new Set(input.purchases.map((p) => p.tokenAddress)).size;
    const { first, last } = getFirstLastBuy(input.purchases);

    return {
      walletAddress: input.walletAddress,
      tokensBought: uniqueTokens,
      totalTokens: input.totalRuggerTokens,
      coveragePercent: computeCoverage(uniqueTokens, input.totalRuggerTokens),
      consistency: computeConsistency(input.purchases, input.totalRuggerTokens),
      weight: weights.get(input.walletAddress) ?? 0,
      activeDays: computeActiveDays(input.purchases),
      firstBuyAt: first,
      lastBuyAt: last,
      avgHoldDurationHours: null,
    };
  });
}
