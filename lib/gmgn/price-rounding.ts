/** Multiply GMGN USD token price to match l’échelle MCap habituelle (ex. 0.0000064907 → 6.49). */
export const GMGN_USD_TO_MCAP_SCALE = 1_000_000;

/** Décimales affichées / stockées pour l’échelle MCap après conversion. */
export const GMGN_MCAP_DECIMALS = 2;

const M = 10 ** GMGN_MCAP_DECIMALS;
const EPS = 1e-10;

export function scaleUsdToMcap(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return usd * GMGN_USD_TO_MCAP_SCALE;
}

function roundMcapHalfUp(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.round(x * M + EPS) / M;
}

function roundLowMcapDown(x: number): number {
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.floor(x * M + EPS) / M;
}

/**
 * USD (prix token GMGN) → échelle MCap (× 1e6), puis arrondis :
 * entrée et **high** au plus proche (éviter le floor sur le high qui collait trop souvent à l’entrée),
 * low vers le bas, puis low ≤ entrée ≤ high.
 */
export function sanitizeUsdToMcapPrices(
  usdEntry: number,
  usdHigh: number,
  usdLow: number
): { entry: number; high: number; low: number } {
  const eRaw = scaleUsdToMcap(usdEntry);
  const hRaw = scaleUsdToMcap(usdHigh);
  const lRaw = scaleUsdToMcap(usdLow);
  let e = roundMcapHalfUp(eRaw);
  let h = roundMcapHalfUp(hRaw);
  let l = roundLowMcapDown(lRaw);
  if (l > h) [l, h] = [h, l];
  e = Math.min(Math.max(e, l), h);
  if (h < e) h = e;
  if (l > e) l = e;
  return { entry: e, high: h, low: l };
}

export function formatGmgnDecimalString(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0';
  const s = n.toFixed(GMGN_MCAP_DECIMALS);
  const trimmed = s.replace(/\.?0+$/, '');
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}

export function parseGmgnDecimalString(s: string): number {
  const n = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
