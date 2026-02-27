export type WalletType = 'exchange' | 'mother' | 'simple';

export interface Rugger {
  id: string;
  name: string | null;
  description: string | null;
  walletAddress: string;
  walletType: WalletType;
  volumeMin: number | null;
  volumeMax: number | null;
  startHour: number | null;
  endHour: number | null;
  notes: string | null;
  createdAt: string;
  tokenCount: number;
  avgMaxGainPercent: number;
}

