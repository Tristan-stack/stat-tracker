export type WalletType = 'exchange' | 'mother' | 'simple';

export type StatusId = 'verification' | 'en_test' | 'actif';

export const STATUS_LABELS: Record<StatusId, string> = {
  verification: 'Vérification',
  en_test: 'En test',
  actif: 'Actif',
};

export const STATUS_ORDER: StatusId[] = ['verification', 'en_test', 'actif'];

export const STATUS_BADGE_STYLES: Record<StatusId, string> = {
  verification: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  en_test: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  actif: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

export const STATUS_FILTER_BUTTON_STYLES: Record<
  StatusId | 'all',
  { selected: string; unselected: string }
> = {
  all: {
    selected: 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100',
    unselected: 'bg-muted text-muted-foreground hover:bg-muted/80',
  },
  verification: {
    selected: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    unselected:
      'border border-orange-300 text-orange-700 dark:border-orange-600 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30',
  },
  en_test: {
    selected: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    unselected:
      'border border-purple-300 text-purple-700 dark:border-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30',
  },
  actif: {
    selected: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    unselected:
      'border border-green-300 text-green-700 dark:border-green-600 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30',
  },
};

export const STATUS_DOT_CLASSES: Record<StatusId, string> = {
  verification: 'bg-orange-500 dark:bg-orange-400',
  en_test: 'bg-purple-500 dark:bg-purple-400',
  actif: 'bg-green-500 dark:bg-green-400',
};

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
  statusId: StatusId;
  archived: boolean;
  createdAt: string;
  tokenCount: number;
  avgMaxGainPercent: number;
}

