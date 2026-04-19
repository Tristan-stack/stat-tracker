import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
import { localGmgnAllTimeRange } from '@/lib/token-date-filter';
import { collectSolanaBuysInRange, rowTimestampSec, tokenMint } from '@/lib/gmgn/wallet-purchases';
import type { WalletActivityRow } from '@/lib/gmgn/client';
import {
  fetchSolUsdFromGmgn,
  mergeNotionalWithSolUsd,
  parseFirstBuyNotional,
} from '@/lib/gmgn/first-buy-notional';
import type { FirstBuyPreviewEntry } from '@/types/first-buy-preview';

/** Une seule passe GMGN `wallet_activity` : on peut demander beaucoup de mints d’un coup. */
const MAX_MINTS = 8000;

function normalizeMintList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const m = x.trim();
    if (m === '' || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= MAX_MINTS) break;
  }
  return out;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;
  const { id: ruggerId } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const b = body as { tokenAddresses?: unknown };
  const tokenAddresses = normalizeMintList(b.tokenAddresses);
  if (tokenAddresses.length === 0) {
    return NextResponse.json({ error: 'tokenAddresses must be a non-empty array of strings' }, { status: 400 });
  }

  const rows = await query<{ wallet_address: string | null; wallet_type: string }>(
    'select wallet_address, wallet_type from ruggers where id = $1 and user_id = $2',
    [ruggerId, userId]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const { wallet_address: walletAddress, wallet_type: walletType } = rows[0]!;

  if (walletType !== 'buyer') {
    return NextResponse.json({ error: 'Rugger wallet type must be buyer' }, { status: 400 });
  }

  const wallet = typeof walletAddress === 'string' ? walletAddress.trim() : '';
  if (wallet === '') {
    return NextResponse.json({
      byMint: {} as Record<string, FirstBuyPreviewEntry>,
      solUsd: null as number | null,
      message: 'Adresse wallet acheteur manquante',
    });
  }

  const { fromMs, toMs } = localGmgnAllTimeRange();
  let solUsd: number | null = null;
  const byMint: Record<string, FirstBuyPreviewEntry> = {};

  try {
    solUsd = await fetchSolUsdFromGmgn();
  } catch {
    solUsd = null;
  }

  let activityRows: WalletActivityRow[];
  try {
    activityRows = await collectSolanaBuysInRange(wallet, fromMs, toMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'GMGN failed';
    return NextResponse.json({ error: msg.slice(0, 240) }, { status: 502 });
  }

  const buyByMint = new Map<string, WalletActivityRow>();
  for (const row of activityRows) {
    const m = tokenMint(row);
    if (!m) continue;
    buyByMint.set(m.trim(), row);
  }

  for (const mint of tokenAddresses) {
    const row = buyByMint.get(mint);
    if (!row) {
      byMint[mint] = {
        usd: null,
        sol: null,
        purchasedAt: null,
        error: 'Aucun achat sur la fenêtre GMGN (~366 j)',
      };
      continue;
    }
    const parsed = parseFirstBuyNotional(row);
    const merged = mergeNotionalWithSolUsd(parsed, solUsd);
    const ts = rowTimestampSec(row);
    const purchasedAt = ts > 0 ? new Date(ts * 1000).toISOString() : null;
    byMint[mint] = {
      usd: merged.usd,
      sol: merged.sol,
      purchasedAt,
    };
  }

  return NextResponse.json({ byMint, solUsd });
}
