import { AsyncLocalStorage } from 'node:async_hooks';
import { createThrottle, type Throttle } from '@/lib/http/throttle';

// Throttle Helius par défaut (analyse, etc.). Défaut 10 req/s = limite du plan gratuit.
// L'analyse ne crashe plus sur 429 (contre-pression `penalizeHelius` + isolation par token) ;
// monter sur un plan payant, baisser si 429 persistants.
const HELIUS_RPS = Number(process.env.HELIUS_RPS ?? '10');
const defaultThrottle = createThrottle(Math.ceil(1000 / HELIUS_RPS));

// Throttle dédié à l'address-tracer : il enchaîne des appels séquentiels, latence-sensibles,
// par bursts courts. Permet de le faire tourner plus vite que l'analyse SANS lever le débit
// global. Par défaut = HELIUS_RPS (découplage opt-in) ; mettre HELIUS_TRACER_RPS=100 pour des
// traces rapides (au prix de 429 + retries sur les traces longues du tier gratuit).
const HELIUS_TRACER_RPS = Number(process.env.HELIUS_TRACER_RPS ?? String(HELIUS_RPS));
const tracerThrottle = createThrottle(Math.ceil(1000 / HELIUS_TRACER_RPS));

// Throttle « courant », propagé à travers les await via AsyncLocalStorage : permet à une
// opération (ex. un trace) de basculer TOUS ses appels Helius — mêmes fonctions client
// partagées — sur un autre throttle sans toucher leur signature. Défaut = defaultThrottle.
const throttleStore = new AsyncLocalStorage<Throttle>();

function currentThrottle(): Throttle {
  return throttleStore.getStore() ?? defaultThrottle;
}

export async function throttleHelius(): Promise<void> {
  await currentThrottle().throttle();
}

/**
 * Repousse le créneau du throttle courant d'au moins `delayMs` après un 429 : contre-pression
 * globale (tous les workers concurrents ralentissent), scopée au throttle actif (défaut ou
 * tracer). Appelé par `heliusFetch`.
 */
export function penalizeHelius(delayMs: number): void {
  currentThrottle().penalize(delayMs);
}

/**
 * Bascule les appels Helius de l'exécution courante (et de ses continuations async) sur le
 * throttle de l'address-tracer (`HELIUS_TRACER_RPS`). À appeler une fois en tête d'une
 * opération de trace isolée — cf. `app/api/address-tracer/route.ts`.
 */
export function enterTracerThrottle(): void {
  throttleStore.enterWith(tracerThrottle);
}
