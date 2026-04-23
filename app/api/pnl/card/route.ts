import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { buildPurchasePreviews, type WalletPurchasePreview } from '@/lib/gmgn/wallet-purchases';
import { fetchSolFiatSpotFromGmgn } from '@/lib/gmgn/first-buy-notional';
import { fetchWalletCreatedAt } from '@/lib/helius/wallet-created-at';
import { getWalletMetadataForUser, upsertWalletMetadata } from '@/lib/repositories/wallet-metadata';

interface PnlCardRequestBody {
  walletAddresses?: unknown;
  fromMs?: unknown;
  toMs?: unknown;
}

function normalizeWallets(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (value === '') continue;
    set.add(value);
  }
  return Array.from(set);
}

function mergeByMintEarliest(rows: WalletPurchasePreview[]): WalletPurchasePreview[] {
  const byMint = new Map<string, WalletPurchasePreview>();
  for (const row of rows) {
    const mint = row.tokenAddress.trim();
    const previous = byMint.get(mint);
    if (!previous) {
      byMint.set(mint, row);
      continue;
    }
    const tNew = new Date(row.purchasedAt).getTime();
    const tOld = new Date(previous.purchasedAt).getTime();
    if (tNew < tOld) byMint.set(mint, row);
  }
  return Array.from(byMint.values());
}

function tokenPnlPercent(token: WalletPurchasePreview): number {
  if (!Number.isFinite(token.entryPrice) || token.entryPrice <= 0) return 0;
  const gain = ((token.high - token.entryPrice) / token.entryPrice) * 100;
  if (gain > 0) return gain;
  return ((token.low - token.entryPrice) / token.entryPrice) * 100;
}

function tokenInvestedUsd(token: WalletPurchasePreview): number {
  const usd = typeof token.spentUsd === 'number' && Number.isFinite(token.spentUsd) ? token.spentUsd : null;
  if (usd !== null && usd > 0) return usd;
  return 0;
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  let body: PnlCardRequestBody;
  try {
    body = (await request.json()) as PnlCardRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const walletAddresses = normalizeWallets(body.walletAddresses);
  const fromMs = typeof body.fromMs === 'number' && Number.isFinite(body.fromMs) ? body.fromMs : NaN;
  const toMs = typeof body.toMs === 'number' && Number.isFinite(body.toMs) ? body.toMs : NaN;

  if (walletAddresses.length === 0) return NextResponse.json({ error: 'walletAddresses is required' }, { status: 400 });
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    return NextResponse.json({ error: 'fromMs and toMs must be valid with fromMs <= toMs' }, { status: 400 });
  }

  try {
    const allRows: WalletPurchasePreview[] = [];
    for (const wallet of walletAddresses) {
      const rows = await buildPurchasePreviews(wallet, fromMs, toMs);
      for (const row of rows) allRows.push(row);
    }

    const merged = mergeByMintEarliest(allRows);
    const tokens = merged.length;

    let totalPnlUsd = 0;
    let volumeUsd = 0;
    let winners = 0;
    let sells = 0;
    let tokensWithNotional = 0;
    for (const token of merged) {
      const pnlPercent = tokenPnlPercent(token);
      const investedUsd = tokenInvestedUsd(token);
      if (investedUsd > 0) {
        totalPnlUsd += investedUsd * (pnlPercent / 100);
        volumeUsd += investedUsd;
        tokensWithNotional += 1;
      }
      if (pnlPercent > 0) {
        winners += 1;
        sells += 1;
      }
    }

    const totalPnlPercent = volumeUsd > 0 ? (totalPnlUsd / volumeUsd) * 100 : 0;
    const winRate = tokens > 0 ? (winners / tokens) * 100 : 0;

    const { usdPerSol } = await fetchSolFiatSpotFromGmgn();
    const totalPnlSol = usdPerSol > 0 ? totalPnlUsd / usdPerSol : 0;

    const existingMetadata = await getWalletMetadataForUser(userId, walletAddresses);
    const creationByWallet = new Map<string, string | null>();
    for (const item of existingMetadata) {
      creationByWallet.set(item.wallet_address, item.created_at);
    }
    for (const wallet of walletAddresses) {
      if (creationByWallet.has(wallet)) continue;
      const createdAt = await fetchWalletCreatedAt(wallet);
      await upsertWalletMetadata({
        userId,
        walletAddress: wallet,
        createdAt,
        creationSource: 'helius_first_tx',
      });
      creationByWallet.set(wallet, createdAt ? createdAt.toISOString() : null);
    }

    const oldestCreatedAt = Array.from(creationByWallet.values())
      .filter((v): v is string => typeof v === 'string' && v !== '')
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;

    return NextResponse.json({
      fromMs,
      toMs,
      selectedWallets: walletAddresses,
      metrics: {
        totalPnlUsd,
        totalPnlPercent,
        totalPnlSol,
        sells,
        tokens,
        tokensWithNotional,
        winRate,
        volumeUsd,
        walletCreatedAt: oldestCreatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate pnl card';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

