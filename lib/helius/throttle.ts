import { createThrottle } from '@/lib/http/throttle';

// Défaut prudent pour éviter les 429 fréquents : le tier Helius gratuit plafonne
// autour de 1 req/s. Surchargeable par env pour un retour sur un plan payant.
const HELIUS_RPS = Number(process.env.HELIUS_RPS ?? '1');
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
