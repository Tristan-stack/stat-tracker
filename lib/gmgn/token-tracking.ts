import {
  aggregateHighLowFromKlines,
  fetchTokenKline,
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

export async function buildTokenTrackingPreviews(
  tokenAddresses: string[],
  fromMs: number,
  toMs: number
): Promise<TokenTrackingPreview[]> {
  const out: TokenTrackingPreview[] = [];
  const endMs = Math.min(Date.now(), toMs);

  for (const mint of tokenAddresses) {
    const resolution = pickKlineResolution(fromMs, endMs);
    const candles = await fetchTokenKline(CHAIN_SOL, mint, resolution, fromMs, endMs);
    const entry = entryFromCandles(candles);
    const agg = aggregateHighLowFromKlines(candles, entry, {
      purchaseMs: fromMs,
      resolutionHint: resolution,
    });
    const rounded = sanitizeUsdToMcapPrices(entry, agg.high, agg.low);
    out.push({
      tokenAddress: mint,
      name: `${mint.slice(0, 4)}…${mint.slice(-4)}`,
      purchasedAt: new Date(fromMs).toISOString(),
      entryPrice: rounded.entry,
      high: rounded.high,
      low: rounded.low,
      truncatedKlines: candles.length === 0,
    });
  }

  return out;
}
