import { getSignaturesForAddress } from '@/lib/helius/client';

const SIGNATURES_PER_PAGE = 1000;
const MAX_PAGES = 20;

/**
 * Returns earliest observed transaction time for a wallet.
 * This is a practical approximation based on paginated signature history.
 */
export async function fetchWalletCreatedAt(walletAddress: string): Promise<Date | null> {
  let before: string | undefined;
  let oldestBlockTimeSec: number | null = null;

  for (let i = 0; i < MAX_PAGES; i += 1) {
    const rows = await getSignaturesForAddress(walletAddress, {
      limit: SIGNATURES_PER_PAGE,
      before,
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (typeof row.blockTime !== 'number' || !Number.isFinite(row.blockTime) || row.blockTime <= 0) continue;
      if (oldestBlockTimeSec === null || row.blockTime < oldestBlockTimeSec) oldestBlockTimeSec = row.blockTime;
    }

    if (rows.length < SIGNATURES_PER_PAGE) break;
    before = rows[rows.length - 1]?.signature;
    if (!before) break;
  }

  if (oldestBlockTimeSec === null) return null;
  return new Date(oldestBlockTimeSec * 1000);
}

