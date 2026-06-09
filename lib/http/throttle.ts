export interface Throttle {
  /** Attend le prochain créneau disponible puis le réserve. */
  throttle(): Promise<void>;
  /** Repousse le prochain créneau (ex. après un 429) d'au moins `delayMs`. */
  penalize(delayMs: number): void;
}

/**
 * Throttle slot-based partagé : espace les appels consécutifs d'au moins
 * `minIntervalMs`. Mutualise l'algorithme historiquement dupliqué entre les
 * clients GMGN et Helius.
 */
export function createThrottle(minIntervalMs: number): Throttle {
  let nextSlot = 0;
  return {
    async throttle() {
      const now = Date.now();
      const wait = Math.max(0, nextSlot - now);
      nextSlot = Math.max(nextSlot, now) + minIntervalMs;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    },
    penalize(delayMs: number) {
      nextSlot = Math.max(nextSlot, Date.now() + delayMs);
    },
  };
}
