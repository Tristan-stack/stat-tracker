import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { mergeWalletPreviewsToBestBuyPerMint, type BestBuyPerMint } from '@/lib/gmgn/merge-best-buy-per-mint';
import { buildPurchasePreviews } from '@/lib/gmgn/wallet-purchases';
import type { StatusId } from '@/types/rugger';

interface BuyerWalletRow {
  wallet_address: string;
}

interface RuggerStatusRow {
  status_id: StatusId;
}

interface ExistingTokenRow {
  token_address: string | null;
  name: string;
}

type AggregatedPreview = BestBuyPerMint;

interface WalletRankRow {
  walletAddress: string;
  tokenCount: number;
  coveragePercent: number;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { fromMs?: number; toMs?: number };
  const now = Date.now();
  const fromMs =
    typeof body.fromMs === 'number' && Number.isFinite(body.fromMs)
      ? body.fromMs
      : now - 180 * 24 * 60 * 60 * 1000;
  const toMs = typeof body.toMs === 'number' && Number.isFinite(body.toMs) ? body.toMs : now;
  if (fromMs > toMs) {
    return NextResponse.json({ error: 'fromMs must be <= toMs' }, { status: 400 });
  }

  const buyerRows = await query<BuyerWalletRow>(
    'SELECT wallet_address FROM rugger_buyer_wallets WHERE rugger_id = $1',
    [ruggerId]
  );
  const buyerWallets = buyerRows.map((row) => row.wallet_address.trim()).filter(Boolean);
  if (buyerWallets.length === 0) {
    return NextResponse.json({
      insertedCount: 0,
      skippedExistingCount: 0,
      sourceWalletCount: 0,
      processedTokenCount: 0,
    });
  }

  const walletTokenMaps = new Map<string, Map<string, AggregatedPreview>>();
  const allMints = new Set<string>();
  for (const walletAddress of buyerWallets) {
    const previews = await buildPurchasePreviews(walletAddress, fromMs, toMs);
    const tokenMap = mergeWalletPreviewsToBestBuyPerMint(previews);
    if (tokenMap.size > 0) {
      walletTokenMaps.set(walletAddress, tokenMap);
      for (const mint of tokenMap.keys()) allMints.add(mint);
    }
  }

  if (allMints.size === 0) {
    return NextResponse.json({
      insertedCount: 0,
      skippedExistingCount: 0,
      sourceWalletCount: buyerWallets.length,
      processedTokenCount: 0,
      strategy: 'coverage_then_best_entry',
      walletRanking: [] as WalletRankRow[],
      selectionStats: [] as Array<{ walletAddress: string; selectedTokenCount: number }>,
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

  const existingTokenRows = await query<ExistingTokenRow>(
    'SELECT token_address, name FROM rugger_tokens WHERE rugger_id = $1',
    [ruggerId]
  );
  const existingMints = new Set<string>();
  for (const row of existingTokenRows) {
    const mint = row.token_address?.trim() || row.name.trim();
    if (mint !== '') existingMints.add(mint);
  }

  const toInsert = [...aggregatedByMint.values()].filter((token) => !existingMints.has(token.tokenAddress));
  const selectionStatsMap = new Map<string, number>();
  for (const token of aggregatedByMint.values()) {
    selectionStatsMap.set(token.sourceWallet, (selectionStatsMap.get(token.sourceWallet) ?? 0) + 1);
  }
  const selectionStats = [...selectionStatsMap.entries()]
    .map(([walletAddress, selectedTokenCount]) => ({ walletAddress, selectedTokenCount }))
    .sort((a, b) => b.selectedTokenCount - a.selectedTokenCount || a.walletAddress.localeCompare(b.walletAddress));
  const skippedExistingCount = aggregatedByMint.size - toInsert.length;
  if (toInsert.length === 0) {
    return NextResponse.json({
      insertedCount: 0,
      skippedExistingCount,
      sourceWalletCount: buyerWallets.length,
      processedTokenCount: aggregatedByMint.size,
      strategy: 'coverage_then_best_entry',
      walletRanking,
      selectionStats,
    });
  }

  const statusRows = await query<RuggerStatusRow>(
    'SELECT status_id FROM ruggers WHERE id = $1 AND user_id = $2',
    [ruggerId, userId]
  );
  const ruggerStatusId = statusRows[0]?.status_id ?? 'verification';

  const values: (string | number)[] = [];
  const placeholders: string[] = [];
  toInsert.forEach((token, idx) => {
    const base = idx * 11;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`
    );
    values.push(
      crypto.randomUUID(),
      ruggerId,
      token.tokenAddress,
      token.entryPrice > 0 ? token.entryPrice : 1e-12,
      token.high > 0 ? token.high : 1e-12,
      token.low > 0 ? token.low : 1e-12,
      100,
      ruggerStatusId,
      new Date(token.purchasedAt).toISOString(),
      token.tokenAddress,
      token.tokenName ?? token.tokenAddress
    );
  });

  await query(
    `INSERT INTO rugger_tokens
      (id, rugger_id, name, entry_price, high, low, target_exit_percent, status_id, purchased_at, token_address, token_name)
     VALUES ${placeholders.join(', ')}`,
    values
  );

  return NextResponse.json({
    insertedCount: toInsert.length,
    skippedExistingCount,
    sourceWalletCount: buyerWallets.length,
    processedTokenCount: aggregatedByMint.size,
    strategy: 'coverage_then_best_entry',
    walletRanking,
    selectionStats,
  });
}
