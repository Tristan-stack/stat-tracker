export type RuggerBuyerOrigin = 'manual' | 'watchlist' | 'analysis' | 'scraping';

export interface RuggerBuyerWallet {
  id: string;
  ruggerId: string;
  walletAddress: string;
  label: string | null;
  notes: string | null;
  origin: RuggerBuyerOrigin;
  createdAt: string;
  updatedAt: string;
}
