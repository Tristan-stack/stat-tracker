import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { badRequest, notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { listBuyers } from '@/features/ruggers/buyers-repository';
import {
  getExistingTokenMints,
  getRuggerStatusId,
  bulkInsertTokens,
} from '@/features/ruggers/tokens-repository';
import { mergeWalletPreviewsToBestBuyPerMint, type BestBuyPerMint } from '@/lib/gmgn/merge-best-buy-per-mint';
import { buildPurchasePreviews } from '@/lib/gmgn/wallet-purchases';
import type { Token } from '@/types/token';

type Ctx = { params: Promise<{ id: string }> };
type AggregatedPreview = BestBuyPerMint;
interface WalletRankRow {
  walletAddress: string;
  tokenCount: number;
  coveragePercent: number;
}

export const POST = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');

  const body = await parseBody(req, z.object({ fromMs: z.number().optional(), toMs: z.number().optional() }));
  const now = Date.now();
  const fromMs = body.fromMs ?? now - 180 * 24 * 60 * 60 * 1000;
  const toMs = body.toMs ?? now;
  if (fromMs > toMs) throw badRequest('fromMs must be <= toMs');

  const buyerWallets = (await listBuyers(ruggerId)).map((b) => b.walletAddress.trim()).filter(Boolean);
  if (buyerWallets.length === 0) {
    return ok({ insertedCount: 0, skippedExistingCount: 0, sourceWalletCount: 0, processedTokenCount: 0 });
  }

  const walletTokenMaps = new Map<string, Map<string, AggregatedPreview>>();
  const allMints = new Set<string>();
  for (const walletAddress of buyerWallets) {
    const tokenMap = mergeWalletPreviewsToBestBuyPerMint(await buildPurchasePreviews(walletAddress, fromMs, toMs));
    if (tokenMap.size > 0) {
      walletTokenMaps.set(walletAddress, tokenMap);
      for (const mint of tokenMap.keys()) allMints.add(mint);
    }
  }

  const emptyRanking: WalletRankRow[] = [];
  const emptySelection: Array<{ walletAddress: string; selectedTokenCount: number }> = [];

  if (allMints.size === 0) {
    return ok({
      insertedCount: 0,
      skippedExistingCount: 0,
      sourceWalletCount: buyerWallets.length,
      processedTokenCount: 0,
      strategy: 'coverage_then_best_entry',
      walletRanking: emptyRanking,
      selectionStats: emptySelection,
    });
  }

  const walletRanking: WalletRankRow[] = [...walletTokenMaps.entries()]
    .map(([walletAddress, tokenMap]) => ({
      walletAddress,
      tokenCount: tokenMap.size,
      coveragePercent: (tokenMap.size / allMints.size) * 100,
    }))
    .sort(
      (a, b) =>
        b.coveragePercent - a.coveragePercent ||
        b.tokenCount - a.tokenCount ||
        a.walletAddress.localeCompare(b.walletAddress)
    );

  const aggregatedByMint = new Map<string, AggregatedPreview & { sourceWallet: string }>();
  for (const mint of allMints) {
    for (const ranked of walletRanking) {
      const token = walletTokenMaps.get(ranked.walletAddress)?.get(mint);
      if (!token) continue;
      aggregatedByMint.set(mint, { ...token, sourceWallet: ranked.walletAddress });
      break;
    }
  }

  const existingMints = await getExistingTokenMints(ruggerId);
  const toInsert = [...aggregatedByMint.values()].filter((t) => !existingMints.has(t.tokenAddress));

  const selectionStatsMap = new Map<string, number>();
  for (const token of aggregatedByMint.values()) {
    selectionStatsMap.set(token.sourceWallet, (selectionStatsMap.get(token.sourceWallet) ?? 0) + 1);
  }
  const selectionStats = [...selectionStatsMap.entries()]
    .map(([walletAddress, selectedTokenCount]) => ({ walletAddress, selectedTokenCount }))
    .sort((a, b) => b.selectedTokenCount - a.selectedTokenCount || a.walletAddress.localeCompare(b.walletAddress));

  const skippedExistingCount = aggregatedByMint.size - toInsert.length;

  if (toInsert.length > 0) {
    const statusId = await getRuggerStatusId(ruggerId, userId);
    const tokens: Token[] = toInsert.map((token) => ({
      id: crypto.randomUUID(),
      name: token.tokenAddress,
      tokenName: token.tokenName ?? token.tokenAddress,
      entryPrice: token.entryPrice > 0 ? token.entryPrice : 1e-12,
      high: token.high > 0 ? token.high : 1e-12,
      low: token.low > 0 ? token.low : 1e-12,
      targetExitPercent: 100,
      purchasedAt: new Date(token.purchasedAt).toISOString(),
      tokenAddress: token.tokenAddress,
      entryToLowMinutes: null,
    }));
    await bulkInsertTokens(ruggerId, statusId, tokens);
  }

  return ok({
    insertedCount: toInsert.length,
    skippedExistingCount,
    sourceWalletCount: buyerWallets.length,
    processedTokenCount: aggregatedByMint.size,
    strategy: 'coverage_then_best_entry',
    walletRanking,
    selectionStats,
  });
});
