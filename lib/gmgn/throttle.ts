/** GMGN OpenAPI: max ~2 requests per second — space consecutive calls by at least 650ms. */
let nextSlot = 0;
const MIN_INTERVAL_MS = 650;

export async function throttleGmgn(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(nextSlot, now) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export function penalizeGmgnSlot(delayMs: number): void {
  nextSlot = Math.max(nextSlot, Date.now() + delayMs);
}
