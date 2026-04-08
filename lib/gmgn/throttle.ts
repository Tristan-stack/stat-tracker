/** GMGN OpenAPI: max ~2 requests per second — space consecutive calls by at least 550ms. */
let nextSlot = 0;
const MIN_INTERVAL_MS = 550;

export async function throttleGmgn(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(nextSlot, now) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
