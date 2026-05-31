import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { computeBestEntryOnCommonMints } from '@/lib/wallet-comparison/best-entry-on-common-mints';
import type { BestBuyPerMint } from '@/lib/gmgn/merge-best-buy-per-mint';

export const maxDuration = 60;

interface WalletMapInput {
  walletAddress: string;
  map: BestBuyPerMint[];
}

/**
 * Agrège la comparaison à partir des maps déjà calculées côté client (un appel /wallet par wallet).
 * Calcul pur (pas d'I/O externe) → rapide.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    wallets?: WalletMapInput[];
    skipped?: Array<{ walletAddress: string; error: string }>;
    fromMs?: number;
    toMs?: number;
  };

  const walletsInput = Array.isArray(body.wallets) ? body.wallets : [];
  const orderedOk: string[] = [];
  const walletMaps = new Map<string, Map<string, BestBuyPerMint>>();

  for (const entry of walletsInput) {
    const addr = typeof entry?.walletAddress === 'string' ? entry.walletAddress.trim() : '';
    if (addr === '' || walletMaps.has(addr) || !Array.isArray(entry.map)) continue;
    const mintMap = new Map<string, BestBuyPerMint>();
    for (const b of entry.map) {
      if (b && typeof b.tokenAddress === 'string' && b.tokenAddress.trim() !== '') {
        mintMap.set(b.tokenAddress.trim(), b);
      }
    }
    orderedOk.push(addr);
    walletMaps.set(addr, mintMap);
  }

  if (orderedOk.length < 2) {
    return NextResponse.json(
      { error: 'Pas assez de wallets exploitables après les appels GMGN.', partialFailures: body.skipped ?? [] },
      { status: 422 }
    );
  }

  const now = Date.now();
  const fromMs = Number.isFinite(body.fromMs) ? Number(body.fromMs) : now;
  const toMs = Number.isFinite(body.toMs) ? Number(body.toMs) : now;

  const computed = computeBestEntryOnCommonMints(orderedOk, walletMaps);
  return NextResponse.json({
    fromMs,
    toMs,
    walletsCompared: orderedOk,
    skippedWallets: body.skipped ?? [],
    commonMintCount: computed.commonMintCount,
    distinctMintUnionCount: computed.distinctMintUnionCount,
    globalWinnerWallets: computed.globalWinnerWallets,
    scores: computed.scores,
    perMint: computed.perMint,
  });
}
