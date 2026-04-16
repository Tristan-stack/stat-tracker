/**
 * Cache navigateur (sessionStorage) : conservé tant que l’onglet / la session navigateur est ouverte.
 * Pas de persistance serveur.
 */

const STORAGE_KEY = 'stattracker_wallet_comparison_session_v1';
const MAX_ENTRIES = 20;

/** Réponse API comparaison (snapshot JSON / session). */
export interface CompareResponseSnapshot {
  fromMs: number;
  toMs: number;
  walletsCompared: string[];
  skippedWallets: Array<{ walletAddress: string; error: string }>;
  commonMintCount: number;
  /** Mints distincts sur au moins un wallet (réunion). Absent sur les entrées de cache anciennes. */
  distinctMintUnionCount?: number;
  globalWinnerWallets: string[];
  scores: Array<{
    walletAddress: string;
    wins: number;
    commonMintCount: number;
    winRatePercent: number;
    sumWinnerEntryPrices: number;
  }>;
  perMint: Array<{
    mint: string;
    tokenName: string | null;
    winnerWallet: string;
    entries: Array<{ walletAddress: string; entryPrice: number; purchasedAt: string }>;
  }>;
}

export interface CachedWalletComparison {
  id: string;
  savedAt: number;
  /** Résumé court pour la liste. */
  label: string;
  walletAddressesRequested: string[];
  fromMs: number;
  toMs: number;
  result: CompareResponseSnapshot;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

function stableCacheKey(wallets: string[], fromMs: number, toMs: number): string {
  const sorted = [...wallets].map((w) => w.trim().toLowerCase()).filter(Boolean).sort();
  return `${sorted.join(',')}|${fromMs}|${toMs}`;
}

function readRaw(): CachedWalletComparison[] {
  if (!isBrowser()) return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CachedWalletComparison =>
        x !== null &&
        typeof x === 'object' &&
        typeof (x as CachedWalletComparison).id === 'string' &&
        typeof (x as CachedWalletComparison).savedAt === 'number' &&
        typeof (x as CachedWalletComparison).result === 'object'
    );
  } catch {
    return [];
  }
}

function writeRaw(items: CachedWalletComparison[]): void {
  if (!isBrowser()) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ENTRIES)));
}

export function getWalletComparisonSessionCache(): CachedWalletComparison[] {
  return readRaw();
}

export function clearWalletComparisonSessionCache(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function pushWalletComparisonSessionCache(input: {
  walletAddressesRequested: string[];
  fromMs: number;
  toMs: number;
  result: CompareResponseSnapshot;
}): CachedWalletComparison[] {
  if (!isBrowser()) return [];
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { walletAddressesRequested, fromMs, toMs, result } = input;
  const nW = result.walletsCompared.length;
  const nCommon = result.commonMintCount;
  const nUnion = result.distinctMintUnionCount;
  const label =
    nUnion !== undefined
      ? `${nW} wallet(s) comparé(s) · ${nCommon} commun(s) / ${nUnion} distincts`
      : `${nW} wallet(s) comparé(s) · ${nCommon} token(s) commun(s)`;

  const entry: CachedWalletComparison = {
    id,
    savedAt: Date.now(),
    label,
    walletAddressesRequested: [...walletAddressesRequested],
    fromMs,
    toMs,
    result,
  };

  const key = stableCacheKey(walletAddressesRequested, fromMs, toMs);
  const prev = readRaw().filter(
    (x) => stableCacheKey(x.walletAddressesRequested, x.fromMs, x.toMs) !== key
  );
  const next = [entry, ...prev].slice(0, MAX_ENTRIES);
  writeRaw(next);
  return next;
}

export function removeWalletComparisonSessionEntry(id: string): CachedWalletComparison[] {
  const next = readRaw().filter((x) => x.id !== id);
  writeRaw(next);
  return next;
}
