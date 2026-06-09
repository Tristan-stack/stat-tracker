import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { fetchSolFiatSpotFromGmgn } from '@/lib/gmgn/first-buy-notional';

/**
 * Cours spot SOL (USD + EUR) : USD prioritaire Helius DAS, complété GMGN / cross EUR.
 */
export const GET = withAuth(async () => {
  try {
    const { usdPerSol, eurPerSol } = await fetchSolFiatSpotFromGmgn();
    return ok({ source: 'helius-gmgn', usdPerSol, eurPerSol });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'GMGN failed';
    return NextResponse.json({ error: msg.slice(0, 240), usdPerSol: null, eurPerSol: null }, { status: 502 });
  }
});
