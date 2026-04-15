import type { TokenBuyer } from '@/types/analysis';
import { getTokenBuyers } from '@/lib/helius/token-buyers';
import { isKnownExchange } from '@/lib/helius/exchange-addresses';
import { collectSolanaBuysInRange } from '@/lib/gmgn/wallet-purchases';
import { runWithConcurrency } from '@/lib/analysis/async-pool';

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

interface RecoverWalletCentricBuyersOpts {
  fromMs?: number;
  toMs?: number;
  excludeWallets?: string[];
  minCoveragePercent?: number;
  maxCandidates?: number;
  concurrency?: number;
  onProgress?: (current: number, total: number) => void;
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

function rowTimestampSec(row: { timestamp?: number; ts?: number; block_time?: number; time?: number }): number {
  const candidates = [row.timestamp, row.ts, row.block_time, row.time];
  for (const value of candidates) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    if (value >= 1_000_000_000_000) return Math.floor(value / 1000);
    return Math.floor(value);
  }
  return 0;
}

function normalizeWalletCandidates(wallets: string[], maxCandidates: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const wallet of wallets) {
    const trimmed = wallet.trim();
    if (trimmed === '') continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= maxCandidates) break;
  }
  return out;
}

export async function recoverWalletCentricBuyers(
  tokenMints: { address: string; name: string | null }[],
  candidateWallets: string[],
  opts?: RecoverWalletCentricBuyersOpts
): Promise<DiscoverBuyersResult> {
  const totalTokens = tokenMints.length;
  if (totalTokens === 0 || candidateWallets.length === 0) {
    return { buyers: [], tokenCount: totalTokens, totalUniqueBuyers: 0 };
  }

  const nowMs = Date.now();
  const fromMs = opts?.fromMs ?? nowMs - 90 * 24 * 60 * 60 * 1000;
  const toMs = opts?.toMs ?? nowMs;
  const minCoveragePercent = opts?.minCoveragePercent ?? Number(process.env.WALLET_CENTRIC_MIN_COVERAGE_PERCENT ?? '10');
  const maxCandidates = Math.max(1, opts?.maxCandidates ?? Number(process.env.WALLET_CENTRIC_MAX_CANDIDATES ?? '15'));
  const concurrency = Math.max(1, opts?.concurrency ?? Number(process.env.WALLET_CENTRIC_CONCURRENCY ?? '2'));

  const excludeSet = new Set(opts?.excludeWallets?.map((wallet) => wallet.toLowerCase()) ?? []);
  const tokenNameByAddress = new Map(tokenMints.map((token) => [token.address, token.name]));
  const tokenSet = new Set(tokenMints.map((token) => token.address));
  const normalizedCandidates = normalizeWalletCandidates(candidateWallets, maxCandidates);

  let completed = 0;
  const total = normalizedCandidates.length;
  const recovered = await runWithConcurrency(normalizedCandidates, concurrency, async (walletAddress) => {
    if (excludeSet.has(walletAddress.toLowerCase())) {
      completed += 1;
      opts?.onProgress?.(completed, total);
      return null;
    }
    if (isKnownExchange(walletAddress)) {
      completed += 1;
      opts?.onProgress?.(completed, total);
      return null;
    }

    const rows = await collectSolanaBuysInRange(walletAddress, fromMs, toMs);
    const byToken = new Map<string, TokenBuyer>();
    for (const row of rows) {
      const tokenAddress = row.token?.address ?? row.token_address;
      if (!tokenAddress || !tokenSet.has(tokenAddress)) continue;
      const tsSec = rowTimestampSec(row);
      if (tsSec <= 0) continue;
      const purchasedAt = new Date(tsSec * 1000).toISOString();
      const existing = byToken.get(tokenAddress);
      if (!existing || existing.purchasedAt > purchasedAt) {
        byToken.set(tokenAddress, {
          walletAddress,
          tokenAddress,
          tokenName: tokenNameByAddress.get(tokenAddress) ?? null,
          purchasedAt,
          amountSol: null,
        });
      }
    }

    const purchases = Array.from(byToken.values());
    if (purchases.length === 0) {
      completed += 1;
      opts?.onProgress?.(completed, total);
      return null;
    }
    const coveragePercent = (purchases.length / totalTokens) * 100;
    if (coveragePercent < minCoveragePercent) {
      completed += 1;
      opts?.onProgress?.(completed, total);
      return null;
    }

    completed += 1;
    opts?.onProgress?.(completed, total);
    return {
      walletAddress,
      tokensBought: purchases.length,
      totalTokens,
      coveragePercent,
      purchases,
    } satisfies DiscoveredBuyer;
  });

  const buyers = recovered
    .filter((value): value is DiscoveredBuyer => value !== null)
    .sort((a, b) => b.tokensBought - a.tokensBought || b.coveragePercent - a.coveragePercent);

  return {
    buyers,
    tokenCount: totalTokens,
    totalUniqueBuyers: buyers.length,
  };
}
