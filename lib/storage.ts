import type { Token } from '@/types/token';

const STORAGE_KEY = 'stattracker-tokens';

export function getStoredTokens(): Token[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Token => {
      if (typeof item !== 'object' || item === null) return false;
      const t = item as Record<string, unknown>;
      if (
        typeof t.id !== 'string' ||
        typeof t.name !== 'string' ||
        typeof t.entryPrice !== 'number' ||
        typeof t.high !== 'number' ||
        typeof t.low !== 'number' ||
        typeof t.targetExitPercent !== 'number'
      ) {
        return false;
      }
      if (t.hidden !== undefined && typeof t.hidden !== 'boolean') return false;
      return true;
    });
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
