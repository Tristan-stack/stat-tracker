import type { FundingChainResult, MotherAddressResult } from '@/types/analysis';
import { traceFundingChain } from '@/lib/helius/funding-chain';
import { query } from '@/lib/db';

interface CachedChain {
  wallet_address: string;
  mother_address: string | null;
  funding_depth: number;
  chain_json: string;
}

interface TraceFundingOpts {
  maxDepth?: number;
  forceRefresh?: boolean;
}

export interface TraceFundingResult {
  chains: FundingChainResult[];
  mothers: MotherAddressResult[];
}

/**
 * Trace funding chains for a batch of buyer wallets.
 *
 * - Checks the per-user `funding_chain_cache` first
 * - On cache miss, calls `traceFundingChain` via Helius and stores the result
 * - Groups wallets by resolved mother address
 */
export async function traceFundingForWallets(
  walletAddresses: string[],
  userId: string,
  opts?: TraceFundingOpts
): Promise<TraceFundingResult> {
  const maxDepth = opts?.maxDepth ?? 5;
  const forceRefresh = opts?.forceRefresh ?? false;
  const chains: FundingChainResult[] = [];

  const cached = forceRefresh
    ? new Map<string, CachedChain>()
    : await loadCachedChains(userId, walletAddresses);

  for (const wallet of walletAddresses) {
    const hit = cached.get(wallet);
    if (hit) {
      chains.push({
        wallet,
        mother: hit.mother_address,
        depth: hit.funding_depth,
        chain: JSON.parse(hit.chain_json) as string[],
        stoppedBy: null,
      });
      continue;
    }

    const result = await traceFundingChain(wallet, { maxDepth });
    chains.push(result);

    await storeCachedChain(userId, result);
  }

  const mothers = groupByMother(chains);

  return { chains, mothers };
}

async function loadCachedChains(
  userId: string,
  wallets: string[]
): Promise<Map<string, CachedChain>> {
  if (wallets.length === 0) return new Map();

  const placeholders = wallets.map((_, i) => `$${i + 2}`).join(', ');
  const rows = await query<CachedChain>(
    `SELECT wallet_address, mother_address, funding_depth, chain_json
     FROM funding_chain_cache
     WHERE user_id = $1 AND wallet_address IN (${placeholders})`,
    [userId, ...wallets]
  );

  return new Map(rows.map((r) => [r.wallet_address, r]));
}

async function storeCachedChain(
  userId: string,
  result: FundingChainResult
): Promise<void> {
  await query(
    `INSERT INTO funding_chain_cache (id, user_id, wallet_address, mother_address, funding_depth, chain_json, resolved_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, wallet_address)
     DO UPDATE SET mother_address = $3, funding_depth = $4, chain_json = $5, resolved_at = NOW()`,
    [userId, result.wallet, result.mother, result.depth, JSON.stringify(result.chain)]
  );
}

function groupByMother(chains: FundingChainResult[]): MotherAddressResult[] {
  const motherMap = new Map<string, string[]>();

  for (const chain of chains) {
    if (!chain.mother) continue;
    const existing = motherMap.get(chain.mother);
    if (existing) {
      existing.push(chain.wallet);
    } else {
      motherMap.set(chain.mother, [chain.wallet]);
    }
  }

  return Array.from(motherMap.entries())
    .map(([address, wallets]) => ({
      address,
      walletsFunded: wallets.length,
      wallets,
    }))
    .sort((a, b) => b.walletsFunded - a.walletsFunded);
}
