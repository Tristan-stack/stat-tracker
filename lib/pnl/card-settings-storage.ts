import type { PnlCardSettings, PnlElementKey } from '@/types/pnl';

const STORAGE_KEY = 'stattracker-pnl-card-settings';

export const PNL_ELEMENT_KEYS: PnlElementKey[] = [
  'realizedUsd',
  'realizedSol',
  'unrealized',
  'winRate',
  'bought',
  'sold',
  'balanceSol',
  'balanceUsd',
  'walletLabel',
  'walletAddress',
  'dateRange',
];

export const PNL_ELEMENT_LABELS: Record<PnlElementKey, string> = {
  realizedUsd: 'PNL réalisé (USD)',
  realizedSol: 'PNL réalisé (SOL)',
  unrealized: 'PNL latent (USD)',
  winRate: 'Winrate',
  bought: 'Total acheté',
  sold: 'Total vendu',
  balanceSol: 'Balance (SOL)',
  balanceUsd: 'Balance (USD)',
  walletLabel: 'Nom du wallet',
  walletAddress: 'Adresse du wallet',
  dateRange: 'Période',
};

export const PNL_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Système', value: 'system-ui, sans-serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Monospace', value: 'ui-monospace, monospace' },
  { label: 'Georgia (serif)', value: 'Georgia, serif' },
  { label: 'Impact', value: 'Impact, sans-serif' },
];

export const PNL_FONT_WEIGHT_OPTIONS: { label: string; value: number }[] = [
  { label: 'Léger', value: 400 },
  { label: 'Normal', value: 500 },
  { label: 'Semi-gras', value: 600 },
  { label: 'Gras', value: 700 },
  { label: 'Extra-gras', value: 800 },
  { label: 'Black', value: 900 },
];

export const DEFAULT_PNL_CARD_SETTINGS: PnlCardSettings = {
  orientation: 'horizontal',
  cardStyle: 'classic',
  textColor: '#ffffff',
  accentColor: '#000000',
  fontWeight: 700,
  showLogo: true,
  logoColor: '#ffffff',
  brandColor: '#ffffff',
  fontFamily: 'system-ui, sans-serif',
  selectedBackgroundId: null,
  visibleElements: {
    realizedUsd: true,
    realizedSol: false,
    unrealized: false,
    winRate: true,
    bought: false,
    sold: false,
    balanceSol: true,
    balanceUsd: true,
    walletLabel: true,
    walletAddress: false,
    dateRange: true,
  },
};

function isValidSettings(value: unknown): value is PnlCardSettings {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.textColor === 'string' &&
    typeof s.fontFamily === 'string' &&
    typeof s.visibleElements === 'object' &&
    s.visibleElements !== null
  );
}

export function getPnlCardSettings(): PnlCardSettings {
  if (typeof window === 'undefined') return DEFAULT_PNL_CARD_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_PNL_CARD_SETTINGS;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSettings(parsed)) return DEFAULT_PNL_CARD_SETTINGS;
    // Fusionne pour combler les clés d'éléments ajoutées après coup.
    return {
      orientation: parsed.orientation === 'vertical' ? 'vertical' : 'horizontal',
      cardStyle: parsed.cardStyle === 'axiom' ? 'axiom' : 'classic',
      textColor: parsed.textColor,
      accentColor:
        typeof parsed.accentColor === 'string'
          ? parsed.accentColor
          : DEFAULT_PNL_CARD_SETTINGS.accentColor,
      fontWeight:
        typeof parsed.fontWeight === 'number'
          ? parsed.fontWeight
          : DEFAULT_PNL_CARD_SETTINGS.fontWeight,
      showLogo:
        typeof parsed.showLogo === 'boolean'
          ? parsed.showLogo
          : DEFAULT_PNL_CARD_SETTINGS.showLogo,
      logoColor:
        typeof parsed.logoColor === 'string'
          ? parsed.logoColor
          : DEFAULT_PNL_CARD_SETTINGS.logoColor,
      brandColor:
        typeof parsed.brandColor === 'string'
          ? parsed.brandColor
          : DEFAULT_PNL_CARD_SETTINGS.brandColor,
      fontFamily: parsed.fontFamily,
      selectedBackgroundId:
        typeof parsed.selectedBackgroundId === 'string' ? parsed.selectedBackgroundId : null,
      visibleElements: {
        ...DEFAULT_PNL_CARD_SETTINGS.visibleElements,
        ...parsed.visibleElements,
      },
    };
  } catch {
    return DEFAULT_PNL_CARD_SETTINGS;
  }
}

export function savePnlCardSettings(settings: PnlCardSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}
