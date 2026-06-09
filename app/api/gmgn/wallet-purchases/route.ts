import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { badRequest } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import {
  buildPurchasePreviews,
  buildWalletPurchasePreviews,
  DEFAULT_KLINE_ENRICH_BATCH,
  type BuildWalletPurchasePreviewsMeta,
  type WalletPurchasePreview,
} from '@/lib/gmgn/wallet-purchases';

export const maxDuration = 60;

const MAX_WALLETS = 20;
const MAX_SPAN_MS = 366 * 86400000;

function normalizeWalletList(addresses: string[]): string[] {
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

function mergeMultiWalletPurchases(rows: WalletPurchasePreview[]): WalletPurchasePreview[] {
  const byMint = new Map<string, WalletPurchasePreview>();
  for (const p of rows) {
    const mint = p.tokenAddress.trim();
    const prev = byMint.get(mint);
    if (!prev) {
      byMint.set(mint, p);
      continue;
    }
    if (new Date(p.purchasedAt).getTime() < new Date(prev.purchasedAt).getTime()) byMint.set(mint, p);
  }
  return [...byMint.values()].sort(
    (a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime()
  );
}

function parseOptionalPositiveInt(v: number | undefined): number | undefined {
  if (v === undefined || !Number.isFinite(v) || v < 1) return undefined;
  return Math.floor(v);
}

const schema = z.object({
  walletAddress: z.string().optional(),
  walletAddresses: z.array(z.string()).optional(),
  fromMs: z.number().optional(),
  toMs: z.number().optional(),
  debug: z.boolean().optional(),
  klineEnrichTotalCap: z.number().optional(),
  klineEnrichOffset: z.number().optional(),
  klineEnrichBatchSize: z.number().optional(),
  klineSliceOnly: z.boolean().optional(),
});

export const POST = withAuth(async (req) => {
  const body = await parseBody(req, schema);

  const fromMs = body.fromMs ?? NaN;
  const toMs = body.toMs ?? NaN;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    throw badRequest('fromMs and toMs must be finite numbers with fromMs <= toMs');
  }
  if (toMs - fromMs > MAX_SPAN_MS) throw badRequest('Date range too large');

  const debug = body.debug === true;
  const debugLog: string[] | undefined = debug ? [] : undefined;

  let walletList: string[];
  if (body.walletAddresses && body.walletAddresses.length > 0) {
    walletList = normalizeWalletList(body.walletAddresses);
    if (walletList.length === 0) throw badRequest('walletAddresses must contain at least one non-empty address');
    if (walletList.length > MAX_WALLETS) throw badRequest(`Too many wallets (max ${MAX_WALLETS})`);
  } else if (body.walletAddress && body.walletAddress.trim() !== '') {
    walletList = [body.walletAddress.trim()];
  } else {
    throw badRequest('walletAddress or walletAddresses is required');
  }

  const klineSliceOnly = body.klineSliceOnly === true;
  const userCap = parseOptionalPositiveInt(body.klineEnrichTotalCap);
  const klineOffset =
    body.klineEnrichOffset !== undefined && Number.isFinite(body.klineEnrichOffset) && body.klineEnrichOffset >= 0
      ? Math.floor(body.klineEnrichOffset)
      : 0;
  const klineBatchSize =
    body.klineEnrichBatchSize !== undefined &&
    Number.isFinite(body.klineEnrichBatchSize) &&
    body.klineEnrichBatchSize >= 1
      ? Math.min(Math.floor(body.klineEnrichBatchSize), 500)
      : DEFAULT_KLINE_ENRICH_BATCH;

  if (klineSliceOnly && walletList.length !== 1) {
    throw badRequest('klineSliceOnly is only supported for a single walletAddress');
  }
  if (klineSliceOnly && userCap === undefined) {
    throw badRequest('klineEnrichTotalCap is required when klineSliceOnly is true');
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
          for (const p of batch) merged.push({ ...p, sourceWallet: addr });
        }
        merged.sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());
        purchases = mergeMultiWalletPurchases(merged);
      }
      const payload: { purchases: typeof purchases; debugLog?: string[]; meta?: BuildWalletPurchasePreviewsMeta } = {
        purchases,
      };
      if (debug && debugLog !== undefined) payload.debugLog = debugLog;
      return ok(payload);
    }

    const result = await buildWalletPurchasePreviews(walletList[0], fromMs, toMs, {
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
    return ok(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'GMGN request failed';
    const status = /HTTP 401\b/.test(message)
      ? 401
      : /HTTP 403\b/.test(message)
        ? 403
        : /HTTP 429\b/.test(message)
          ? 429
          : 502;
    return NextResponse.json({ error: message }, { status });
  }
});
