import { runWithConcurrency } from '@/lib/analysis/async-pool';
import type { DiscoveredBuyer } from '@/lib/analysis/discover-buyers';
import { collectSolanaBuysInRange } from '@/lib/gmgn/wallet-purchases';
import type { WalletActivityRow } from '@/lib/gmgn/client';

const DEFAULT_CONCURRENCY = Number(process.env.FILTER_MCAP_CONCURRENCY ?? '4');
const PURCHASE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const PURCHASE_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

interface FilterBuyersByMcapOpts {
  mcapMin?: number;
  mcapMax?: number;
  concurrency?: number;
  onProgress?: (current: number, total: number) => void;
}

export interface FilterBuyersByMcapResult {
  keptBuyers: DiscoveredBuyer[];
  removedCount: number;
  removedWallets: string[];
  unknownWallets: string[];
}

function parseMcapValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function tokenMint(row: WalletActivityRow): string | null {
  const mint = row.token?.address ?? row.token_address;
  if (typeof mint !== 'string' || mint.trim() === '') return null;
  return mint;
}

function buildMcapByToken(rows: WalletActivityRow[]): Map<string, number> {
  const byToken = new Map<string, number>();
  for (const row of rows) {
    const mint = tokenMint(row);
    if (!mint || byToken.has(mint)) continue;
    const mcap = parseMcapValue(row.price_usd);
    if (mcap !== null) byToken.set(mint, mcap);
  }
  return byToken;
}

function computeWalletRangeMs(purchases: DiscoveredBuyer['purchases']): { fromMs: number; toMs: number } | null {
  const purchaseMsValues = purchases
    .map((purchase) => Date.parse(purchase.purchasedAt))
    .filter((value) => Number.isFinite(value)) as number[];
  if (purchaseMsValues.length === 0) return null;
  const minPurchaseMs = Math.min(...purchaseMsValues);
  const maxPurchaseMs = Math.max(...purchaseMsValues);
  return {
    fromMs: Math.max(0, minPurchaseMs - PURCHASE_LOOKBACK_MS),
    toMs: maxPurchaseMs + PURCHASE_LOOKAHEAD_MS,
  };
}

function isInsideRange(value: number, min?: number, max?: number): boolean {
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

export async function filterBuyersByMcapRange(
  buyers: DiscoveredBuyer[],
  opts?: FilterBuyersByMcapOpts
): Promise<FilterBuyersByMcapResult> {
  const mcapMin = opts?.mcapMin;
  const mcapMax = opts?.mcapMax;
  if (buyers.length === 0) {
    return { keptBuyers: [], removedCount: 0, removedWallets: [], unknownWallets: [] };
  }
  if (mcapMin === undefined && mcapMax === undefined) {
    return { keptBuyers: buyers, removedCount: 0, removedWallets: [], unknownWallets: [] };
  }

  const concurrency = Math.max(1, opts?.concurrency ?? DEFAULT_CONCURRENCY);
  const walletRowsCache = new Map<string, Promise<WalletActivityRow[]>>();
  let completed = 0;

  const decisions = await runWithConcurrency(buyers, concurrency, async (buyer) => {
    const range = computeWalletRangeMs(buyer.purchases);
    if (!range) {
      completed += 1;
      opts?.onProgress?.(completed, buyers.length);
      return { keep: true, unknown: true };
    }

    let pendingRows = walletRowsCache.get(buyer.walletAddress);
    if (!pendingRows) {
      pendingRows = collectSolanaBuysInRange(buyer.walletAddress, range.fromMs, range.toMs);
      walletRowsCache.set(buyer.walletAddress, pendingRows);
    }
    const walletRows = await pendingRows;
    const mcapByToken = buildMcapByToken(walletRows);

    let hasKnownMcap = false;
    let hasInRangeMcap = false;

    for (const purchase of buyer.purchases) {
      const mcap = mcapByToken.get(purchase.tokenAddress) ?? null;
      if (mcap === null) continue;
      hasKnownMcap = true;
      if (isInsideRange(mcap, mcapMin, mcapMax)) {
        hasInRangeMcap = true;
        break;
      }
    }

    completed += 1;
    opts?.onProgress?.(completed, buyers.length);

    if (hasInRangeMcap) return { keep: true, unknown: false };
    if (!hasKnownMcap) return { keep: true, unknown: true };
    return { keep: false, unknown: false };
  });

  const keptBuyers: DiscoveredBuyer[] = [];
  const removedWallets: string[] = [];
  const unknownWallets: string[] = [];

  for (let i = 0; i < buyers.length; i += 1) {
    const buyer = buyers[i];
    const decision = decisions[i];
    if (decision.keep) {
      keptBuyers.push(buyer);
      if (decision.unknown) unknownWallets.push(buyer.walletAddress);
    } else {
      removedWallets.push(buyer.walletAddress);
    }
  }

  return {
    keptBuyers,
    removedCount: removedWallets.length,
    removedWallets,
    unknownWallets,
  };
}
