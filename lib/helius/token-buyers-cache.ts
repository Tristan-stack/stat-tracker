import { query } from '@/lib/db';
import type { TokenBuyer } from '@/types/analysis';

/** TTL par défaut : 24 h. Les buyers early d'un mint sont des faits on-chain quasi immuables. */
const DEFAULT_TTL_HOURS = 24;
const MIN_TTL_HOURS = 1;
const MAX_TTL_HOURS = 720; // 30 jours

/** TTL effectif (ms) du cache token→buyers, surchargeable via `TOKEN_BUYERS_CACHE_TTL_HOURS`. */
export function tokenBuyersCacheTtlMs(): number {
  const raw = process.env.TOKEN_BUYERS_CACHE_TTL_HOURS?.trim();
  const n = raw === undefined || raw === '' ? DEFAULT_TTL_HOURS : Math.floor(Number(raw));
  const hours = Number.isFinite(n) ? Math.min(Math.max(n, MIN_TTL_HOURS), MAX_TTL_HOURS) : DEFAULT_TTL_HOURS;
  return hours * 3_600_000;
}

interface CachedRow {
  buyers_json: string;
}

/**
 * Buyers en cache pour `mint` si une entrée fraîche couvre au moins `limit` acheteurs
 * (renvoyés `slice(0, limit)`), sinon `null`. Tolère l'absence de table (migration non
 * déployée) : on dégrade en miss plutôt que de faire échouer l'analyse.
 */
export async function loadCachedTokenBuyers(mint: string, limit: number): Promise<TokenBuyer[] | null> {
  const key = mint.trim();
  if (key === '') return null;

  let rows: CachedRow[] = [];
  try {
    rows = await query<CachedRow>(
      `select buyers_json
       from token_buyers_cache
       where token_mint = $1 and buyer_limit >= $2 and expires_at > now()
       order by buyer_limit asc
       limit 1`,
      [key, limit]
    );
  } catch (e) {
    console.warn('[token-buyers cache] lecture ignorée', e);
    return null;
  }

  const row = rows[0];
  if (!row) return null;

  try {
    const buyers = JSON.parse(row.buyers_json) as TokenBuyer[];
    return buyers.slice(0, limit);
  } catch {
    return null;
  }
}

/**
 * Met en cache les buyers d'un `mint` sous la profondeur `limit` demandée. À n'appeler
 * que sur une récupération Helius **complète** (jamais un résultat partiel ou en erreur).
 */
export async function storeCachedTokenBuyers(mint: string, limit: number, buyers: TokenBuyer[]): Promise<void> {
  const key = mint.trim();
  if (key === '') return;

  const expiresAt = new Date(Date.now() + tokenBuyersCacheTtlMs()).toISOString();
  try {
    await query(
      `insert into token_buyers_cache (token_mint, buyer_limit, buyers_json, fetched_at, expires_at)
       values ($1, $2, $3, now(), $4::timestamptz)
       on conflict (token_mint, buyer_limit) do update set
         buyers_json = excluded.buyers_json,
         fetched_at = now(),
         expires_at = excluded.expires_at`,
      [key, limit, JSON.stringify(buyers), expiresAt]
    );
  } catch (e) {
    console.error('[token-buyers cache] insert failed', key.slice(0, 8), e);
  }
}
