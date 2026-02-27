export type WalletType = 'exchange' | 'mother' | 'simple';

export interface Rugger {
  id: string;
  name: string | null;
  description: string | null;
  walletAddress: string;
  walletType: WalletType;
  volumeMin: number | null;
  volumeMax: number | null;
  createdAt: string;
  tokenCount: number;
  avgMaxGainPercent: number;
}

