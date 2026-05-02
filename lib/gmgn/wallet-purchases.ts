import {
  aggregateHighLowFromKlines,
  fetchTokenKline,
  klineResolutionToMs,
  pickKlineResolution,
  type WalletActivityRow,
} from '@/lib/gmgn/client';
import { collectSolanaBuysInRange, rowTimestampSec, tokenMint } from '@/lib/gmgn/collect-solana-buys-in-range';
import { sanitizeUsdToMcapPrices } from '@/lib/gmgn/price-rounding';
import { fetchSolUsdFromGmgn, mergeNotionalWithSolUsd, parseFirstBuyNotional } from '@/lib/gmgn/first-buy-notional';

const CHAIN_SOL = 'sol';
/** Limite de requêtes kline par import sans budget explicite (plage > 24 h). */
const MAX_KLINE_ENRICH = 100;
/** Sur une plage courte (ex. aujourd'hui), on privilégie la justesse: enrichir tous les tokens (mode legacy). */
const SHORT_RANGE_FULL_KLINE_MS = 86400000;
/** Taille de lot par défaut pour l'enrichissement kline (UI + API). */
export const DEFAULT_KLINE_ENRICH_BATCH = 100;

export function serverKlineEnrichCap(): number {
  const raw = Number(process.env.GMGN_MAX_KLINE_ENRICH_CAP);
  if (Number.isFinite(raw) && raw >= 1) return Math.min(Math.floor(raw), 5000);
  return 2000;
}

/** Valeurs entry / high / low sont en échelle MCap (USD GMGN × 1e6), pas en USD brut. */
export interface WalletPurchasePreview {
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  entryPrice: number;
  high: number;
  low: number;
  truncatedKlines: boolean;
  /** Présent quand l'achat provient d'un fetch multi-wallets. */
  sourceWallet?: string;
  /** Montant notionnel estimé de l'achat (USD/SOL). */
  spentUsd?: number | null;
  spentSol?: number | null;
}

export interface BuildPurchasePreviewsOptions {
  debugLog?: string[];
  /**
   * Budget max de tokens à enrichir avec klines (mode lot).
   * Si absent, comportement legacy (100 hors plage 24 h, ou tous en plage courte).
   */
  klineEnrichTotalCap?: number;
  /** Indice de départ du lot courant (0, 100, …). */
  klineEnrichOffset?: number;
  /** Taille du lot (défaut {@link DEFAULT_KLINE_ENRICH_BATCH}). */
  klineEnrichBatchSize?: number;
  /**
   * Si true : ne renvoie que `purchasePatches` pour le lot [offset, offset+batch) ∩ [0, cap),
   * sans reconstruire la liste complète (évite doublons d'appels GMGN sur les lots déjà faits).
   */
  klineSliceOnly?: boolean;
}

export interface BuildWalletPurchasePreviewsMeta {
  totalPurchases: number;
  klineSliceOffset: number;
  klineSliceBatchSize: number;
  klineEnrichCap: number;
  enrichedCountThisRequest: number;
  /** Plafond serveur appliqué au budget utilisateur. */
  serverMaxKlineCap: number;
}

export interface BuildWalletPurchasePreviewsResult {
  /** Liste complète (vide si `klineSliceOnly`). */
  purchases: WalletPurchasePreview[];
  /** Mises à jour pour un lot suivant (si `klineSliceOnly`). */
  purchasePatches?: WalletPurchasePreview[];
  meta?: BuildWalletPurchasePreviewsMeta;
}

export { collectSolanaBuysInRange, rowTimestampSec, tokenMint } from '@/lib/gmgn/collect-solana-buys-in-range';

function tokenDisplayName(row: WalletActivityRow): string {
  const sym = row.token?.symbol?.trim();
  const n = row.token?.name?.trim();
  if (n) return n;
  if (sym) return sym;
  const mint = tokenMint(row);
  if (mint) return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
  return 'Token';
}

