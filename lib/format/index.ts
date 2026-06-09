/**
 * Formatters partagés (nombres, SOL, %, USD, adresses). Source unique : ne pas
 * réimplémenter inline dans les composants. Les helpers PNL-cards spécifiques
 * (date-fns/fr) restent dans `lib/pnl/format.ts`.
 */

/** Tronque une adresse Solana : `lead` premiers … `tail` derniers. */
export function truncateAddress(addr: string, lead = 6, tail = 6): string {
  if (!addr) return '';
  if (addr.length <= lead + tail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

/** Nombre localisé (en-US par défaut, cohérent avec les PNL cards). */
export function formatNumber(
  value: number | null | undefined,
  maximumFractionDigits = 2,
  locale = 'en-US'
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(locale, { maximumFractionDigits });
}

export function formatSol(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 3 })} SOL`;
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Parse une date locale au format `yyyy-mm-dd` (sélecteurs de date). */
export function parseYyyyMmDd(value: string): Date | undefined {
  if (value.trim() === '') return undefined;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parts) return undefined;
  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Formate une date locale en `yyyy-mm-dd`. */
export function formatYyyyMmDd(date?: Date): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
