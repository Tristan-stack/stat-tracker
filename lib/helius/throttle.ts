import { createThrottle } from '@/lib/http/throttle';

// Throttle Helius GLOBAL partagé (analyse, address-tracer, etc.). Défaut 10 req/s =
// limite du plan Helius gratuit. L'analyse ne crashe plus sur 429 (contre-pression
// `penalizeHelius` + isolation par token), donc on cale sur la limite réelle plutôt que sur
// une valeur ultra-prudente. Baisser via env si 429 persistants ; monter sur un plan payant.
const HELIUS_RPS = Number(process.env.HELIUS_RPS ?? '10');
const helius = createThrottle(Math.ceil(1000 / HELIUS_RPS));

export async function throttleHelius(): Promise<void> {
  await helius.throttle();
}

/**
 * Repousse le créneau partagé d'au moins `delayMs` après un 429. Transforme le
 * backoff local d'une requête en contre-pression *globale* : tous les workers
 * concurrents (cf. `ANALYSIS_CONCURRENCY`) ralentissent ensemble au lieu de
 * continuer à taper le provider. Appelé par `heliusFetch`.
 */
export function penalizeHelius(delayMs: number): void {
  helius.penalize(delayMs);
}
