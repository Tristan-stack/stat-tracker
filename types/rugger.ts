export type WalletType = 'exchange' | 'mother' | 'simple' | 'buyer';

export type StatusId = 'verification' | 'en_test' | 'actif';

export const STATUS_LABELS: Record<StatusId, string> = {
  verification: 'Vérification',
  en_test: 'En test',
  actif: 'Actif',
};

export const STATUS_ORDER: StatusId[] = ['verification', 'en_test', 'actif'];

// Achromatique « monopo » : le statut se lit au label + à l'escalier de gris
// (outline/clair = en attente → ink plein = actif), jamais à la teinte.
export const STATUS_BADGE_STYLES: Record<StatusId, string> = {
  verification: 'border border-border text-muted-foreground',
  en_test: 'bg-muted text-foreground',
  actif: 'bg-foreground text-background',
};

export const STATUS_FILTER_BUTTON_STYLES: Record<
  StatusId | 'all',
  { selected: string; unselected: string }
> = {
  all: {
    selected: 'bg-foreground text-background',
    unselected: 'border border-border text-muted-foreground hover:bg-muted',
  },
  verification: {
    selected: 'bg-foreground text-background',
    unselected: 'border border-border text-muted-foreground hover:bg-muted',
  },
  en_test: {
    selected: 'bg-foreground text-background',
    unselected: 'border border-border text-muted-foreground hover:bg-muted',
  },
  actif: {
    selected: 'bg-foreground text-background',
    unselected: 'border border-border text-muted-foreground hover:bg-muted',
  },
};

export const STATUS_DOT_CLASSES: Record<StatusId, string> = {
  verification: 'bg-smoke',
  en_test: 'bg-graphite',
  actif: 'bg-foreground',
};

export interface Rugger {
  id: string;
  name: string | null;
  description: string | null;
  walletAddress: string | null;
  walletType: WalletType;
  volumeMin: number | null;
  volumeMax: number | null;
  startHour: number | null;
  endHour: number | null;
  notes: string | null;
  statusId: StatusId;
  archived: boolean;
  createdAt: string;
  tokenCount: number;
  avgMaxGainPercent: number;
}

