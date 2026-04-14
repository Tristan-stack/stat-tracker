const HELIUS_RPS = Number(process.env.HELIUS_RPS ?? '100');
const MIN_INTERVAL_MS = Math.ceil(1000 / HELIUS_RPS);

let nextSlot = 0;

export async function throttleHelius(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(nextSlot, now) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
