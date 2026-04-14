import type { SiblingDiscoveryResult } from '@/types/analysis';
import { findSiblingWallets } from '@/lib/helius/sibling-wallets';
import { query } from '@/lib/db';

interface DiscoverSiblingsOpts {
  maxDepth?: number;
  siblingLimit?: number;
  forceRefresh?: boolean;
}

/**
 * Discover "sibling" wallets: wallets funded by the same mother address
 * as the rugger wallet. Uses the funding chain cache when available.
 *
 * Flow:
 * 1. Check cache for the rugger's own funding chain
 * 2. If miss, trace the rugger's chain to find its mother
 * 3. From the mother, find all outgoing SOL transfers (sibling wallets)
 */
export async function discoverSiblingWallets(
  ruggerWallet: string,
  userId: string,
  opts?: DiscoverSiblingsOpts
): Promise<SiblingDiscoveryResult> {
  const maxDepth = opts?.maxDepth ?? 5;
  const siblingLimit = opts?.siblingLimit ?? 200;
  const forceRefresh = opts?.forceRefresh ?? false;

  if (!forceRefresh) {
    const cached = await loadCachedMotherForWallet(userId, ruggerWallet);
    if (cached) {
      const { getChildWallets } = await import('@/lib/helius/sibling-wallets');
      const siblings = await getChildWallets(cached.motherAddress, ruggerWallet, siblingLimit);
      return {
        motherAddress: cached.motherAddress,
        siblings,
        ruggerChain: cached.chain,
      };
    }
  }

  const result = await findSiblingWallets(ruggerWallet, { maxDepth, siblingLimit });

  if (result.motherAddress) {
    await storeCachedChain(userId, ruggerWallet, result.motherAddress, result.ruggerChain, maxDepth);
  }

  return {
    motherAddress: result.motherAddress,
    siblings: result.siblings,
    ruggerChain: result.ruggerChain,
  };
}

interface CachedMother {
  motherAddress: string;
  chain: string[];
}

async function loadCachedMotherForWallet(
  userId: string,
  wallet: string
): Promise<CachedMother | null> {
  const rows = await query<{
    mother_address: string | null;
    chain_json: string;
  }>(
    `SELECT mother_address, chain_json
     FROM funding_chain_cache
     WHERE user_id = $1 AND wallet_address = $2`,
    [userId, wallet]
  );

  if (rows.length === 0 || !rows[0].mother_address) return null;

  return {
    motherAddress: rows[0].mother_address,
    chain: JSON.parse(rows[0].chain_json) as string[],
  };
}

async function storeCachedChain(
  userId: string,
  wallet: string,
  motherAddress: string,
  chain: string[],
  depth: number
): Promise<void> {
  await query(
    `INSERT INTO funding_chain_cache (id, user_id, wallet_address, mother_address, funding_depth, chain_json, resolved_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, wallet_address)
     DO UPDATE SET mother_address = $3, funding_depth = $4, chain_json = $5, resolved_at = NOW()`,
    [userId, wallet, motherAddress, depth, JSON.stringify(chain)]
  );
}
