import { heliusRpc, LAMPORTS_PER_SOL } from '@/lib/helius/client';
import { fetchSolUsdFromHeliusDas } from '@/lib/helius/sol-spot';
import type { PnlBalance } from '@/types/pnl';

interface GetBalanceResult {
  value: number;
}

/**
 * Balance SOL native courante d'un wallet + valeur USD (holdings SPL hors scope v1).
 * Le prix SOL peut être fourni (réutilisation) sinon il est récupéré via Helius DAS.
 */
export async function fetchWalletBalance(
  walletAddress: string,
  solUsd?: number | null
): Promise<PnlBalance> {
  const res = await heliusRpc<GetBalanceResult>('getBalance', [
    walletAddress,
    { commitment: 'confirmed' },
  ]);
  const lamports = typeof res?.value === 'number' && Number.isFinite(res.value) ? res.value : 0;
  const sol = lamports / LAMPORTS_PER_SOL;

  let price = solUsd ?? null;
  if (price === null) {
    try {
      price = await fetchSolUsdFromHeliusDas();
    } catch {
      price = null;
    }
  }

  const valueUsd = price !== null ? sol * price : null;
  return { sol, lamports, solUsd: price, valueUsd };
}
