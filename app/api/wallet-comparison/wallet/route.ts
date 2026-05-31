import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { buildPurchasePreviews } from '@/lib/gmgn/wallet-purchases';
import { mergeWalletPreviewsToBestBuyPerMint, type BestBuyPerMint } from '@/lib/gmgn/merge-best-buy-per-mint';

export const maxDuration = 60;

const DEFAULT_RANGE_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Calcule les meilleurs achats par mint pour UN wallet (pilotage côté client).
 * Découpe la comparaison multi-wallets en appels courts (<60 s) → compatible Hobby.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    walletAddress?: string;
    fromMs?: number;
    toMs?: number;
  };

  const walletAddress = typeof body.walletAddress === 'string' ? body.walletAddress.trim() : '';
  if (walletAddress === '') {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }
  const now = Date.now();
  const fromMs = Number.isFinite(body.fromMs) ? Number(body.fromMs) : now - DEFAULT_RANGE_MS;
  const toMs = Number.isFinite(body.toMs) ? Number(body.toMs) : now;
  if (fromMs > toMs) {
    return NextResponse.json({ error: 'fromMs must be <= toMs' }, { status: 400 });
  }

  try {
    const previews = await buildPurchasePreviews(walletAddress, fromMs, toMs);
    const map: BestBuyPerMint[] = Array.from(mergeWalletPreviewsToBestBuyPerMint(previews).values());
    return NextResponse.json({ ok: true, walletAddress, map });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, walletAddress, error });
  }
}
