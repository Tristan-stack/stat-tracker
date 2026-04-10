import {
  aggregateHighLowFromKlines,
  fetchTokenKline,
  gmgnGet,
  parseCandleOpenMs,
  pickKlineResolution,
  type KlineCandle,
} from '@/lib/gmgn/client';
import { sanitizeUsdToMcapPrices } from '@/lib/gmgn/price-rounding';

const CHAIN_SOL = 'sol';

export interface TokenTrackingPreview {
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  entryPrice: number;
  high: number;
  low: number;
  truncatedKlines: boolean;
}

function parseUsd(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function entryFromCandles(candles: KlineCandle[]): number {
  if (candles.length === 0) return 0;
  const sorted = [...candles].sort((a, b) => {
    const ta = typeof a.time === 'number' ? a.time : 0;
    const tb = typeof b.time === 'number' ? b.time : 0;
    return ta - tb;
  });
  const first = sorted[0] as KlineCandle & Record<string, unknown>;
  const open = parseUsd(first.open ?? first.o);
  if (open > 0) return open;
  const close = parseUsd(first.close ?? first.c);
  if (close > 0) return close;
  const high = parseUsd(first.high ?? first.h);
  const low = parseUsd(first.low ?? first.l);
  if (high > 0 && low > 0) return (high + low) / 2;
  return 0;
}

function firstCandleOpenMs(candles: KlineCandle[]): number | null {
  const opens = candles
    .map((c) => parseCandleOpenMs(c))
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  return opens.length > 0 ? opens[0] : null;
}

function normalizeTimestampToMs(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return v >= 1_000_000_000_000 ? Math.floor(v) : Math.floor(v * 1000);
}

function extractTimestampFromRecord(obj: Record<string, unknown>): number | null {
  const keys = [
    'open_timestamp',
    'pool_creation_timestamp',
    'pair_creation_timestamp',
    'creation_timestamp',
    'create_timestamp',
    'created_at',
    'createdAt',
  ] as const;
  for (const key of keys) {
    const ms = normalizeTimestampToMs(obj[key]);
    if (ms !== null) return ms;
  }
  return null;
}

function extractAthUsdFromRecord(obj: Record<string, unknown>): number | null {
  const keys = [
    'ath',
    'ath_price',
    'all_time_high',
    'all_time_high_price',
    'price_ath',
    'highest_price',
    'max_price',
  ] as const;
  for (const key of keys) {
    const v = parseUsd(obj[key]);
    if (v > 0) return v;
  }
  return null;
}

function tokenLabelFromPayload(
  payload: unknown,
  mint: string
): { name: string; createdAtMs?: number; athUsd?: number } | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  const rootTs = extractTimestampFromRecord(p);
  const rootAth = extractAthUsdFromRecord(p);
  const directName = typeof p.name === 'string' ? p.name.trim() : '';
  const directSymbol = typeof p.symbol === 'string' ? p.symbol.trim() : '';
  if (directName !== '') return { name: directName, createdAtMs: rootTs ?? undefined, athUsd: rootAth ?? undefined };
  if (directSymbol !== '') return { name: directSymbol, createdAtMs: rootTs ?? undefined, athUsd: rootAth ?? undefined };

  const data = p.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const dTs = extractTimestampFromRecord(d) ?? rootTs;
    const dAth = extractAthUsdFromRecord(d) ?? rootAth;
    const dn = typeof d.name === 'string' ? d.name.trim() : '';
    const ds = typeof d.symbol === 'string' ? d.symbol.trim() : '';
    if (dn !== '') return { name: dn, createdAtMs: dTs ?? undefined, athUsd: dAth ?? undefined };
    if (ds !== '') return { name: ds, createdAtMs: dTs ?? undefined, athUsd: dAth ?? undefined };
  }

  const token = p.token;
  if (token && typeof token === 'object') {
    const t = token as Record<string, unknown>;
    const tTs = extractTimestampFromRecord(t) ?? rootTs;
    const tAth = extractAthUsdFromRecord(t) ?? rootAth;
    const tn = typeof t.name === 'string' ? t.name.trim() : '';
    const ts = typeof t.symbol === 'string' ? t.symbol.trim() : '';
    if (tn !== '') return { name: tn, createdAtMs: tTs ?? undefined, athUsd: tAth ?? undefined };
    if (ts !== '') return { name: ts, createdAtMs: tTs ?? undefined, athUsd: tAth ?? undefined };
  }

  const fallbackName = `${mint.slice(0, 4)}…${mint.slice(-4)}`;
  return { name: fallbackName, createdAtMs: rootTs ?? undefined, athUsd: rootAth ?? undefined };
}

async function fetchTokenMeta(mint: string): Promise<{ name: string; createdAtMs?: number; athUsd?: number }> {
  const attempts: Array<{
    path: string;
    query: Record<string, string>;
  }> = [
    { path: '/v1/token/info', query: { chain: CHAIN_SOL, address: mint } },
    { path: '/v1/token/info', query: { chain: CHAIN_SOL, token_address: mint } },
    { path: '/v1/token/price_info', query: { chain: CHAIN_SOL, address: mint } },
    { path: '/v1/token/stat', query: { chain: CHAIN_SOL, address: mint } },
  ];

  for (const a of attempts) {
    try {
      const payload = await gmgnGet<unknown>(a.path, a.query);
      const meta = tokenLabelFromPayload(payload, mint);
      if (meta && meta.name.trim() !== '') return meta;
    } catch {
      // Ignore endpoint-specific failures and try next fallback.
    }
  }

  return { name: `${mint.slice(0, 4)}…${mint.slice(-4)}` };
}

export async function buildTokenTrackingPreviews(
  tokenAddresses: string[],
  fromMs: number,
  toMs: number,
  options?: { athHigh?: boolean }
): Promise<TokenTrackingPreview[]> {
  const out: TokenTrackingPreview[] = [];
  const endMs = Math.min(Date.now(), toMs);

  for (const mint of tokenAddresses) {
    const resolution = pickKlineResolution(fromMs, endMs);
    const candles = await fetchTokenKline(CHAIN_SOL, mint, resolution, fromMs, endMs);
    const entry = entryFromCandles(candles);
    const firstOpenMs = firstCandleOpenMs(candles);
    const meta = await fetchTokenMeta(mint);
    const agg = aggregateHighLowFromKlines(candles, entry, {
      purchaseMs: fromMs,
      resolutionHint: resolution,
    });
    let highUsd = agg.high;
    if (options?.athHigh === true) {
      if (meta.athUsd && meta.athUsd > highUsd) {
        highUsd = meta.athUsd;
      }
      // Cherche un ATH sur une fenêtre max (all-time) avec résolution large.
      const athFromMs = Math.max(1, fromMs);
      const athCandles = await fetchTokenKline(CHAIN_SOL, mint, '4h', athFromMs, endMs);
      const athAgg = aggregateHighLowFromKlines(athCandles, entry, {
        purchaseMs: athFromMs,
        resolutionHint: '4h',
      });
      if (Number.isFinite(athAgg.high) && athAgg.high > highUsd) {
        highUsd = athAgg.high;
      }
    }
    const rounded = sanitizeUsdToMcapPrices(entry, highUsd, agg.low);
    out.push({
      tokenAddress: mint,
      name: meta.name,
      purchasedAt: new Date(meta.createdAtMs ?? firstOpenMs ?? fromMs).toISOString(),
      entryPrice: rounded.entry,
      high: rounded.high,
      low: rounded.low,
      truncatedKlines: candles.length === 0,
    });
  }

  return out;
}
