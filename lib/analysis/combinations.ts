import type { WalletCombinationStep } from '@/types/analysis';

export interface WalletTokenSet {
  walletAddress: string;
  tokens: Set<string>;
}

interface SolveCombinationsOpts {
  targetCoveragePercent?: number;
}

/**
 * Greedy set cover: find the smallest set of wallets that covers
 * the maximum number of rugger tokens.
 *
 * At each step, pick the wallet covering the most *uncovered* tokens.
 * Stop when target coverage is reached or no wallet adds new coverage.
 *
 * O(W * T) where W = wallets, T = tokens.
 */
export function solveCombinations(
  walletSets: WalletTokenSet[],
  allTokens: string[],
  opts?: SolveCombinationsOpts
): WalletCombinationStep[] {
  const totalTokens = allTokens.length;
  if (totalTokens === 0 || walletSets.length === 0) return [];

  const targetCoverage = (opts?.targetCoveragePercent ?? 100) / 100;
  const targetCount = Math.ceil(totalTokens * targetCoverage);

  const covered = new Set<string>();
  const used = new Set<string>();
  const steps: WalletCombinationStep[] = [];

  while (covered.size < targetCount) {
    let bestWallet: string | null = null;
    let bestNewTokens: string[] = [];

    for (const ws of walletSets) {
      if (used.has(ws.walletAddress)) continue;

      const newTokens: string[] = [];
      for (const token of ws.tokens) {
        if (!covered.has(token)) newTokens.push(token);
      }

      if (newTokens.length > bestNewTokens.length) {
        bestWallet = ws.walletAddress;
        bestNewTokens = newTokens;
      }
    }

    if (!bestWallet || bestNewTokens.length === 0) break;

    used.add(bestWallet);
    for (const t of bestNewTokens) covered.add(t);

    steps.push({
      walletAddress: bestWallet,
      newTokensCovered: bestNewTokens,
      cumulativeCoverage: (covered.size / totalTokens) * 100,
    });
  }

  return steps;
}
