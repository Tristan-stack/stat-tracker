import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { fetchSolFiatSpotFromGmgn } from '@/lib/gmgn/first-buy-notional';

/**
 * Cours spot SOL (USD + EUR) : USD prioritaire Helius DAS, complété GMGN / cross EUR.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const { usdPerSol, eurPerSol } = await fetchSolFiatSpotFromGmgn();
    return NextResponse.json({
      source: 'helius-gmgn',
      usdPerSol,
      eurPerSol,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'GMGN failed';
    return NextResponse.json({ error: msg.slice(0, 240), usdPerSol: null, eurPerSol: null }, { status: 502 });
  }
}
