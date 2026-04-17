import { runWithConcurrency } from '@/lib/analysis/async-pool';
import type { DiscoveredBuyer } from '@/lib/analysis/discover-buyers';
import { collectSolanaBuysInRange } from '@/lib/gmgn/wallet-purchases';

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

async function getEntryMcapForPurchase(
  walletAddress: string,
  tokenAddress: string,
  purchasedAt: string
): Promise<number | null> {
  const purchaseMs = Date.parse(purchasedAt);
  if (!Number.isFinite(purchaseMs)) return null;
  const fromMs = Math.max(0, purchaseMs - PURCHASE_LOOKBACK_MS);
  const toMs = purchaseMs + PURCHASE_LOOKAHEAD_MS;
  const rows = await collectSolanaBuysInRange(walletAddress, fromMs, toMs);
  const match = rows.find((row) => {
    const mint = row.token?.address ?? row.token_address;
    return mint === tokenAddress;
  });
  if (!match) return null;
  return parseMcapValue(match.price_usd);
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
  const cache = new Map<string, Promise<number | null>>();
  let completed = 0;

  const decisions = await runWithConcurrency(buyers, concurrency, async (buyer) => {
    let hasKnownMcap = false;
    let hasInRangeMcap = false;

    for (const purchase of buyer.purchases) {
      const key = `${buyer.walletAddress}:${purchase.tokenAddress}:${purchase.purchasedAt}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = getEntryMcapForPurchase(
          buyer.walletAddress,
          purchase.tokenAddress,
          purchase.purchasedAt
        );
        cache.set(key, pending);
      }
      const mcap = await pending;
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
