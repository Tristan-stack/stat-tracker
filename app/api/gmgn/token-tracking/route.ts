import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { buildTokenTrackingPreviews } from '@/lib/gmgn/token-tracking';

const MAX_TOKENS = 30;

function normalizeTokenList(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const a = raw.trim();
    if (a === '' || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
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
    tokenAddress?: unknown;
    tokenAddresses?: unknown;
    fromMs?: unknown;
    toMs?: unknown;
  };

  const fromMs = typeof b.fromMs === 'number' && Number.isFinite(b.fromMs) ? b.fromMs : NaN;
  const toMs = typeof b.toMs === 'number' && Number.isFinite(b.toMs) ? b.toMs : NaN;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    return NextResponse.json(
      { error: 'fromMs and toMs must be finite numbers with fromMs <= toMs' },
      { status: 400 }
    );
  }

  const maxSpan = 366 * 86400000;
  if (toMs - fromMs > maxSpan) {
    return NextResponse.json({ error: 'Date range too large' }, { status: 400 });
  }

  let tokenList: string[] = [];
  if (Array.isArray(b.tokenAddresses) && b.tokenAddresses.length > 0) {
    tokenList = normalizeTokenList(
      b.tokenAddresses.filter((x): x is string => typeof x === 'string')
    );
  } else if (typeof b.tokenAddress === 'string' && b.tokenAddress.trim() !== '') {
    tokenList = [b.tokenAddress.trim()];
  }

  if (tokenList.length === 0) {
    return NextResponse.json(
      { error: 'tokenAddress or tokenAddresses is required' },
      { status: 400 }
    );
  }
  if (tokenList.length > MAX_TOKENS) {
    return NextResponse.json({ error: `Too many tokens (max ${MAX_TOKENS})` }, { status: 400 });
  }

  try {
    const purchases = await buildTokenTrackingPreviews(tokenList, fromMs, toMs);
    return NextResponse.json({ purchases });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'GMGN request failed';
    const status =
      /HTTP 401\b/.test(message)
        ? 401
        : /HTTP 403\b/.test(message)
          ? 403
          : /HTTP 429\b/.test(message)
            ? 429
            : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
