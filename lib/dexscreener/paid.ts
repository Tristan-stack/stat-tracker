import { createMemoryCache } from '@/lib/cache';
import { fetchDexscreenerOrders } from '@/lib/dexscreener/client';
import type { DexPaidEntry } from '@/types/dex-paid';

/**
 * Résolution « DEX payé » par mint, avec cache mémoire in-process.
 * TTL asymétrique car le statut ne bouge que dans un sens (non payé → payé) :
 *  - payé : très stable → TTL long ;
 *  - non payé : un token pump.fun paie souvent peu après le launch → TTL court
 *    pour le repérer vite (sinon on resterait « non payé » 30 min après paiement) ;
 *  - erreur réseau : TTL court pour retenter vite.
 * Le throttle vit dans le client : ici on se contente d'enchaîner les mints non cachés.
 */
const PAID_TTL_MS = Number(process.env.DEXSCREENER_PAID_TTL_MS ?? String(30 * 60_000));
const UNPAID_TTL_MS = Number(process.env.DEXSCREENER_UNPAID_TTL_MS ?? String(90_000));
const ERROR_TTL_MS = Number(process.env.DEXSCREENER_PAID_ERROR_TTL_MS ?? String(60_000));

const cache = createMemoryCache<DexPaidEntry>();

async function resolveOneDexPaid(mint: string): Promise<DexPaidEntry> {
  const cached = cache.get(mint);
  if (cached) return cached;

  try {
    const orders = await fetchDexscreenerOrders(mint);
    const approved = orders.filter((o) => o.status === 'approved');
    const entry: DexPaidEntry = {
      paid: approved.length > 0,
      approvedTypes: approved.length > 0 ? [...new Set(approved.map((o) => o.type))] : undefined,
    };
    cache.set(mint, entry, entry.paid ? PAID_TTL_MS : UNPAID_TTL_MS);
    return entry;
  } catch (e) {
    const entry: DexPaidEntry = {
      paid: false,
      error: e instanceof Error ? e.message.slice(0, 200) : 'Dexscreener indisponible',
    };
    cache.set(mint, entry, ERROR_TTL_MS);
    return entry;
  }
}

/** Résout le statut payé pour une liste de mints (séquentiel, throttlé côté client). */
export async function resolveDexPaidByMint(mints: string[]): Promise<Record<string, DexPaidEntry>> {
  const byMint: Record<string, DexPaidEntry> = {};
  for (const mint of mints) {
    byMint[mint] = await resolveOneDexPaid(mint);
  }
  return byMint;
}
