import { runWithConcurrency } from '@/lib/analysis/async-pool';
import { type DiscoveredBuyer } from '@/lib/analysis/discover-buyers';
import { isKnownExchange } from '@/lib/helius/exchange-addresses';
import {
  getEnhancedTransactionsByAddress,
  type HeliusEnhancedTransaction,
} from '@/lib/helius/client';
import { getTokenBuyers } from '@/lib/helius/token-buyers';

interface TokenInput {
  address: string;
  name: string | null;
}

interface DiscoverRuggerTokensOpts {
  maxPages?: number;
}

type ProgressCallback = (current: number, total: number) => void;

interface ValidateTokensOpts {
  buyerLimit?: number;
  overlapPercent?: number;
  minTokenPerWallet?: number;
  concurrency?: number;
  excludeWallets?: string[];
  onProgress?: ProgressCallback;
}

export interface TokenValidationStats {
  candidateCount: number;
  validatedCount: number;
  discardedCount: number;
  multiTokenWalletCount: number;
}

export interface TokenValidationResult {
  validatedTokens: TokenInput[];
  buyers: DiscoveredBuyer[];
  stats: TokenValidationStats;
}

const IGNORED_MINTS = new Set([
  'So11111111111111111111111111111111111111112',  // Wrapped SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '11111111111111111111111111111111',               // System Program (native SOL)
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  // JUP
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // WETH (Wormhole)
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',  // bSOL
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
  'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',  // RNDR
]);

const DEFAULT_DISCOVERY_MAX_PAGES = Number(process.env.RUGGER_TOKEN_DISCOVERY_MAX_PAGES ?? '20');
const DEFAULT_OVERLAP_PERCENT = Number(process.env.CROSS_VALIDATION_MIN_OVERLAP_PERCENT ?? '10');
const DEFAULT_MIN_TOKEN_PER_WALLET = Number(process.env.CROSS_VALIDATION_MIN_TOKEN_PER_WALLET ?? '2');
const DEFAULT_CONCURRENCY = Number(process.env.ANALYSIS_CONCURRENCY ?? '3');

export async function discoverRuggerTokens(
  ruggerWallet: string,
  registeredTokens: TokenInput[],
  opts?: DiscoverRuggerTokensOpts
): Promise<TokenInput[]> {
  const maxPages = Math.max(1, opts?.maxPages ?? DEFAULT_DISCOVERY_MAX_PAGES);
  const walletLc = ruggerWallet.toLowerCase();
  const byAddress = new Map<string, TokenInput>();

  for (const token of registeredTokens) {
    byAddress.set(token.address, token);
  }

  let before: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const txs = await getEnhancedTransactionsByAddress(ruggerWallet, { before, type: 'SWAP' });
    if (txs.length === 0) break;

    for (const tx of txs) {
      collectTokenMintCandidates(tx, walletLc, byAddress);
    }

    before = txs[txs.length - 1]?.signature;
    if (!before || txs.length < 100) break;
  }

  return Array.from(byAddress.values());
}

function collectTokenMintCandidates(
  tx: HeliusEnhancedTransaction,
  walletLc: string,
  out: Map<string, TokenInput>
): void {
  for (const transfer of tx.tokenTransfers ?? []) {
    const fromLc = transfer.fromUserAccount?.toLowerCase();
    const toLc = transfer.toUserAccount?.toLowerCase();
    if (fromLc !== walletLc && toLc !== walletLc) continue;
    if (!transfer.mint || transfer.mint === '' || IGNORED_MINTS.has(transfer.mint)) continue;
    if (!out.has(transfer.mint)) out.set(transfer.mint, { address: transfer.mint, name: null });
  }

  const swap = tx.events?.swap;
  if (!swap) return;
  const collectSwapLeg = (legs: { userAccount: string; mint: string }[] | undefined) => {
    if (!legs) return;
    for (const leg of legs) {
      if (leg.userAccount?.toLowerCase() !== walletLc) continue;
      if (!leg.mint || leg.mint === '' || IGNORED_MINTS.has(leg.mint)) continue;
      if (!out.has(leg.mint)) out.set(leg.mint, { address: leg.mint, name: null });
    }
  };
  collectSwapLeg(swap.tokenInputs);
  collectSwapLeg(swap.tokenOutputs);
}