function parsePriceUsd(row: WalletActivityRow): number {
  const raw = row.price_usd;
  if (raw === undefined) return 0;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function previewFromRowBase(
  row: WalletActivityRow,
  rounded: { entry: number; high: number; low: number },
  name: string,
  purchasedAt: string,
  truncatedKlines: boolean,
  spentUsd: number | null,
  spentSol: number | null
): WalletPurchasePreview {
  const mint = tokenMint(row);
  if (!mint) {
    throw new Error('previewFromRowBase: missing mint');
  }
  return {
    tokenAddress: mint,
    name,
    purchasedAt,
    entryPrice: rounded.entry,
    high: rounded.high,
    low: rounded.low,
    truncatedKlines,
    spentUsd,
    spentSol,
  };
}

/**
 * Construit les previews GMGN pour un wallet (liste complète et/ou patch de lot).
 * Utiliser `buildPurchasePreviews` pour l'API legacy qui ne renvoie que le tableau.
 */
export async function buildWalletPurchasePreviews(
  walletAddress: string,
  fromMs: number,
  toMs: number,
  options?: BuildPurchasePreviewsOptions
): Promise<BuildWalletPurchasePreviewsResult> {
  const log = (line: string) => {
    options?.debugLog?.push(line);
  };

  const rows = await collectSolanaBuysInRange(walletAddress, fromMs, toMs);
  log(`wallet_activity: ${rows.length} achat(s) après filtre / dédup`);
  const endMs = Math.min(toMs, Date.now());
  const spanMs = Math.max(0, endMs - fromMs);

  const sliceOnly = options?.klineSliceOnly === true;
  const userCapRaw = options?.klineEnrichTotalCap;
  const useBatchCap = typeof userCapRaw === 'number' && Number.isFinite(userCapRaw) && userCapRaw >= 1;
  const rowsWithMint = rows.filter((r) => tokenMint(r) !== null);
  const klineEnrichCap = useBatchCap
    ? Math.min(Math.floor(userCapRaw as number), serverKlineEnrichCap(), rowsWithMint.length)
    : 0;
  const offset = useBatchCap ? Math.max(0, Math.floor(options?.klineEnrichOffset ?? 0)) : 0;
  const batchSize = useBatchCap
    ? Math.max(1, Math.floor(options?.klineEnrichBatchSize ?? DEFAULT_KLINE_ENRICH_BATCH))
    : 0;
  const batchEndExclusive = useBatchCap
    ? Math.min(offset + batchSize, klineEnrichCap, rowsWithMint.length)
    : 0;

  const legacyMaxKlineEnrich =
    spanMs <= SHORT_RANGE_FULL_KLINE_MS ? rowsWithMint.length : MAX_KLINE_ENRICH;

  const purchases: WalletPurchasePreview[] = [];
  const purchasePatches: WalletPurchasePreview[] = [];
  let enrichedThisRequest = 0;

  let solUsdSpot: number | null | undefined;
  let legacyKlineCount = 0;

  async function buildPreviewForRow(
    row: WalletActivityRow,
    idx: number,
    opts: { useBatchCap: boolean }
  ): Promise<WalletPurchasePreview> {
    const mint = tokenMint(row);
    if (!mint) {
      throw new Error('buildPreviewForRow: missing mint');
    }

    const tsSec = rowTimestampSec(row);
    const purchaseMs = tsSec * 1000;
    const entryPrice = parsePriceUsd(row);
    const name = tokenDisplayName(row);
    const purchasedAt = new Date(tsSec * 1000).toISOString();
    let spentUsd: number | null = null;
    let spentSol: number | null = null;

    let high = entryPrice;
    let low = entryPrice;
    let truncatedKlines = false;

    let shouldFetchKline = false;
    if (opts.useBatchCap) {
      if (idx >= klineEnrichCap && purchaseMs < endMs) {
        truncatedKlines = true;
        log(`── ${name} | ${mint.slice(0, 8)}… | hors budget kline (cap=${klineEnrichCap})`);
      } else if (idx < klineEnrichCap && purchaseMs < endMs) {
        if (idx >= offset && idx < batchEndExclusive) {
          shouldFetchKline = true;
        } else {
          truncatedKlines = true;
        }
      }
    } else {
      if (legacyKlineCount < legacyMaxKlineEnrich && purchaseMs < endMs) {
        legacyKlineCount += 1;
        shouldFetchKline = true;
      } else if (legacyKlineCount >= legacyMaxKlineEnrich && purchaseMs < endMs) {
        truncatedKlines = true;
        log(`── ${name} | ${mint.slice(0, 8)}… | kline ignoré (limite ${legacyMaxKlineEnrich} tokens)`);
      }
    }

    if (shouldFetchKline) {
      enrichedThisRequest += 1;
      const resolution = pickKlineResolution(purchaseMs, endMs);
      const klineDebug =
        options?.debugLog !== undefined
          ? { lines: options.debugLog, tokenLabel: mint.slice(0, 10) }
          : undefined;
      const klineFromMs = Math.max(0, purchaseMs - klineResolutionToMs(resolution));
      log(
        `── ${name} | ${mint.slice(0, 8)}… | résolution=${resolution} kline_from=${new Date(klineFromMs).toISOString()} entry_usd=${String(entryPrice)}`
      );
      const candles = await fetchTokenKline(
        CHAIN_SOL,
        mint,
        resolution,
        klineFromMs,
        endMs,
        klineDebug
      );
      const agg = aggregateHighLowFromKlines(candles, entryPrice > 0 ? entryPrice : 0, {
        purchaseMs,
        resolutionHint: resolution,
      });
      high = agg.high;
      low = agg.low;
      log(`   → agg_usd high=${String(agg.high)} low=${String(agg.low)} (candles=${candles.length})`);
    }

    const rawEntry = entryPrice > 0 ? entryPrice : 0;
    const rounded = sanitizeUsdToMcapPrices(rawEntry, high, low);
    log(
      `   → mcap entry=${String(rounded.entry)} high=${String(rounded.high)} low=${String(rounded.low)}`
    );

    const parsedNotional = parseFirstBuyNotional(row);
    if (parsedNotional.usd !== null || parsedNotional.sol !== null) {
      if (solUsdSpot === undefined) {
        try {
          solUsdSpot = await fetchSolUsdFromGmgn();
        } catch {
          solUsdSpot = null;
        }
      }
      const mergedNotional = mergeNotionalWithSolUsd(parsedNotional, solUsdSpot ?? null);
      spentUsd = mergedNotional.usd;
      spentSol = mergedNotional.sol;
    }

    return previewFromRowBase(row, rounded, name, purchasedAt, truncatedKlines, spentUsd, spentSol);
  }

  if (useBatchCap && sliceOnly) {
    for (let idx = offset; idx < batchEndExclusive; idx += 1) {
      const row = rowsWithMint[idx];
      const preview = await buildPreviewForRow(row, idx, { useBatchCap: true });
      purchasePatches.push(preview);
    }
    return {
      purchases: [],
      purchasePatches,
      meta: {
        totalPurchases: rowsWithMint.length,
        klineSliceOffset: offset,
        klineSliceBatchSize: batchSize,
        klineEnrichCap,
        enrichedCountThisRequest: enrichedThisRequest,
        serverMaxKlineCap: serverKlineEnrichCap(),
      },
    };
  }

  let outIdx = 0;
  for (const row of rows) {
    const mint = tokenMint(row);
    if (!mint) continue;
    const idx = outIdx;
    outIdx += 1;
    const preview = await buildPreviewForRow(row, idx, { useBatchCap });
    purchases.push(preview);
  }

  const meta: BuildWalletPurchasePreviewsMeta | undefined = useBatchCap
    ? {
        totalPurchases: purchases.length,
        klineSliceOffset: offset,
        klineSliceBatchSize: batchSize,
        klineEnrichCap,
        enrichedCountThisRequest: enrichedThisRequest,
        serverMaxKlineCap: serverKlineEnrichCap(),
      }
    : undefined;

  return { purchases, meta };
}

export async function buildPurchasePreviews(
  walletAddress: string,
  fromMs: number,
  toMs: number,
  options?: BuildPurchasePreviewsOptions
): Promise<WalletPurchasePreview[]> {
  const r = await buildWalletPurchasePreviews(walletAddress, fromMs, toMs, options);
  return r.purchases;
}
