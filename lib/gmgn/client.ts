import { randomUUID } from 'crypto';
import { throttleGmgn, penalizeGmgnSlot } from '@/lib/gmgn/throttle';
import { gmgnFetchHttps } from '@/lib/gmgn/ipv4-fetch';

const DEFAULT_HOST = 'https://openapi.gmgn.ai';

export interface GmgnEnvelope<T = unknown> {
  code: number;
  data?: T;
  message?: string;
  error?: string;
}

function buildUrl(path: string, query: Record<string, string | number | string[] | undefined>): string {
  const host = (process.env.GMGN_HOST ?? DEFAULT_HOST).replace(/\/$/, '');
  const timestamp = Math.floor(Date.now() / 1000);
  const client_id = randomUUID();
  const params = new URLSearchParams();
  params.set('timestamp', String(timestamp));
  params.set('client_id', client_id);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, item);
    } else {
      params.set(k, String(v));
    }
  }
  return `${host}${path}?${params.toString()}`;
}

function truncateResponseBody(text: string, max = 350): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function httpErrorDetail(path: string, status: number, body: string): Error {
  const snippet = body ? truncateResponseBody(body) : '(corps vide)';
  if (status === 401 || status === 403) {
    return new Error(
      `GMGN ${path}: HTTP ${status} — ${snippet}. ` +
        'Vérifie que GMGN_API_KEY est la clé API OpenAPI (gmgn.ai), valide et autorisée pour cet endpoint ; ' +
        'la clé publique Ed25519 seule ne suffit pas pour les appels API.'
    );
  }
  return new Error(`GMGN ${path}: HTTP ${status} — ${snippet}`);
}

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [2000, 5000, 10000];

