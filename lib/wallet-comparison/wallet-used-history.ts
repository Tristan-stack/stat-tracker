/**
 * Historique des adresses utilisées (comparaisons, ajouts manuels, etc.) — sessionStorage uniquement.
 */

const STORAGE_KEY = 'stattracker_wallet_used_history_v1';
const MAX_ENTRIES = 80;

export interface WalletUsedEntry {
  address: string;
  lastUsedAt: number;
  useCount: number;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

function keyOf(addr: string): string {
  return addr.trim().toLowerCase();
}

function read(): WalletUsedEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is WalletUsedEntry =>
        x !== null &&
        typeof x === 'object' &&
        typeof (x as WalletUsedEntry).address === 'string' &&
        typeof (x as WalletUsedEntry).lastUsedAt === 'number' &&
        typeof (x as WalletUsedEntry).useCount === 'number'
    );
  } catch {
    return [];
  }
}

function write(items: WalletUsedEntry[]): void {
  if (!isBrowser()) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ENTRIES)));
}

/** Dernière utilisation en premier. */
export function getWalletsUsedHistory(): WalletUsedEntry[] {
  return [...read()].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export function recordWalletsUsed(addresses: string[]): WalletUsedEntry[] {
  if (!isBrowser() || addresses.length === 0) return getWalletsUsedHistory();
  const now = Date.now();
  const map = new Map<string, WalletUsedEntry>();
  for (const x of read()) {
    map.set(keyOf(x.address), { ...x });
  }
  for (const raw of addresses) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const k = keyOf(trimmed);
    const prev = map.get(k);
    if (prev) {
      map.set(k, {
        address: prev.address,
        lastUsedAt: now,
        useCount: prev.useCount + 1,
      });
    } else {
      map.set(k, { address: trimmed, lastUsedAt: now, useCount: 1 });
    }
  }
  const next = [...map.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_ENTRIES);
  write(next);
  return next;
}

export function clearWalletsUsedHistory(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function removeWalletUsedEntry(address: string): WalletUsedEntry[] {
  const k = keyOf(address);
  const next = read().filter((x) => keyOf(x.address) !== k);
  write(next);
  return getWalletsUsedHistory();
}
