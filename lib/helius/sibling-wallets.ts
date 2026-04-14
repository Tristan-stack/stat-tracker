import type { SiblingWallet } from '@/types/analysis';
import {
  getEnhancedTransactionsByAddress,
  DUST_SOL_THRESHOLD,
  LAMPORTS_PER_SOL,
  type HeliusEnhancedTransaction,
} from '@/lib/helius/client';
import { isKnownExchange } from '@/lib/helius/exchange-addresses';
import { traceFundingChain } from '@/lib/helius/funding-chain';

const DEFAULT_SIBLING_LIMIT = 200;

interface FindSiblingsOpts {
  maxDepth?: number;
  siblingLimit?: number;
}

interface SiblingDiscovery {
  motherAddress: string | null;
  ruggerChain: string[];
  siblings: SiblingWallet[];
}

/**
 * Starting from a rugger wallet, trace its funding chain to find the mother
 * address, then find all other wallets directly funded by that mother.
 */
export async function findSiblingWallets(
  ruggerWallet: string,
  opts?: FindSiblingsOpts
): Promise<SiblingDiscovery> {
  const maxDepth = opts?.maxDepth ?? 5;
  const siblingLimit = opts?.siblingLimit ?? DEFAULT_SIBLING_LIMIT;

  const chainResult = await traceFundingChain(ruggerWallet, { maxDepth });

  if (!chainResult.mother) {
    return { motherAddress: null, ruggerChain: chainResult.chain, siblings: [] };
  }

  const siblings = await getChildWallets(chainResult.mother, ruggerWallet, siblingLimit);

  return {
    motherAddress: chainResult.mother,
    ruggerChain: chainResult.chain,
    siblings,
  };
}

/**
 * Find all wallets that received SOL from a given mother address.
 * Filters out exchanges, dust amounts, and the excluded wallet (rugger itself).
 */
export async function getChildWallets(
  motherAddress: string,
  excludeWallet: string,
  limit: number = DEFAULT_SIBLING_LIMIT
): Promise<SiblingWallet[]> {
  const txs = await getEnhancedTransactionsByAddress(motherAddress);
  const outgoing = extractOutgoingSolTransfers(txs, motherAddress);

  const walletMap = new Map<string, SiblingWallet>();

  for (const transfer of outgoing) {
    if (transfer.to === excludeWallet) continue;
    if (transfer.to === motherAddress) continue;
    if (isKnownExchange(transfer.to)) continue;
    if (transfer.amount < DUST_SOL_THRESHOLD) continue;

    if (!walletMap.has(transfer.to)) {
      walletMap.set(transfer.to, {
        walletAddress: transfer.to,
        motherAddress,
        amountReceived: transfer.amount,
        receivedAt: new Date(transfer.timestamp * 1000).toISOString(),
      });
    }

    if (walletMap.size >= limit) break;
  }

  return Array.from(walletMap.values());
}

interface OutgoingTransfer {
  to: string;
  amount: number;
  timestamp: number;
}

function extractOutgoingSolTransfers(
  txs: HeliusEnhancedTransaction[],
  senderAddress: string
): OutgoingTransfer[] {
  const transfers: OutgoingTransfer[] = [];

  for (const tx of txs) {
    if (!tx.nativeTransfers) continue;

    for (const nt of tx.nativeTransfers) {
      if (
        nt.fromUserAccount === senderAddress &&
        nt.toUserAccount !== senderAddress &&
        nt.amount > 0
      ) {
        transfers.push({
          to: nt.toUserAccount,
          amount: nt.amount / LAMPORTS_PER_SOL,
          timestamp: tx.timestamp,
        });
      }
    }
  }

  transfers.sort((a, b) => a.timestamp - b.timestamp);
  return transfers;
}
