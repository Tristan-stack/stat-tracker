import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { buildPurchasePreviews } from '@/lib/gmgn/wallet-purchases';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const b = body as {
    walletAddress?: unknown;
    fromMs?: unknown;
    toMs?: unknown;
    /** Si true, renvoie debugLog (lignes texte du traitement klines / arrondis). */
    debug?: unknown;
  };

  if (!isNonEmptyString(b.walletAddress)) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  const fromMs = typeof b.fromMs === 'number' && Number.isFinite(b.fromMs) ? b.fromMs : NaN;
  const toMs = typeof b.toMs === 'number' && Number.isFinite(b.toMs) ? b.toMs : NaN;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    return NextResponse.json({ error: 'fromMs and toMs must be finite numbers with fromMs <= toMs' }, { status: 400 });
  }

  const maxSpan = 366 * 86400000;
  if (toMs - fromMs > maxSpan) {
    return NextResponse.json({ error: 'Date range too large' }, { status: 400 });
  }

  const debug = b.debug === true;
  const debugLog: string[] | undefined = debug ? [] : undefined;

  try {
    const purchases = await buildPurchasePreviews(b.walletAddress.trim(), fromMs, toMs, { debugLog });
    const payload: { purchases: typeof purchases; debugLog?: string[] } = { purchases };
    if (debug && debugLog !== undefined) payload.debugLog = debugLog;
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'GMGN request failed';
    const status =
      /HTTP 401\b/.test(message) ? 401 : /HTTP 403\b/.test(message) ? 403 : /HTTP 429\b/.test(message) ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
