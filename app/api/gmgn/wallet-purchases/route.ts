import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import {
  buildPurchasePreviews,
  type WalletPurchasePreview,
} from '@/lib/gmgn/wallet-purchases';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

const MAX_WALLETS = 20;

function normalizeWalletList(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const a = typeof raw === 'string' ? raw.trim() : '';
    if (a === '' || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

function mergeMultiWalletPurchases(rows: WalletPurchasePreview[]): WalletPurchasePreview[] {
  const byMint = new Map<string, WalletPurchasePreview>();
  for (const p of rows) {
    const mint = p.tokenAddress.trim();
    const prev = byMint.get(mint);
    if (!prev) {
      byMint.set(mint, p);
      continue;
    }
    const tNew = new Date(p.purchasedAt).getTime();
    const tOld = new Date(prev.purchasedAt).getTime();
    if (tNew < tOld) byMint.set(mint, p);
  }
  return [...byMint.values()].sort(
    (a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime()
  );
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
    walletAddresses?: unknown;
    fromMs?: unknown;
    toMs?: unknown;
    /** Si true, renvoie debugLog (lignes texte du traitement klines / arrondis). */
    debug?: unknown;
  };

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

  let walletList: string[];
  if (Array.isArray(b.walletAddresses) && b.walletAddresses.length > 0) {
    const raw = b.walletAddresses.filter((x): x is string => typeof x === 'string');
    walletList = normalizeWalletList(raw);
    if (walletList.length === 0) {
      return NextResponse.json({ error: 'walletAddresses must contain at least one non-empty address' }, { status: 400 });
    }
    if (walletList.length > MAX_WALLETS) {
      return NextResponse.json(
        { error: `Too many wallets (max ${MAX_WALLETS})` },
        { status: 400 }
      );
    }
  } else if (isNonEmptyString(b.walletAddress)) {
    walletList = [b.walletAddress.trim()];
  } else {
    return NextResponse.json(
      { error: 'walletAddress or walletAddresses is required' },
      { status: 400 }
    );
  }

  try {
    let purchases: WalletPurchasePreview[];

    if (walletList.length === 1) {
      purchases = await buildPurchasePreviews(walletList[0], fromMs, toMs, { debugLog });
    } else {
      const merged: WalletPurchasePreview[] = [];
      for (const addr of walletList) {
        const batch = await buildPurchasePreviews(addr, fromMs, toMs, { debugLog });
        for (const p of batch) {
          merged.push({ ...p, sourceWallet: addr });
        }
      }
      merged.sort(
        (a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime()
      );
      purchases = mergeMultiWalletPurchases(merged);
    }

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
