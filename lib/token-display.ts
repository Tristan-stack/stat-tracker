import type { Token } from '@/types/token';

/** Libellé affiché (symbole) ou repli sur le mint (cartes, titres). */
export function getTokenDisplayLabel(t: Pick<Token, 'name' | 'tokenName'>): string {
  const label = t.tokenName?.trim();
  if (label) return label;
  return t.name;
}

/** Colonne « Nom » du tableau : uniquement le libellé importé / saisi, sinon tiret. */
export function getTokenTableNameCell(t: Pick<Token, 'tokenName'>): string {
  const label = t.tokenName?.trim();
  return label ?? '—';
}

/** Adresse mint à copier : priorité à `tokenAddress`, sinon `name` (mint stocké en base). */
export function getTokenMintAddress(t: Pick<Token, 'name' | 'tokenAddress'>): string {
  const a = t.tokenAddress?.trim();
  if (a) return a;
  return t.name.trim();
}

export function formatMintShort(mint: string): string {
  const s = mint.trim();
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