export async function gmgnGet<T = unknown>(
  path: string,
  query: Record<string, string | number | string[] | undefined>
): Promise<T> {
  const apiKey = process.env.GMGN_API_KEY;
  if (!apiKey) {
    throw new Error('GMGN_API_KEY is not configured');
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await throttleGmgn();
    const url = buildUrl(path, query);
    const res = await gmgnFetchHttps(url, {
      'X-APIKEY': apiKey,
      Accept: 'application/json',
      'User-Agent': 'StatTracker/1.0 (Next.js; GMGN OpenAPI)',
    });
    const text = await res.text();

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const backoff = RETRY_BACKOFF_MS[attempt] ?? 10000;
      penalizeGmgnSlot(backoff);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    if (!res.ok) {
      try {
        const errJson = JSON.parse(text) as GmgnEnvelope<unknown>;
        const apiMsg = [errJson.error, errJson.message].filter(Boolean).join(' — ');
        if (apiMsg) {
          throw new Error(`GMGN ${path}: HTTP ${res.status} — ${apiMsg}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith(`GMGN ${path}: HTTP`)) throw e;
      }
      throw httpErrorDetail(path, res.status, text);
    }

    let json: GmgnEnvelope<T>;
    try {
      json = JSON.parse(text) as GmgnEnvelope<T>;
    } catch {
      throw new Error(
        `GMGN ${path}: réponse non-JSON (HTTP ${res.status}) — ${truncateResponseBody(text)}`
      );
    }
    if (json.code !== 0) {
      const msg = [json.error, json.message].filter(Boolean).join(' — ') || `code ${json.code}`;
      throw new Error(`GMGN ${path}: ${msg}`);
    }
    return json.data as T;
  }

  throw new Error(`GMGN ${path}: rate-limited after ${MAX_RETRIES} retries`);
}

export interface WalletActivityRow {
  event_type?: string;
  timestamp?: number;
  /** Variantes de champ horaire selon réponses GMGN. */
  ts?: number;
  block_time?: number;
  time?: number;
  price_usd?: string;
  token_address?: string;
  side?: string;
  token?: {
    address?: string;
    symbol?: string;
    name?: string;
  };
}

export interface WalletActivityPage {
  activities?: WalletActivityRow[];
  /** Some responses use `list` instead of `activities`. */
  list?: WalletActivityRow[];
  next?: string;
}

export async function fetchWalletActivityPage(
  chain: string,
  walletAddress: string,
  opts: { limit?: number; cursor?: string; types?: string[] }
): Promise<WalletActivityPage> {
  const extra: Record<string, string | number | string[] | undefined> = {
    chain,
    wallet_address: walletAddress,
    limit: opts.limit ?? 50,
  };
  if (opts.cursor) extra.cursor = opts.cursor;
  if (opts.types?.length) extra.type = opts.types;
  return gmgnGet<WalletActivityPage>('/v1/user/wallet_activity', extra);
}

export interface KlineCandle {
  time?: number;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
}

export interface TokenKlineData {
  list?: KlineCandle[];
}

export function normalizeKlineList(data: unknown): KlineCandle[] {
  if (data === null || data === undefined) return [];
  if (Array.isArray(data)) return data as KlineCandle[];
  if (typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.list)) return d.list as KlineCandle[];
  if (Array.isArray(d.candles)) return d.candles as KlineCandle[];
  if (Array.isArray(d.data)) return d.data as KlineCandle[];
  return [];
}

async function fetchTokenKlineOnce(
  chain: string,
  tokenAddress: string,
  resolution: string,
  from: number,
  to: number
): Promise<KlineCandle[]> {
  const data = await gmgnGet<TokenKlineData | Record<string, unknown>>('/v1/market/token_kline', {
    chain,
    address: tokenAddress,
    resolution,
    from,
    to,
  });
  return normalizeKlineList(data);
}

export type FetchTokenKlineDebug = {
  lines: string[];
  /** Court libellé (ex. début de mint) pour chaque ligne de log */
  tokenLabel: string;
};

/**
 * Klines GMGN : certains environnements renvoient une liste vide si `from`/`to` sont en secondes
 * au lieu de ms (ou l’inverse). On essaie d’abord en ms, puis en secondes Unix si vide.
 * Si toujours vide avec la résolution demandée, un dernier essai en **1m** pour capter plus de bougies.
 */
export async function fetchTokenKline(
  chain: string,
  tokenAddress: string,
  resolution: string,
  fromMs: number,
  toMs: number,
  debug?: FetchTokenKlineDebug
): Promise<KlineCandle[]> {
  const fromSec = Math.floor(fromMs / 1000);
  const toSec = Math.floor(toMs / 1000);
  const tag = debug?.tokenLabel ?? tokenAddress.slice(0, 8);
  const push = (attempt: string, n: number) => {
    debug?.lines.push(`${tag} | ${attempt}: ${n} candles`);
  };

  const primary = await fetchTokenKlineOnce(chain, tokenAddress, resolution, fromMs, toMs);
  push(`${resolution} from=ms`, primary.length);
  if (primary.length > 0) return primary;

  const secondary =
    fromSec !== fromMs || toSec !== toMs
      ? await fetchTokenKlineOnce(chain, tokenAddress, resolution, fromSec, toSec)
      : [];
  push(`${resolution} from=sec`, secondary.length);
  if (secondary.length > 0) return secondary;

  if (resolution !== '1m' && toMs > fromMs) {
    const fine = await fetchTokenKlineOnce(chain, tokenAddress, '1m', fromMs, toMs);
    push(`1m from=ms`, fine.length);
    if (fine.length > 0) return fine;
    if (fromSec !== fromMs || toSec !== toMs) {
      const last = await fetchTokenKlineOnce(chain, tokenAddress, '1m', fromSec, toSec);
      push(`1m from=sec`, last.length);
      return last;
    }
  }

  return [];
}

function parseUsdField(v: unknown): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}

/** Durée d’une bougie GMGN en ms (aligné sur pickKlineResolution). */
export function klineResolutionToMs(resolution: string): number {
  const r = resolution.trim().toLowerCase();
  if (r === '1m') return 60_000;
  if (r === '5m') return 300_000;
  if (r === '15m') return 900_000;
  if (r === '1h') return 3_600_000;
  if (r === '4h') return 14_400_000;
  return 300_000;
}

/** Ouverture de bougie en ms (GMGN envoie souvent des secondes Unix). */
export function parseCandleOpenMs(c: KlineCandle): number | null {
  const t = c.time;
  if (typeof t !== 'number' || !Number.isFinite(t)) return null;
  return t < 1e12 ? t * 1000 : t;
}

function inferResolutionMsFromCandles(candles: KlineCandle[]): number | null {
  if (candles.length < 2) return null;
  const opens = candles
    .map((c) => parseCandleOpenMs(c))
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  if (opens.length < 2) return null;
  const d = opens[1] - opens[0];
  return d > 0 ? d : null;
}

/** Toutes les valeurs OHLC positives (ou 0) pour une bougie ; certaines réponses n’exposent que open/close. */
function candlePriceExtent(c: KlineCandle & Record<string, unknown>): { high: number; low: number } | null {
  const keys = ['open', 'high', 'low', 'close', 'o', 'h', 'l', 'c'] as const;
  const vals: number[] = [];
  for (const k of keys) {
    const v = parseUsdField(c[k]);
    if (v > 0) vals.push(v);
  }
  if (vals.length === 0) return null;
  return { high: Math.max(...vals), low: Math.min(...vals) };
}

export type AggregateKlineOpts = {
  /** Instant d’achat (ms) : le low ne prend que les bougies qui se terminent après (évite les creux avant achat si on a étendu le fetch). */
  purchaseMs: number;
  /** Résolution demandée (ex. 5m) si l’écart entre bougies ne peut pas être inféré. */
  resolutionHint: string;
};

/**
 * High = max sur **toutes** les bougies (y compris une bougie **avant** l’achat si le fetch commence plus tôt).
 * Low = min sur les bougies dont la fin est **après** l’achat (sinon on retombe sur toutes les bougies).
 */
export function aggregateHighLowFromKlines(
  candles: KlineCandle[],
  fallbackPrice: number,
  opts?: AggregateKlineOpts
): { high: number; low: number } {
  if (candles.length === 0) {
    const p = fallbackPrice > 0 ? fallbackPrice : 0;
    return { high: p, low: p };
  }

  const resolutionMs =
    opts !== undefined
      ? inferResolutionMsFromCandles(candles) ?? klineResolutionToMs(opts.resolutionHint)
      : null;
  const purchaseMsForLow = opts?.purchaseMs;
  const filterLowByPurchase =
    purchaseMsForLow !== undefined && resolutionMs !== null && resolutionMs > 0;

  let high = -Infinity;
  let low = Infinity;
  for (const c of candles) {
    const ext = candlePriceExtent(c as KlineCandle & Record<string, unknown>);
    if (!ext) continue;
    if (ext.high > high) high = ext.high;

    if (!filterLowByPurchase) {
      if (ext.low < low) low = ext.low;
      continue;
    }

    const openMs = parseCandleOpenMs(c);
    if (openMs === null) {
      if (ext.low < low) low = ext.low;
      continue;
    }
    const candleEndMs = openMs + resolutionMs;
    if (candleEndMs > purchaseMsForLow && ext.low < low) low = ext.low;
  }

  if (filterLowByPurchase && (!Number.isFinite(low) || low === Infinity)) {
    low = Infinity;
    for (const c of candles) {
      const ext = candlePriceExtent(c as KlineCandle & Record<string, unknown>);
      if (!ext) continue;
      if (ext.low < low) low = ext.low;
    }
  }

  if (!Number.isFinite(high) || !Number.isFinite(low) || high === -Infinity || low === Infinity) {
    const p = fallbackPrice > 0 ? fallbackPrice : 0;
    return { high: p, low: p };
  }
  if (fallbackPrice > 0) {
    high = Math.max(high, fallbackPrice);
    low = Math.min(low, fallbackPrice);
  }
  return { high, low };
}

export function pickKlineResolution(fromMs: number, toMs: number): string {
  const spanMs = Math.max(0, toMs - fromMs);
  const oneDay = 86400000;
  if (spanMs > 14 * oneDay) return '4h';
  if (spanMs > 2 * oneDay) return '1h';
  if (spanMs > 12 * 3600000) return '15m';
  return '5m';
}
