import type { TokenBuyer } from '@/types/analysis';
import { getTokenBuyers } from '@/lib/helius/token-buyers';
import { isKnownExchange } from '@/lib/helius/exchange-addresses';

export interface DiscoveredBuyer {
  walletAddress: string;
  tokensBought: number;
  totalTokens: number;
  coveragePercent: number;
  purchases: TokenBuyer[];
}

interface DiscoverBuyersOpts {
  buyerLimit?: number;
  excludeWallets?: string[];
  globalCandidateLimit?: number;
}

export interface DiscoverBuyersResult {
  buyers: DiscoveredBuyer[];
  tokenCount: number;
  totalUniqueBuyers: number;
}

/**
 * Discover buyers across all token mints for a rugger.
 *
 * - Calls `getTokenBuyers` per token (capped at `buyerLimit` per token)
 * - Cross-references wallets across tokens
 * - Filters out the rugger's own wallet(s)
 * - Sorts by # of tokens bought (most suspicious first)
 */
export async function discoverBuyers(
  tokenMints: { address: string; name: string | null }[],
  opts?: DiscoverBuyersOpts
): Promise<DiscoverBuyersResult> {
  const limit = opts?.buyerLimit ?? 200;
  const excludeSet = new Set(opts?.excludeWallets?.map((w) => w.toLowerCase()) ?? []);
  const totalTokens = tokenMints.length;

  const walletMap = new Map<string, TokenBuyer[]>();

  for (const token of tokenMints) {
    const buyers = await getTokenBuyers(token.address, { buyerLimit: limit });

    for (const buyer of buyers) {
      const addr = buyer.walletAddress;
      if (excludeSet.has(addr.toLowerCase())) continue;
      if (isKnownExchange(addr)) continue;

      const enriched: TokenBuyer = { ...buyer, tokenName: token.name };

      const existing = walletMap.get(addr);
      if (existing) {
        const alreadyHasToken = existing.some((p) => p.tokenAddress === token.address);
        if (!alreadyHasToken) existing.push(enriched);
      } else {
        walletMap.set(addr, [enriched]);
      }
    }
  }

  const buyers: DiscoveredBuyer[] = Array.from(walletMap.entries()).map(
    ([walletAddress, purchases]) => ({
      walletAddress,
      tokensBought: purchases.length,
      totalTokens,
      coveragePercent: (purchases.length / totalTokens) * 100,
      purchases,
    })
  );

  buyers.sort((a, b) => b.tokensBought - a.tokensBought || b.coveragePercent - a.coveragePercent);
  const cappedBuyers = applyGlobalCandidateCap(
    buyers,
    opts?.globalCandidateLimit ?? null
  );

  return {
    buyers: cappedBuyers,
    tokenCount: totalTokens,
    totalUniqueBuyers: cappedBuyers.length,
  };
}

function applyGlobalCandidateCap(
  buyers: DiscoveredBuyer[],
  globalCandidateLimit: number | null
): DiscoveredBuyer[] {
  if (globalCandidateLimit == null || !Number.isFinite(globalCandidateLimit) || globalCandidateLimit <= 0) {
    return buyers;
  }
  return buyers.slice(0, globalCandidateLimit);
}
