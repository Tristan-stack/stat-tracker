export interface WalletTokenPreview {
  tokenAddress: string;
  entryPrice: number;
  high: number;
}

export interface WalletCandidateInput {
  walletAddress: string;
  analysisCoveragePercent?: number;
  previews: WalletTokenPreview[];
}

export interface BestWalletResult {
  walletAddress: string;
  coveragePercent: number;
  matchedTokenCount: number;
  tpHitCount: number;
  tpHitRate: number;
  entryQualityScore: number;
  compositeScore: number;
}

export function gainPercent(entryPrice: number, high: number): number {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(high) || entryPrice <= 0) return 0;
  return ((high - entryPrice) / entryPrice) * 100;
}

export function rankBestWallets(
  wallets: WalletCandidateInput[],
  topTokenAddresses: string[],
  tpMinPercent: number
): BestWalletResult[] {
  const tokenSet = new Set(topTokenAddresses.map((token) => token.trim()).filter((token) => token !== ''));
  if (tokenSet.size === 0) return [];

  const tokenCount = tokenSet.size;
  const results: BestWalletResult[] = wallets.map((wallet) => {
    const byMint = new Map(wallet.previews.map((preview) => [preview.tokenAddress.trim(), preview]));
    let matchedTokenCount = 0;
    let tpHitCount = 0;
    let gainSum = 0;

    for (const tokenAddress of tokenSet) {
      const preview = byMint.get(tokenAddress);
      if (!preview) continue;
      matchedTokenCount += 1;
      const gain = gainPercent(preview.entryPrice, preview.high);
      gainSum += gain;
      if (gain >= tpMinPercent) tpHitCount += 1;
    }

    const coveragePercent =
      matchedTokenCount > 0
        ? (matchedTokenCount / tokenCount) * 100
        : (wallet.analysisCoveragePercent ?? 0);
    const tpHitRate = matchedTokenCount > 0 ? (tpHitCount / matchedTokenCount) * 100 : 0;
    const entryQualityScore = matchedTokenCount > 0 ? gainSum / matchedTokenCount : 0;
    // coverage first, then tp hit rate/count, then entry quality as tiebreaker
    const compositeScore =
      coveragePercent * 1_000_000 +
      tpHitRate * 10_000 +
      tpHitCount * 100 +
      entryQualityScore;

    return {
      walletAddress: wallet.walletAddress,
      coveragePercent,
      matchedTokenCount,
      tpHitCount,
      tpHitRate,
      entryQualityScore,
      compositeScore,
    };
  });

  return results.sort(
    (a, b) =>
      b.coveragePercent - a.coveragePercent ||
      b.tpHitRate - a.tpHitRate ||
      b.tpHitCount - a.tpHitCount ||
      b.entryQualityScore - a.entryQualityScore ||
      a.walletAddress.localeCompare(b.walletAddress)
  );
}
