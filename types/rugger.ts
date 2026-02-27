export type WalletType = 'exchange' | 'mother' | 'simple';

export interface Rugger {
  id: string;
  name: string | null;
  description: string | null;
  walletAddress: string;
  walletType: WalletType;
  createdAt: string;
  tokenCount: number;
  avgMaxGainPercent: number;
}

