import type { FundingChainResult } from '@/types/analysis';
import {
  getEnhancedTransactionsByAddress,
  DUST_SOL_THRESHOLD,
  LAMPORTS_PER_SOL,
  type HeliusEnhancedTransaction,
} from '@/lib/helius/client';
import { isKnownExchange, isNoisyWallet } from '@/lib/helius/exchange-addresses';

const DEFAULT_MAX_DEPTH = 5;

interface TraceFundingChainOpts {
  maxDepth?: number;
}

/**
 * Recursively trace the funding chain of a wallet up to `maxDepth` levels.
 *
 * At each level, fetches enhanced transactions for the wallet, identifies the
 * primary SOL funder (earliest significant incoming transfer), and recurses.
 *
 * Stop conditions:
 * - Known exchange address detected
 * - Circular reference (wallet already in chain)
 * - Depth limit reached
 * - Wallet has too many incoming transfers (>500 = noisy/exchange-like)
 * - No significant funder found
 */
export async function traceFundingChain(
  wallet: string,
  opts?: TraceFundingChainOpts
): Promise<FundingChainResult> {
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const chain: string[] = [wallet];
  const visited = new Set<string>([wallet]);

  let current = wallet;

  for (let depth = 1; depth <= maxDepth; depth++) {
    const funder = await findPrimaryFunder(current);

    if (!funder) {
      return {
        wallet,
        mother: chain.length > 1 ? chain[chain.length - 1] : null,
        depth: depth - 1,
        chain,
        stoppedBy: 'no_funder',
      };
    }

    if (isKnownExchange(funder.address)) {
      return {
        wallet,
        mother: null,
        depth,
        chain: [...chain, funder.address],
        stoppedBy: 'exchange',
      };
    }

    if (visited.has(funder.address)) {
      return {
        wallet,
        mother: chain.length > 1 ? chain[chain.length - 1] : null,
        depth: depth - 1,
        chain,
        stoppedBy: 'circular',
      };
    }

    if (funder.isNoisy) {
      return {
        wallet,
        mother: null,
        depth,
        chain: [...chain, funder.address],
        stoppedBy: 'noisy',
      };
    }

    chain.push(funder.address);
    visited.add(funder.address);
    current = funder.address;
  }

  return {
    wallet,
    mother: chain[chain.length - 1],
    depth: maxDepth,
    chain,
    stoppedBy: 'depth',
  };
}

interface FunderInfo {
  address: string;
  amount: number;
  isNoisy: boolean;
}

async function findPrimaryFunder(wallet: string): Promise<FunderInfo | null> {
  const txs = await getEnhancedTransactionsByAddress(wallet);

  const incomingSolTransfers = extractIncomingSolTransfers(txs, wallet);

  if (isNoisyWallet(incomingSolTransfers.length)) {
    const biggest = incomingSolTransfers.reduce((a, b) => (a.amount > b.amount ? a : b));
    return { address: biggest.from, amount: biggest.amount, isNoisy: true };
  }

  const significant = incomingSolTransfers.filter((t) => t.amount >= DUST_SOL_THRESHOLD);

  if (significant.length === 0) return null;

  significant.sort((a, b) => a.timestamp - b.timestamp);
  const earliest = significant[0];

  return { address: earliest.from, amount: earliest.amount, isNoisy: false };
}

interface SolTransfer {
  from: string;
  amount: number;
  timestamp: number;
}

function extractIncomingSolTransfers(
  txs: HeliusEnhancedTransaction[],
  wallet: string
): SolTransfer[] {
  const transfers: SolTransfer[] = [];

  for (const tx of txs) {
    if (!tx.nativeTransfers) continue;

    for (const nt of tx.nativeTransfers) {
      if (
        nt.toUserAccount === wallet &&
        nt.fromUserAccount !== wallet &&
        nt.amount > 0
      ) {
        transfers.push({
          from: nt.fromUserAccount,
          amount: nt.amount / LAMPORTS_PER_SOL,
          timestamp: tx.timestamp,
        });
      }
    }
  }

  return transfers;
}
