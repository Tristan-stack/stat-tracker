import { createThrottle } from '@/lib/http/throttle';

// Keep a conservative default to avoid frequent provider 429s.
// Can be increased via env for higher-tier Helius plans.
const HELIUS_RPS = Number(process.env.HELIUS_RPS ?? '2');
const helius = createThrottle(Math.ceil(1000 / HELIUS_RPS));

export async function throttleHelius(): Promise<void> {
  await helius.throttle();
}
