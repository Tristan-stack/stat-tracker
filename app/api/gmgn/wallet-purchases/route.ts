import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import {
  buildPurchasePreviews,
  buildWalletPurchasePreviews,
  DEFAULT_KLINE_ENRICH_BATCH,
  type BuildWalletPurchasePreviewsMeta,
  type WalletPurchasePreview,
} from '@/lib/gmgn/wallet-purchases';

export const maxDuration = 60;

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

function parseOptionalPositiveInt(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) return undefined;
  return Math.floor(v);
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
    debug?: unknown;
    klineEnrichTotalCap?: unknown;
    klineEnrichOffset?: unknown;
    klineEnrichBatchSize?: unknown;
    klineSliceOnly?: unknown;
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

  const klineSliceOnly = b.klineSliceOnly === true;
  const userCap = parseOptionalPositiveInt(b.klineEnrichTotalCap);
  const klineOffset =
    typeof b.klineEnrichOffset === 'number' && Number.isFinite(b.klineEnrichOffset) && b.klineEnrichOffset >= 0
      ? Math.floor(b.klineEnrichOffset)
      : 0;
  const klineBatchSize =
    typeof b.klineEnrichBatchSize === 'number' &&
    Number.isFinite(b.klineEnrichBatchSize) &&
    b.klineEnrichBatchSize >= 1
      ? Math.min(Math.floor(b.klineEnrichBatchSize), 500)
      : DEFAULT_KLINE_ENRICH_BATCH;

  if (klineSliceOnly && walletList.length !== 1) {
    return NextResponse.json(
      { error: 'klineSliceOnly is only supported for a single walletAddress' },
      { status: 400 }
    );
  }

  if (klineSliceOnly && userCap === undefined) {
    return NextResponse.json({ error: 'klineEnrichTotalCap is required when klineSliceOnly is true' }, { status: 400 });
  }

  try {
    const useBatchedKlines = walletList.length === 1 && userCap !== undefined;

    if (!useBatchedKlines) {
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
      const payload: {
        purchases: typeof purchases;
        debugLog?: string[];
        meta?: BuildWalletPurchasePreviewsMeta;
      } = { purchases };
      if (debug && debugLog !== undefined) payload.debugLog = debugLog;
      return NextResponse.json(payload);
    }

    const wallet = walletList[0];
    const result = await buildWalletPurchasePreviews(wallet, fromMs, toMs, {
      debugLog,
      klineEnrichTotalCap: userCap,
      klineEnrichOffset: klineOffset,
      klineEnrichBatchSize: klineBatchSize,
      klineSliceOnly,
    });

    const payload: {
      purchases: WalletPurchasePreview[];
      purchasePatches?: WalletPurchasePreview[];
      meta?: BuildWalletPurchasePreviewsMeta;
      debugLog?: string[];
    } = {
      purchases: result.purchases,
      purchasePatches: result.purchasePatches,
      meta: result.meta,
    };
    if (debug && debugLog !== undefined) payload.debugLog = debugLog;
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'GMGN request failed';
    const status =
      /HTTP 401\b/.test(message) ? 401 : /HTTP 403\b/.test(message) ? 403 : /HTTP 429\b/.test(message) ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