export async function validateTokensByCrossReference(
  allCandidates: TokenInput[],
  registeredAddresses: Set<string>,
  opts?: ValidateTokensOpts
): Promise<TokenValidationResult> {
  const buyerLimit = Math.max(1, opts?.buyerLimit ?? 200);
  const overlapPercent = Math.max(0, opts?.overlapPercent ?? DEFAULT_OVERLAP_PERCENT);
  const minTokenPerWallet = Math.max(1, opts?.minTokenPerWallet ?? DEFAULT_MIN_TOKEN_PER_WALLET);
  const concurrency = Math.max(1, opts?.concurrency ?? DEFAULT_CONCURRENCY);
  const excludeSet = new Set((opts?.excludeWallets ?? []).map((wallet) => wallet.toLowerCase()));

  let completed = 0;
  const total = allCandidates.length;
  const tokenBuyerRows = await runWithConcurrency(allCandidates, concurrency, async (token) => {
    const buyers = await getTokenBuyers(token.address, { buyerLimit });
    completed += 1;
    opts?.onProgress?.(completed, total);
    return { token, buyers };
  });

  const buyersByToken = new Map<string, DiscoveredBuyer[]>();
  const walletTokens = new Map<string, Set<string>>();

  for (const row of tokenBuyerRows) {
    const normalized: DiscoveredBuyer[] = [];
    for (const buyer of row.buyers) {
      const walletKey = buyer.walletAddress.toLowerCase();
      if (excludeSet.has(walletKey) || isKnownExchange(buyer.walletAddress)) continue;

      normalized.push({
        walletAddress: buyer.walletAddress,
        tokensBought: 1,
        totalTokens: allCandidates.length,
        coveragePercent: 0,
        purchases: [{ ...buyer, tokenName: row.token.name }],
      });

      const existing = walletTokens.get(walletKey);
      if (existing) existing.add(row.token.address);
      else walletTokens.set(walletKey, new Set([row.token.address]));
    }
    buyersByToken.set(row.token.address, normalized);
  }

  const multiTokenWallets = new Set(
    Array.from(walletTokens.entries())
      .filter(([, tokens]) => tokens.size >= minTokenPerWallet)
      .map(([wallet]) => wallet)
  );

  const overlapThreshold = Math.max(1, Math.ceil(multiTokenWallets.size * (overlapPercent / 100)));
  const validatedAddresses = new Set<string>(registeredAddresses);

  for (const token of allCandidates) {
    if (validatedAddresses.has(token.address)) continue;
    const buyers = buyersByToken.get(token.address) ?? [];
    const overlap = buyers.reduce((count, buyer) => {
      return count + (multiTokenWallets.has(buyer.walletAddress.toLowerCase()) ? 1 : 0);
    }, 0);
    if (overlap >= overlapThreshold) validatedAddresses.add(token.address);
  }

  const validatedTokens = allCandidates.filter((token) => validatedAddresses.has(token.address));
  const validatedBuyers = mergeBuyersAcrossTokens(
    validatedTokens,
    buyersByToken,
    validatedTokens.length
  );

  return {
    validatedTokens,
    buyers: validatedBuyers,
    stats: {
      candidateCount: allCandidates.length,
      validatedCount: validatedTokens.length,
      discardedCount: Math.max(0, allCandidates.length - validatedTokens.length),
      multiTokenWalletCount: multiTokenWallets.size,
    },
  };
}

function mergeBuyersAcrossTokens(
  validatedTokens: TokenInput[],
  buyersByToken: Map<string, DiscoveredBuyer[]>,
  totalValidatedTokens: number
): DiscoveredBuyer[] {
  const merged = new Map<string, DiscoveredBuyer>();

  for (const token of validatedTokens) {
    const buyers = buyersByToken.get(token.address) ?? [];
    for (const buyer of buyers) {
      const existing = merged.get(buyer.walletAddress);
      if (!existing) {
        merged.set(buyer.walletAddress, {
          walletAddress: buyer.walletAddress,
          tokensBought: 1,
          totalTokens: totalValidatedTokens,
          coveragePercent: 0,
          purchases: [...buyer.purchases],
        });
        continue;
      }

      const knownTokenAddresses = new Set(
        existing.purchases.map((purchase) => purchase.tokenAddress)
      );
      for (const purchase of buyer.purchases) {
        if (knownTokenAddresses.has(purchase.tokenAddress)) continue;
        existing.purchases.push(purchase);
        knownTokenAddresses.add(purchase.tokenAddress);
      }
      existing.tokensBought = existing.purchases.length;
    }
  }

  const buyers = Array.from(merged.values());
  for (const buyer of buyers) {
    buyer.coveragePercent =
      buyer.totalTokens > 0 ? (buyer.tokensBought / buyer.totalTokens) * 100 : 0;
  }
  buyers.sort((a, b) => b.tokensBought - a.tokensBought || b.coveragePercent - a.coveragePercent);
  return buyers;
}
