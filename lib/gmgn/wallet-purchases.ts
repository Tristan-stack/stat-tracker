import {
  aggregateHighLowFromKlines,
  fetchTokenKline,
  fetchWalletActivityPage,
  klineResolutionToMs,
  pickKlineResolution,
  type WalletActivityPage,
  type WalletActivityRow,
} from '@/lib/gmgn/client';
import { sanitizeUsdToMcapPrices } from '@/lib/gmgn/price-rounding';

const CHAIN_SOL = 'sol';
/** Limite de requêtes kline par import (throttle ~2 req/s côté GMGN). */
const MAX_KLINE_ENRICH = 100;
/** Sur une plage courte (ex. aujourd'hui), on privilégie la justesse: enrichir tous les tokens. */
const SHORT_RANGE_FULL_KLINE_MS = 86400000;
const MAX_ACTIVITY_PAGES = 80;
/** Portefeuilles très actifs : plages courtes (ex. « aujourd’hui ») nécessitent plus de pages si l’API renvoie l’historique du plus ancien au plus récent. */
const MAX_ACTIVITY_PAGES_SHORT_RANGE = 250;

/** Valeurs entry / high / low sont en échelle MCap (USD GMGN × 1e6), pas en USD brut. */
export interface WalletPurchasePreview {
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  entryPrice: number;
  high: number;
  low: number;
  truncatedKlines: boolean;
  /** Présent quand l’achat provient d’un fetch multi-wallets. */
  sourceWallet?: string;
}

/**
 * Retourne un timestamp Unix en **secondes**.
 * GMGN renvoie souvent des millisecondes (≈ 1,7e12) ; comparer tel quel à `fromMs/1000` exclut tous les événements.
 */
function rowTimestampSec(row: WalletActivityRow): number {
  const r = row as WalletActivityRow & { ts?: number; block_time?: number; time?: number };
  const candidates = [r.timestamp, r.ts, r.block_time, r.time];
  for (const t of candidates) {
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) continue;
    if (t >= 1_000_000_000_000) return Math.floor(t / 1000);
    return Math.floor(t);
  }
  return 0;
}

function tokenMint(row: WalletActivityRow): string | null {
  const a = row.token?.address ?? row.token_address;
  if (typeof a === 'string' && a.length > 0) return a;
  return null;
}

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

function isBuy(row: WalletActivityRow): boolean {
  const et = row.event_type?.toLowerCase();
  if (et === 'buy') return true;
  const side = row.side?.toLowerCase();
  if (side === 'buy') return true;
  return false;
}

/**
 * Collect buy activities in [fromMs, toMs], dedupe by mint (earliest buy in window).
 */
function normalizeActivityPage(data: WalletActivityPage): WalletActivityRow[] {
  const d = data as unknown as { activities?: unknown; list?: unknown };
  if (Array.isArray(d.activities)) return d.activities as WalletActivityRow[];
  if (Array.isArray(d.list)) return d.list as WalletActivityRow[];
  return [];
}

export async function collectSolanaBuysInRange(
  walletAddress: string,
  fromMs: number,
  toMs: number
): Promise<WalletActivityRow[]> {
  const fromSec = Math.floor(fromMs / 1000);
  const toSec = Math.floor(toMs / 1000);
  const spanMs = Math.max(0, toMs - fromMs);
  const maxPages =
    spanMs <= 3 * 86400000 ? MAX_ACTIVITY_PAGES_SHORT_RANGE : MAX_ACTIVITY_PAGES;
  const collected: WalletActivityRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const data = await fetchWalletActivityPage(CHAIN_SOL, walletAddress, {
      limit: 50,
      cursor,
      types: ['buy'],
    });
    const activities = normalizeActivityPage(data);
    const pageTimestamps = activities
      .map((row) => rowTimestampSec(row))
      .filter((ts) => ts > 0);

    for (const row of activities) {
      if (!isBuy(row)) continue;
      const ts = rowTimestampSec(row);
      if (ts < fromSec || ts > toSec) continue;
      collected.push(row);
    }

    if (pageTimestamps.length > 1) {
      const firstTs = pageTimestamps[0];
      const lastTs = pageTimestamps[pageTimestamps.length - 1];
      const seemsDescending = firstTs >= lastTs;
      const oldestTs = Math.min(...pageTimestamps);

      // Si l'API page du plus récent vers le plus ancien, on peut stopper dès
      // qu'on est entièrement sous la borne basse (plus rien d'utile après).
      if (seemsDescending && oldestTs < fromSec) break;
    }

    const next = data.next;
    if (!next || activities.length === 0) break;
    cursor = next;
  }

  const byMint = new Map<string, WalletActivityRow>();
  for (const row of collected) {
    const mint = tokenMint(row);
    if (!mint) continue;
    const ts = rowTimestampSec(row);
    const prev = byMint.get(mint);
    if (!prev || rowTimestampSec(prev) > ts) {
      byMint.set(mint, row);
    }
  }
  return [...byMint.values()].sort((a, b) => rowTimestampSec(a) - rowTimestampSec(b));
}

export async function buildPurchasePreviews(
  walletAddress: string,
  fromMs: number,
  toMs: number,
  options?: { debugLog?: string[] }
): Promise<WalletPurchasePreview[]> {
  const log = (line: string) => {
    options?.debugLog?.push(line);
  };

  const rows = await collectSolanaBuysInRange(walletAddress, fromMs, toMs);
  log(`wallet_activity: ${rows.length} achat(s) après filtre / dédup`);
  const nowMs = Date.now();
  const endMs = Math.min(toMs, nowMs);
  const spanMs = Math.max(0, endMs - fromMs);
  const maxKlineEnrich = spanMs <= SHORT_RANGE_FULL_KLINE_MS ? rows.length : MAX_KLINE_ENRICH;
  const out: WalletPurchasePreview[] = [];
  let klineCount = 0;

  for (const row of rows) {
    const mint = tokenMint(row);
    if (!mint) continue;
    const tsSec = rowTimestampSec(row);
    const purchaseMs = tsSec * 1000;
    const entryPrice = parsePriceUsd(row);
    const name = tokenDisplayName(row);
    const purchasedAt = new Date(tsSec * 1000).toISOString();

    let high = entryPrice;
    let low = entryPrice;
    let truncatedKlines = false;

    if (klineCount < maxKlineEnrich && purchaseMs < endMs) {
      klineCount += 1;
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
      log(
        `   → agg_usd high=${String(agg.high)} low=${String(agg.low)} (candles=${candles.length})`
      );
    } else if (klineCount >= maxKlineEnrich && purchaseMs < endMs) {
      truncatedKlines = true;
      log(`── ${name} | ${mint.slice(0, 8)}… | kline ignoré (limite ${maxKlineEnrich} tokens)`);
    }

    const rawEntry = entryPrice > 0 ? entryPrice : 0;
    const rounded = sanitizeUsdToMcapPrices(rawEntry, high, low);
    log(
      `   → mcap entry=${String(rounded.entry)} high=${String(rounded.high)} low=${String(rounded.low)}`
    );

    out.push({
      tokenAddress: mint,
      name,
      purchasedAt,
      entryPrice: rounded.entry,
      high: rounded.high,
      low: rounded.low,
      truncatedKlines,
    });
  }

  return out;
}
