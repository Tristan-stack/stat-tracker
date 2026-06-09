import { createThrottle } from '@/lib/http/throttle';

/** GMGN OpenAPI: max ~2 requests per second — space consecutive calls by at least 650ms. */
const gmgn = createThrottle(650);

export async function throttleGmgn(): Promise<void> {
  await gmgn.throttle();
}

export function penalizeGmgnSlot(delayMs: number): void {
  gmgn.penalize(delayMs);
}
