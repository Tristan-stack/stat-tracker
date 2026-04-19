import { heliusRpc } from '@/lib/helius/client';

/** Wrapped SOL — même mint que côté GMGN / Jupiter. */
export const HELIUS_WSOL_MINT = 'So11111111111111111111111111111111111111112';

const SOL_SPOT_USD_BOUNDS = { min: 25, max: 600_000 } as const;

interface HeliusDasPriceInfo {
  price_per_token?: number;
}

interface HeliusTokenInfo {
  price_info?: HeliusDasPriceInfo;
}

interface HeliusGetAssetResult {
  token_info?: HeliusTokenInfo;
}

function parsePositiveSpot(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return null;
}

/**
 * Prix spot SOL/USD via Helius DAS `getAsset` (WSOL).
 * Données `token_info.price_info` (cache ~600 s, top tokens par volume — SOL couvert).
 * `currency: USDC` est traité comme USD pour le spot.
 */
export async function fetchSolUsdFromHeliusDas(): Promise<number | null> {
  const result = await heliusRpc<HeliusGetAssetResult>('getAsset', {
    id: HELIUS_WSOL_MINT,
  });
  const n = parsePositiveSpot(result?.token_info?.price_info?.price_per_token);
  if (n === null) return null;
  if (n < SOL_SPOT_USD_BOUNDS.min || n > SOL_SPOT_USD_BOUNDS.max) return null;
  return n;
}
