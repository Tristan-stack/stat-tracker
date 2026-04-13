import type { TokenBuyer } from '@/types/analysis';
import {
  getSignaturesForAddress,
  parseTransactions,
  LAMPORTS_PER_SOL,
  type HeliusEnhancedTransaction,
  type SignatureInfo,
} from '@/lib/helius/client';

const DEFAULT_BUYER_LIMIT = 200;
const PUMPFUN_SOURCE = 'PUMP_FUN';

interface GetTokenBuyersOpts {
  buyerLimit?: number;
  beforeSignature?: string;
}

/**
 * Find the top N earliest buyers of a specific token via Helius.
 *
 * 1. Paginate `getSignaturesForAddress(tokenMint)` to collect tx signatures
 * 2. Batch-parse them via `POST /v0/transactions`
 * 3. Filter for SWAP events where the token appears in outputs
 * 4. Extract unique buyer wallets with purchase metadata
 * 5. Stop once `buyerLimit` unique buyers are found
 */
export async function getTokenBuyers(
  tokenMint: string,
  opts?: GetTokenBuyersOpts
): Promise<TokenBuyer[]> {
  const limit = opts?.buyerLimit ?? DEFAULT_BUYER_LIMIT;
  const seenWallets = new Map<string, TokenBuyer>();
  let beforeSig = opts?.beforeSignature;

  while (seenWallets.size < limit) {
    const sigs: SignatureInfo[] = await getSignaturesForAddress(tokenMint, {
      limit: 1000,
      before: beforeSig,
    });

    if (sigs.length === 0) break;

    const signatures = sigs
      .filter((s) => !s.err)
      .map((s) => s.signature);

    if (signatures.length > 0) {
      const txs = await parseTransactions(signatures);
      extractBuyers(txs, tokenMint, seenWallets, limit);
    }

    if (seenWallets.size >= limit) break;

    beforeSig = sigs[sigs.length - 1].signature;

    if (sigs.length < 1000) break;
  }

  return Array.from(seenWallets.values()).slice(0, limit);
}

function extractBuyers(
  txs: HeliusEnhancedTransaction[],
  tokenMint: string,
  seen: Map<string, TokenBuyer>,
  limit: number
): void {
  for (const tx of txs) {
    if (seen.size >= limit) return;

    if (!isPumpfunSwap(tx)) continue;

    const buyer = extractBuyerFromSwap(tx, tokenMint);
    if (!buyer) continue;

    if (!seen.has(buyer.walletAddress)) {
      seen.set(buyer.walletAddress, buyer);
    }
  }
}

function isPumpfunSwap(tx: HeliusEnhancedTransaction): boolean {
  return tx.source === PUMPFUN_SOURCE || (tx.type === 'SWAP' && tx.source === PUMPFUN_SOURCE);
}

function extractBuyerFromSwap(
  tx: HeliusEnhancedTransaction,
  tokenMint: string
): TokenBuyer | null {
  const swap = tx.events?.swap;

  if (swap) {
    const boughtToken = swap.tokenOutputs?.find((o) => o.mint === tokenMint);
    if (boughtToken) {
      const solSpent = swap.nativeInput
        ? Number(swap.nativeInput.amount) / LAMPORTS_PER_SOL
        : null;

      return {
        walletAddress: boughtToken.userAccount,
        tokenAddress: tokenMint,
        tokenName: null,
        purchasedAt: new Date(tx.timestamp * 1000).toISOString(),
        amountSol: solSpent,
      };
    }
  }

  const tokenTransfer = tx.tokenTransfers?.find(
    (t) => t.mint === tokenMint && t.tokenAmount > 0 && t.toUserAccount
  );
  if (tokenTransfer && tx.source === PUMPFUN_SOURCE) {
    return {
      walletAddress: tokenTransfer.toUserAccount,
      tokenAddress: tokenMint,
      tokenName: null,
      purchasedAt: new Date(tx.timestamp * 1000).toISOString(),
      amountSol: null,
    };
  }

  return null;
}
