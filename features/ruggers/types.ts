/** Ligne de prévisualisation d'un achat GMGN avant ajout au rugger. */
export interface GmgnPreviewRow {
  rowKey: string;
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  truncatedKlines: boolean;
  entryStr: string;
  highStr: string;
  lowStr: string;
  /** Minutes entrée → creux (API token-tracking). */
  entryToLowMinutes?: number | null;
  sourceWallet?: string;
}

/** Réponse brute d'un achat GMGN (avant formatage en `GmgnPreviewRow`). */
export interface GmgnPurchasePreview {
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  entryPrice: number;
  high: number;
  low: number;
  truncatedKlines: boolean;
  entryToLowMinutes?: number | null;
  sourceWallet?: string;
}
