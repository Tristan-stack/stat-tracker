import type { WalletPurchasePreview } from '@/lib/gmgn/wallet-purchases';

export interface BestBuyPerMint {
  tokenAddress: string;
  tokenName: string | null;
  purchasedAt: string;
  entryPrice: number;
  high: number;
  low: number;
}

/**
 * Dedupe by mint: keep the buy with lowest entryPrice; tie-break earlier purchasedAt.
 * Matches rugger aggregate-tokens import strategy.
 */
export function mergeWalletPreviewsToBestBuyPerMint(
  previews: WalletPurchasePreview[]
): Map<string, BestBuyPerMint> {
  const tokenMap = new Map<string, BestBuyPerMint>();
  for (const preview of previews) {
    const mint = preview.tokenAddress.trim();
    if (mint === '') continue;
    const existing = tokenMap.get(mint);
    const next: BestBuyPerMint = {
      tokenAddress: mint,
      tokenName: preview.name?.trim() || null,
      purchasedAt: preview.purchasedAt,
      entryPrice: preview.entryPrice,
      high: preview.high,
      low: preview.low,
    };
    if (!existing) {
      tokenMap.set(mint, next);
      continue;
    }
    const betterEntry = preview.entryPrice < existing.entryPrice;
    const sameEntry = preview.entryPrice === existing.entryPrice;
    const olderBuy = new Date(preview.purchasedAt).getTime() < new Date(existing.purchasedAt).getTime();
    if (betterEntry || (sameEntry && olderBuy)) {
      tokenMap.set(mint, next);
    }
  }
  return tokenMap;
}
