import {
  Eye,
  Footprints,
  Layers,
  Network,
  Send,
  ShieldAlert,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export type LandingFeature = {
  index: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  description: string;
  points: string[];
};

/** Les deux capacités phares, mises en avant en bandes éditoriales pleine largeur. */
export const HEADLINE_FEATURES: LandingFeature[] = [
  {
    index: '01',
    icon: ShieldAlert,
    title: 'Traque les ruggers',
    tagline: 'Avant qu’ils ne recommencent',
    description:
      'Identifie les wallets responsables des rugs, suis leurs nouveaux déploiements et reçois le signal avant le crash. La mémoire on-chain que le marché n’a pas.',
    points: [
      'Détection des wallets récidivistes',
      'Historique complet des tokens déployés',
      'Classement par premier achat et timing',
    ],
  },
  {
    index: '02',
    icon: Network,
    title: 'Cartographie les réseaux de wallets',
    tagline: 'Le graphe derrière le marché',
    description:
      'Remonte les chaînes de financement, relie les adresses entre elles et révèle les structures coordonnées invisibles à l’œil nu.',
    points: [
      'Funding chains & clusters d’adresses',
      'Comparaison de wallets côte à côte',
      'Variantes déobfusquées des adresses',
    ],
  },
];

/** Les capacités complémentaires, présentées en grille éditoriale. */
export const CAPABILITIES: LandingFeature[] = [
  {
    index: '03',
    icon: TrendingUp,
    title: 'PnL réel',
    tagline: 'Sans illusion',
    description:
      'Mesure la rentabilité par token et par période : entrée, plus haut, plus bas, objectif de sortie. Le vrai score, pas le ressenti.',
    points: [],
  },
  {
    index: '04',
    icon: Footprints,
    title: 'Address Tracer',
    tagline: 'Suis la piste',
    description:
      'Trace le parcours d’une adresse à travers les flux on-chain et reconstitue le chemin des fonds.',
    points: [],
  },
  {
    index: '05',
    icon: Send,
    title: 'Veille Telegram',
    tagline: 'Le signal, capturé',
    description:
      'Scrape et structure les appels Telegram pour transformer le bruit des channels en données exploitables.',
    points: [],
  },
  {
    index: '06',
    icon: Layers,
    title: 'Comparaison de wallets',
    tagline: 'Côte à côte',
    description:
      'Aligne plusieurs wallets sur une même grille et fais ressortir les patterns communs en un regard.',
    points: [],
  },
  {
    index: '07',
    icon: Eye,
    title: 'Watchlist',
    tagline: 'Garde un œil',
    description:
      'Surveille les adresses qui comptent et reste alerté de leurs mouvements en continu.',
    points: [],
  },
];

export type LandingStat = { value: string; label: string };

export const LANDING_STATS: LandingStat[] = [
  { value: '7', label: 'Modules d’analyse on-chain' },
  { value: '100%', label: 'Donnée Solana native' },
  { value: '∞', label: 'Wallets traçables' },
  { value: '0', label: 'Bruit superflu' },
];
