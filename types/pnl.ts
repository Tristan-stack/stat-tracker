/** Types du module PNL (onglet PNL : wallets sauvegardés + calcul PNL + PNL card). */

export interface PnlWallet {
  id: string;
  walletAddress: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PnlBackgroundMeta {
  id: string;
  name: string | null;
  createdAt: string;
}

export interface PnlBackground extends PnlBackgroundMeta {
  /** Data URL base64 (`data:image/...`). */
  imageData: string;
}

export interface PnlTokenBreakdown {
  mint: string;
  tokenName: string | null;
  boughtUsd: number;
  soldUsd: number;
  boughtSol: number;
  soldSol: number;
  realizedUsd: number | null;
  realizedSol: number | null;
  tradeCount: number;
}

export interface PnlResult {
  realizedUsd: number | null;
  realizedSol: number | null;
  /** Profit latent sur positions encore détenues (GMGN wallet_stats uniquement). */
  unrealizedUsd: number | null;
  boughtUsd: number;
  soldUsd: number;
  boughtSol: number;
  soldSol: number;
  tradeCount: number;
  tokenCount: number;
  winRatePercent: number | null;
  perToken: PnlTokenBreakdown[];
  /** true si la pagination GMGN a été tronquée (résultats partiels). */
  truncated: boolean;
  /** Origine du calcul : endpoint GMGN dédié ou agrégation d'activité. */
  source: 'gmgn_stats' | 'activity';
}

export interface PnlBalance {
  sol: number;
  lamports: number;
  solUsd: number | null;
  valueUsd: number | null;
}

export interface PnlComputeResponse {
  walletAddress: string;
  fromMs: number;
  toMs: number;
  pnl: PnlResult;
  balance: PnlBalance | null;
  solUsd: number | null;
  warnings: string[];
}

export type PnlRangePreset = '1d' | '7d' | '30d' | 'custom';

export type PnlElementKey =
  | 'realizedUsd'
  | 'realizedSol'
  | 'unrealized'
  | 'winRate'
  | 'bought'
  | 'sold'
  | 'balanceSol'
  | 'balanceUsd'
  | 'walletLabel'
  | 'walletAddress'
  | 'dateRange';

export type PnlCardOrientation = 'horizontal' | 'vertical';

export interface PnlCardSettings {
  orientation: PnlCardOrientation;
  textColor: string;
  fontFamily: string;
  visibleElements: Record<PnlElementKey, boolean>;
  selectedBackgroundId: string | null;
}
