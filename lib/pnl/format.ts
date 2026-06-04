/** Formatage partagé des montants pour les PNL cards. */

import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Libellé de période pour la card. Affiche un seul jour quand la fenêtre
 * couvre une seule journée (preset « Jour précis »), sinon une plage.
 */
export function formatRangeLabel(fromMs: number, toMs: number): string {
  if (isSameDay(fromMs, toMs)) {
    return format(fromMs, 'd MMM yyyy', { locale: fr });
  }
  return `${format(fromMs, 'd MMM', { locale: fr })} — ${format(toMs, 'd MMM yyyy', { locale: fr })}`;
}

export function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function formatSol(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 3 })} SOL`;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

export function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}
