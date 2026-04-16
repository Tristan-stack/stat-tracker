import { getEnhancedTransactionsByAddress } from '@/lib/helius/client';
import { runWithConcurrency } from '@/lib/analysis/async-pool';
import type { DiscoveredBuyer } from '@/lib/analysis/discover-buyers';

const DEFAULT_THRESHOLD_HOURS = 24;
const DEFAULT_CONCURRENCY = Number(process.env.FILTER_ACTIVE_CONCURRENCY ?? '10');

interface FilterActiveBuyersOpts {
  thresholdHours?: number;
  concurrency?: number;
  onProgress?: (current: number, total: number) => void;
}

export interface FilterActiveBuyersResult {
  keptBuyers: DiscoveredBuyer[];
  removedCount: number;
  /** Wallets éliminés (inactifs au-delà du seuil OU erreur considérée comme inactive). */
  inactiveWallets: string[];
  /** Wallets dont le check a échoué (erreur Helius) — conservés par sécurité. */
  unknownWallets: string[];
}

/**
 * Pour chaque buyer, récupère la tx enrichie la plus récente via Helius
 * et conserve uniquement ceux dont `timestamp` est dans la fenêtre `thresholdHours`.
 *
 * Un appel Helius léger par wallet (limit=1, 1re page). En cas d'erreur réseau,
 * on garde le wallet par défaut (fail-open) pour ne pas pénaliser l'analyse.
 */
export async function filterBuyersByLastActivity(
  buyers: DiscoveredBuyer[],
  opts?: FilterActiveBuyersOpts
): Promise<FilterActiveBuyersResult> {
  if (buyers.length === 0) {
    return { keptBuyers: [], removedCount: 0, inactiveWallets: [], unknownWallets: [] };
  }

  const thresholdHours = opts?.thresholdHours ?? DEFAULT_THRESHOLD_HOURS;
  const concurrency = Math.max(1, opts?.concurrency ?? DEFAULT_CONCURRENCY);
  const cutoffSec = Math.floor(Date.now() / 1000) - thresholdHours * 3600;

  let processed = 0;

  const flags = await runWithConcurrency(
    buyers,
    concurrency,
    async (buyer): Promise<{ keep: boolean; error: boolean }> => {
      try {
        const txs = await getEnhancedTransactionsByAddress(buyer.walletAddress);
        const latestTs = txs.reduce<number>((max, tx) => (tx.timestamp > max ? tx.timestamp : max), 0);
        return { keep: latestTs >= cutoffSec, error: false };
      } catch {
        return { keep: true, error: true };
      } finally {
        processed += 1;
        opts?.onProgress?.(processed, buyers.length);
      }
    }
  );

  const keptBuyers: DiscoveredBuyer[] = [];
  const inactiveWallets: string[] = [];
  const unknownWallets: string[] = [];

  for (let i = 0; i < buyers.length; i += 1) {
    const buyer = buyers[i];
    const flag = flags[i];
    if (flag.keep) {
      keptBuyers.push(buyer);
      if (flag.error) unknownWallets.push(buyer.walletAddress);
    } else {
      inactiveWallets.push(buyer.walletAddress);
    }
  }

  return {
    keptBuyers,
    removedCount: inactiveWallets.length,
    inactiveWallets,
    unknownWallets,
  };
}
