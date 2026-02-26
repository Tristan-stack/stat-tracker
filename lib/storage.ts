import type { Token } from '@/types/token';

const STORAGE_KEY = 'stattracker-tokens';

export function getStoredTokens(): Token[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Token =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Token).id === 'string' &&
        typeof (item as Token).name === 'string' &&
        typeof (item as Token).entryPrice === 'number' &&
        typeof (item as Token).high === 'number' &&
        typeof (item as Token).low === 'number' &&
        typeof (item as Token).targetExitPercent === 'number'
    );
  } catch {
    return [];
  }
}

export function saveTokens(tokens: Token[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // ignore storage errors
  }
}
