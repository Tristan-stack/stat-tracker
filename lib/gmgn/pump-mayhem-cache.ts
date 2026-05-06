import { query } from '@/lib/db';
import { probeGmgnPumpMayhemMint } from '@/lib/gmgn/pump-mayhem';

/** TTL par défaut : 7 jours (classification Mayhem peu volatile une fois connue). */
const DEFAULT_CACHE_TTL_SEC = 604800;
/** Plafond : 30 jours pour éviter des valeurs d’ENV absurdes. */
const MAX_CACHE_TTL_SEC = 2592000;
const MIN_CACHE_TTL_SEC = 120;

/** Secondes TTL pour entrées réussies (GMGN ayant répondu). */
function pgBoolTruthy(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).toLowerCase();
  return s === 'true' || s === 't' || s === '1';
}

export function gmgnMayhemCacheTtlSeconds(): number {
  const raw = process.env.GMGN_MAYHEM_CACHE_TTL_SECONDS?.trim();
  const n =
    raw === undefined || raw === '' ? DEFAULT_CACHE_TTL_SEC : Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_CACHE_TTL_SEC;
  if (n < MIN_CACHE_TTL_SEC) return MIN_CACHE_TTL_SEC;
  if (n > MAX_CACHE_TTL_SEC) return MAX_CACHE_TTL_SEC;
  return n;
}

export type ResolvePumpMayhemResult = {
  isPumpMayhem: boolean;
  /** Trouvé dans `gmgn_pump_mayhem_cache` encore valide. */
  cacheHit: boolean;
  /** Au moins un appel GMGN réussi lors de cette résolution (hors lecture cache). */
  gmgnFetched: boolean;
};

/**
 * Lecture cache Postgres puis GMGN si manquant ou expiré. Met en cache uniquement une classification GMGN confirmée.
 */
export async function resolvePumpMayhemWithCache(mint: string): Promise<ResolvePumpMayhemResult> {
  const key = mint.trim();
  if (key === '') {
    return { isPumpMayhem: false, cacheHit: false, gmgnFetched: false };
  }

  let cached: { is_pump_mayhem: unknown }[] = [];
  try {
    cached = await query<{ is_pump_mayhem: unknown }>(
      `
      select is_pump_mayhem
      from gmgn_pump_mayhem_cache
      where mint = $1 and expires_at > now()
      `,
      [key]
    );
  } catch (e) {
    // Table absente (migration non déployée) ou autre erreur DB : ne pas faire échouer le leaderboard.
    console.warn('[gmgn mayhem cache] lecture cache ignorée', e);
  }

  const row = cached[0];
  if (row !== undefined) {
    return { isPumpMayhem: pgBoolTruthy(row.is_pump_mayhem), cacheHit: true, gmgnFetched: false };
  }

  const probe = await probeGmgnPumpMayhemMint(key);
  if (probe.kind === 'unavailable') {
    return { isPumpMayhem: false, cacheHit: false, gmgnFetched: false };
  }

  const ttlSec = gmgnMayhemCacheTtlSeconds();
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

  try {
    await query(
      `insert into gmgn_pump_mayhem_cache (mint, is_pump_mayhem, expires_at, updated_at)
       values ($1, $2, $3::timestamptz, now())
       on conflict (mint) do update set
         is_pump_mayhem = excluded.is_pump_mayhem,
         expires_at = excluded.expires_at,
         updated_at = now()`,
      [key, probe.isPumpMayhem, expiresAt]
    );
  } catch (e) {
    console.error('[gmgn mayhem cache] insert failed', key.slice(0, 8), e);
  }

  return { isPumpMayhem: probe.isPumpMayhem, cacheHit: false, gmgnFetched: true };
}
