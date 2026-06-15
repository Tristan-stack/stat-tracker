/**
 * Statut « DEX payé » d'un token : le créateur a payé Dexscreener pour
 * l'Enhanced Token Info (au moins un order `approved` sur l'endpoint orders).
 */
export type DexPaidEntry = {
  /** true si Dexscreener a au moins un order approuvé pour ce mint. */
  paid: boolean;
  /** Types d'orders approuvés (ex. `tokenProfile`, `tokenAd`) — informatif. */
  approvedTypes?: string[];
  error?: string;
};
