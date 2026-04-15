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
  entryQualityNormalized: number;
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
    // Normalize entry quality into [0,100] then blend into a final score out of 100.
    // 300% max-gain avg is treated as "full" entry quality score.
    const entryQualityNormalized = Math.max(0, Math.min((entryQualityScore / 300) * 100, 100));
    const blendedScore =
      coveragePercent * 0.65 + tpHitRate * 0.25 + entryQualityNormalized * 0.1;
    const compositeScore = Math.max(0, Math.min(blendedScore, 100));

    return {
      walletAddress: wallet.walletAddress,
      coveragePercent,
      matchedTokenCount,
      tpHitCount,
      tpHitRate,
      entryQualityScore,
      entryQualityNormalized,
      compositeScore,
    };
  });

  return results.sort(
    (a, b) =>
      b.compositeScore - a.compositeScore ||
      b.coveragePercent - a.coveragePercent ||
      b.tpHitRate - a.tpHitRate ||
      b.tpHitCount - a.tpHitCount ||
      b.entryQualityScore - a.entryQualityScore ||
      a.walletAddress.localeCompare(b.walletAddress)
  );
}
