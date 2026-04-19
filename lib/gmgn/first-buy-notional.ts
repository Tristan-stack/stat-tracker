import { gmgnGet } from '@/lib/gmgn/client';
import type { WalletActivityRow } from '@/lib/gmgn/client';
import { fetchSolUsdFromHeliusDas } from '@/lib/helius/sol-spot';

/** Wrapped SOL sur Solana — utilisé pour le spot SOL/USD via GMGN. */
export const GMGN_WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** USDC natif Solana — proxy EUR/USD si WSOL n’expose pas l’EUR. */
export const GMGN_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export function parseFlexiblePositive(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function isWsolLike(addr: unknown, sym: unknown): boolean {
  if (typeof addr === 'string' && addr.trim() === GMGN_WSOL_MINT) return true;
  if (typeof sym !== 'string') return false;
  const s = sym.trim().toUpperCase();
  return s === 'SOL' || s === 'WSOL';
}

function pickUsdFromFlat(r: Record<string, unknown>): number | null {
  const keys = [
    'amount_usd',
    'volume_usd',
    'total_usd',
    'usd_amount',
    'usd_volume',
    'value_usd',
    'cost_usd',
    'tx_usd',
    'total_volume_usd',
    'volume',
  ];
  for (const k of keys) {
    const n = parseFlexiblePositive(r[k]);
    if (n !== null) return n;
  }
  return null;
}

function pickSolFromFlat(r: Record<string, unknown>): number | null {
  const keys = [
    'cost_sol',
    'sol_amount',
    'volume_sol',
    'native_amount',
    'quote_sol',
    'spent_sol',
    'total_sol',
  ];
  for (const k of keys) {
    const n = parseFlexiblePositive(r[k]);
    if (n !== null) return n;
  }
  return null;
}

/**
 * Extrait un montant notionnel USD / SOL depuis une ligne `wallet_activity` GMGN.
 * Les schémas varient selon les pools ; on agrège plusieurs noms de champs courants.
 */
export function parseFirstBuyNotional(row: WalletActivityRow): { usd: number | null; sol: number | null } {
  const r = row as WalletActivityRow & Record<string, unknown>;

  let usd = pickUsdFromFlat(r);
  let sol = pickSolFromFlat(r);

  const quoteToken = r.quote_token;
  if (quoteToken && typeof quoteToken === 'object') {
    const qt = quoteToken as Record<string, unknown>;
    const addr = qt.address ?? qt.token_address;
    const sym = qt.symbol ?? qt.name;
    if (isWsolLike(addr, sym)) {
      const qa =
        parseFlexiblePositive(r.quote_amount) ??
        parseFlexiblePositive(r.quote_token_amount) ??
        parseFlexiblePositive(qt.amount) ??
        parseFlexiblePositive(qt.ui_amount);
      if (qa !== null) sol = sol ?? qa;
    }
  }

  const baseToken = r.base_token;
  if (baseToken && typeof baseToken === 'object') {
    const bt = baseToken as Record<string, unknown>;
    const addr = bt.address ?? bt.token_address;
    const sym = bt.symbol;
    if (isWsolLike(addr, sym)) {
      const ba =
        parseFlexiblePositive(r.base_amount) ??
        parseFlexiblePositive(r.token_amount) ??
        parseFlexiblePositive(bt.amount);
      if (ba !== null) sol = sol ?? ba;
    }
  }

  const cost = r.cost;
  if (cost && typeof cost === 'object') {
    const c = cost as Record<string, unknown>;
    usd = usd ?? pickUsdFromFlat(c);
    sol = sol ?? pickSolFromFlat(c);
  }

  const volume = r.volume;
  if (volume && typeof volume === 'object') {
    const v = volume as Record<string, unknown>;
    usd = usd ?? pickUsdFromFlat(v);
    sol = sol ?? pickSolFromFlat(v);
  }

  return { usd, sol };
}

/**
 * Complète USD ou SOL manquant à partir du spot SOL/USD (GMGN).
 */
export function mergeNotionalWithSolUsd(
  parsed: { usd: number | null; sol: number | null },
  solUsd: number | null
): { usd: number | null; sol: number | null } {
  let { usd, sol } = parsed;
  if (solUsd !== null && solUsd > 0) {
    if (sol === null && usd !== null) sol = usd / solUsd;
    if (usd === null && sol !== null) usd = sol * solUsd;
  }
  return { usd, sol };
}

/** Champs USD explicites ; `price` / `last_price` seulement avec bornes spot SOL (évite ~1 USDC). */
const GMGN_SOL_USD_KEYS = [
  'price_usd',
  'usd_price',
  'priceUsd',
  'last_price_usd',
  'current_price_usd',
  'close_price_usd',
  'open_price_usd',
  'price',
  'last_price',
  'close_price',
  'current_price',
] as const;

/** Champs EUR explicites pour le spot SOL (pas de clé générique `eur` en récursion profonde). */
const GMGN_SOL_EUR_KEYS = ['price_eur', 'eur_price', 'priceEur'] as const;

/** EUR pour ~1 USD via stable USDC (valeur attendue ~0,85–1,05). */
const GMGN_STABLE_EUR_PER_USD_KEYS = ['price_eur', 'eur_price', 'priceEur', 'eur'] as const;

const SOL_SPOT_USD_BOUNDS = { min: 25, max: 600_000 } as const;
const SOL_SPOT_EUR_BOUNDS = { min: 25, max: 600_000 } as const;
const STABLE_EUR_PER_USD_BOUNDS = { min: 0.78, max: 1.25 } as const;

function gmgnTokenShallowLayers(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const root = data as Record<string, unknown>;
  const layers: Record<string, unknown>[] = [root];
  const nestedKeys = [
    'token',
    'token_info',
    'base_token',
    'pool',
    'pool_info',
    'pair',
    'price_info',
    'stat',
    'info',
    'data',
  ] as const;
  for (const key of nestedKeys) {
    const v = root[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      layers.push(v as Record<string, unknown>);
    }
  }
  const pools = root.pools;
  if (Array.isArray(pools) && pools[0] && typeof pools[0] === 'object' && !Array.isArray(pools[0])) {
    layers.push(pools[0] as Record<string, unknown>);
  }
  return layers;
}

function pickFirstInLayers(
  layers: Record<string, unknown>[],
  keys: readonly string[],
  bounds: { min: number; max: number }
): number | null {
  for (const layer of layers) {
    for (const k of keys) {
      const n = parseFlexiblePositive(layer[k]);
      if (n !== null && n >= bounds.min && n <= bounds.max) return n;
    }
  }
  return null;
}

/** Parcours profond : préférer champs USD explicites avant `price` (souvent ~1 sur stables). */
function walkUsdPrice(obj: unknown, depth = 0): number | null {
  if (depth > 4 || obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return null;
  const r = obj as Record<string, unknown>;
  const keys = [
    'price_usd',
    'usd_price',
    'priceUsd',
    'last_price_usd',
    'current_price_usd',
    'close_price_usd',
    'quote_usd',
    'token_price',
    'last_price',
    'close_price',
    'current_price',
    'price',
  ];
  for (const k of keys) {
    const n = parseFlexiblePositive(r[k]);
    if (n !== null && n < 1e6) return n;
  }
  for (const v of Object.values(r)) {
    const found = walkUsdPrice(v, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function extractSolUsdFromGmgnPayload(payload: unknown): number | null {
  const layers = gmgnTokenShallowLayers(payload);
  const strict = pickFirstInLayers(layers, GMGN_SOL_USD_KEYS, SOL_SPOT_USD_BOUNDS);
  if (strict !== null) return strict;
  const loose = walkUsdPrice(payload);
  if (loose !== null && loose >= SOL_SPOT_USD_BOUNDS.min && loose <= SOL_SPOT_USD_BOUNDS.max) return loose;
  return null;
}

function walkSolEurFiat(obj: unknown, depth = 0): number | null {
  if (depth > 4 || obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return null;
  const r = obj as Record<string, unknown>;
  for (const k of GMGN_SOL_EUR_KEYS) {
    const n = parseFlexiblePositive(r[k]);
    if (n !== null && n >= SOL_SPOT_EUR_BOUNDS.min && n <= SOL_SPOT_EUR_BOUNDS.max) return n;
  }
  for (const v of Object.values(r)) {
    const found = walkSolEurFiat(v, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function extractSolEurFromGmgnPayload(payload: unknown): number | null {
  const shallow = pickFirstInLayers(gmgnTokenShallowLayers(payload), GMGN_SOL_EUR_KEYS, SOL_SPOT_EUR_BOUNDS);
  if (shallow !== null) return shallow;
  return walkSolEurFiat(payload);
}

function walkStableEurPerUsd(obj: unknown, depth = 0): number | null {
  if (depth > 4 || obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return null;
  const r = obj as Record<string, unknown>;
  for (const k of GMGN_STABLE_EUR_PER_USD_KEYS) {
    const n = parseFlexiblePositive(r[k]);
    if (n !== null && n >= STABLE_EUR_PER_USD_BOUNDS.min && n <= STABLE_EUR_PER_USD_BOUNDS.max)
      return n;
  }
  for (const v of Object.values(r)) {
    const found = walkStableEurPerUsd(v, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function extractStableEurPerUsdFromGmgnPayload(payload: unknown): number | null {
  const shallow = pickFirstInLayers(
    gmgnTokenShallowLayers(payload),
    GMGN_STABLE_EUR_PER_USD_KEYS,
    STABLE_EUR_PER_USD_BOUNDS
  );
  if (shallow !== null) return shallow;
  return walkStableEurPerUsd(payload);
}

/** Secours si GMGN donne USD/SOL mais pas EUR/SOL (ex. USDC sans `price_eur` en surface). */
async function fetchEurPerUsdFromFrankfurter(): Promise<number | null> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { rates?: { EUR?: number } };
    const eur = j.rates?.EUR;
    if (typeof eur !== 'number' || !Number.isFinite(eur) || eur <= 0) return null;
    if (eur < STABLE_EUR_PER_USD_BOUNDS.min || eur > STABLE_EUR_PER_USD_BOUNDS.max) return null;
    return eur;
  } catch {
    return null;
  }
}

const WSOL_GMGN_ATTEMPTS: Array<{ path: string; query: Record<string, string> }> = [
  { path: '/v1/token/price_info', query: { chain: 'sol', address: GMGN_WSOL_MINT } },
  { path: '/v1/token/price_info', query: { chain: 'sol', token_address: GMGN_WSOL_MINT } },
  { path: '/v1/token/stat', query: { chain: 'sol', address: GMGN_WSOL_MINT } },
  { path: '/v1/token/info', query: { chain: 'sol', address: GMGN_WSOL_MINT } },
];

const USDC_GMGN_ATTEMPTS: Array<{ path: string; query: Record<string, string> }> = [
  { path: '/v1/token/price_info', query: { chain: 'sol', address: GMGN_USDC_MINT } },
  { path: '/v1/token/price_info', query: { chain: 'sol', token_address: GMGN_USDC_MINT } },
  { path: '/v1/token/stat', query: { chain: 'sol', address: GMGN_USDC_MINT } },
];

async function fetchSolUsdFromGmgnOnly(): Promise<number | null> {
  for (const a of WSOL_GMGN_ATTEMPTS) {
    try {
      const payload = await gmgnGet<unknown>(a.path, a.query);
      const p = extractSolUsdFromGmgnPayload(payload);
      if (p !== null) return p;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Spot SOL en USD et EUR : USD prioritaire via Helius DAS (`getAsset` WSOL), puis GMGN ; EUR GMGN, cross stable ou Frankfurter.
 */
export async function fetchSolFiatSpotFromGmgn(): Promise<{
  usdPerSol: number | null;
  eurPerSol: number | null;
}> {
  let usdPerSol: number | null = null;
  let eurPerSol: number | null = null;

  try {
    usdPerSol = await fetchSolUsdFromHeliusDas();
  } catch {
    // Helius indisponible ou clé absente — poursuite GMGN
  }

  for (const a of WSOL_GMGN_ATTEMPTS) {
    try {
      const payload = await gmgnGet<unknown>(a.path, a.query);
      if (usdPerSol === null) {
        const usd = extractSolUsdFromGmgnPayload(payload);
        if (usd !== null) usdPerSol = usd;
      }
      const eur = extractSolEurFromGmgnPayload(payload);
      if (eur !== null) eurPerSol = eur;
      if (usdPerSol !== null && eurPerSol !== null) return { usdPerSol, eurPerSol };
    } catch {
      // try next
    }
  }

  if (usdPerSol === null) {
    usdPerSol = await fetchSolUsdFromGmgnOnly();
  }

  if (eurPerSol === null && usdPerSol !== null) {
    for (const a of USDC_GMGN_ATTEMPTS) {
      try {
        const payload = await gmgnGet<unknown>(a.path, a.query);
        const eurPerUsd = extractStableEurPerUsdFromGmgnPayload(payload);
        if (eurPerUsd !== null) {
          eurPerSol = usdPerSol * eurPerUsd;
          break;
        }
      } catch {
        // try next
      }
    }
  }

  if (eurPerSol === null && usdPerSol !== null) {
    const eurPerUsd = await fetchEurPerUsdFromFrankfurter();
    if (eurPerUsd !== null) eurPerSol = usdPerSol * eurPerUsd;
  }

  return { usdPerSol, eurPerSol };
}

/**
 * Prix spot SOL/USD : Helius DAS (WSOL) puis GMGN.
 */
export async function fetchSolUsdFromGmgn(): Promise<number | null> {
  try {
    const h = await fetchSolUsdFromHeliusDas();
    if (h !== null) return h;
  } catch {
    // fallback GMGN
  }
  return fetchSolUsdFromGmgnOnly();
}
