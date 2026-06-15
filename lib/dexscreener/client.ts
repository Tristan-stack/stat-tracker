import { createThrottle } from '@/lib/http/throttle';
import { sleep, parseRetryAfterHeader, isRetryableFailure } from '@/lib/http/retry';

/**
 * Client Dexscreener minimal pour le statut « DEX payé ».
 *
 * Endpoint orders (pas de batch) : `GET /orders/v1/{chainId}/{tokenAddress}`
 * → liste d'orders `{ type, status, paymentTimestamp }`. Un token est
 * considéré « payé » s'il a au moins un order `status === 'approved'`
 * (Enhanced Token Info / profil payé).
 *
 * Rate limit documenté : 60 req/min. On sérialise via un throttle slot-based
 * partagé (cf. clients GMGN/Helius) + retry/backoff sur 429/5xx/réseau.
 */
const DEXSCREENER_BASE = 'https://api.dexscreener.com';
const DEXSCREENER_MIN_INTERVAL_MS = Number(process.env.DEXSCREENER_MIN_INTERVAL_MS ?? '1100');
const DEXSCREENER_MAX_RETRIES = Number(process.env.DEXSCREENER_MAX_RETRIES ?? '2');
const DEXSCREENER_RETRY_BASE_MS = Number(process.env.DEXSCREENER_RETRY_BASE_MS ?? '500');
const DEXSCREENER_TIMEOUT_MS = Number(process.env.DEXSCREENER_TIMEOUT_MS ?? '8000');

const throttle = createThrottle(DEXSCREENER_MIN_INTERVAL_MS);

export interface DexscreenerOrder {
  type: string;
  status: string;
  paymentTimestamp?: number;
}

async function dexscreenerGet<T>(path: string, label: string): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= DEXSCREENER_MAX_RETRIES; attempt += 1) {
    try {
      await throttle.throttle();
      const res = await fetch(`${DEXSCREENER_BASE}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(DEXSCREENER_TIMEOUT_MS),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const message = `${label}: HTTP ${res.status} — ${text.slice(0, 200)}`;
        if (attempt < DEXSCREENER_MAX_RETRIES && isRetryableFailure(res.status, message)) {
          const retryAfterMs = parseRetryAfterHeader(res.headers.get('retry-after'));
          if (res.status === 429 && retryAfterMs != null) throttle.penalize(retryAfterMs);
          await sleep(retryAfterMs ?? DEXSCREENER_RETRY_BASE_MS * Math.pow(2, attempt));
          continue;
        }
        throw new Error(message);
      }

      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < DEXSCREENER_MAX_RETRIES && isRetryableFailure(0, message)) {
        await sleep(DEXSCREENER_RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

function isOrder(o: unknown): o is DexscreenerOrder {
  return typeof o === 'object' && o !== null && typeof (o as DexscreenerOrder).status === 'string';
}

/**
 * Orders Dexscreener pour un token Solana. Tableau vide si aucun.
 *
 * L'API renvoie aujourd'hui un objet `{ orders: [...], boosts: [...] }`
 * (et historiquement un tableau nu) : on gère les deux formes.
 */
export async function fetchDexscreenerOrders(tokenAddress: string): Promise<DexscreenerOrder[]> {
  const mint = tokenAddress.trim();
  if (mint === '') return [];
  const raw = await dexscreenerGet<unknown>(
    `/orders/v1/solana/${encodeURIComponent(mint)}`,
    `Dexscreener orders ${mint.slice(0, 8)}`
  );
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { orders?: unknown })?.orders)
      ? (raw as { orders: unknown[] }).orders
      : [];
  return list.filter(isOrder);
}
