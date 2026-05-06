import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { resolvePumpMayhemWithCache } from '@/lib/gmgn/pump-mayhem-cache';
import { telegramMayhemMintResolveCap } from '@/lib/rugger-telegram/mayhem-cap';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Body = {
  mints?: unknown;
};

/** Déduplication en gardant l’ordre du classement ; max `cap` mints traités. */
function mintsDedupOrdered(input: unknown, cap: number): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const m = typeof raw === 'string' ? raw.trim() : '';
    if (m === '' || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= cap) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const cap = telegramMayhemMintResolveCap();
  const listLen = Array.isArray(body.mints) ? body.mints.length : 0;
  const capped = listLen > cap;
  const ordered = mintsDedupOrdered(body.mints, cap);

  if (!process.env.GMGN_API_KEY?.trim()) {
    return NextResponse.json({
      skippedNoApiKey: true,
      checked: 0,
      excluded: 0,
      capped: false,
      cap,
      mayhemCacheHits: 0,
      mayhemGmgnCalls: 0,
      mayhemByMint: {},
    });
  }

  const mayhemByMint: Record<string, boolean> = {};
  let mayhemCacheHits = 0;
  let mayhemGmgnCalls = 0;

  for (const mint of ordered) {
    const r = await resolvePumpMayhemWithCache(mint);
    mayhemByMint[mint] = r.isPumpMayhem;
    if (r.cacheHit) mayhemCacheHits += 1;
    if (r.gmgnFetched) mayhemGmgnCalls += 1;
  }

  const excluded = ordered.filter((mint) => mayhemByMint[mint]).length;

  return NextResponse.json({
    skippedNoApiKey: false,
    checked: ordered.length,
    excluded,
    capped,
    cap,
    mayhemCacheHits,
    mayhemGmgnCalls,
    mayhemByMint,
  });
}
