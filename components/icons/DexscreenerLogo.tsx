import { cn } from '@/lib/utils';

/**
 * Logo de marque Dexscreener (couleur officielle) — utilisé comme indicateur
 * « DEX payé » dans les tables de tokens. Exception chromatique assumée au
 * parti pris achromatique « monopo » (décision produit : on veut le vrai logo).
 *
 * Asset officiel hébergé par Dexscreener. Pour retirer la dépendance réseau,
 * remplacer par un SVG local dans `public/` plus tard.
 */
export function DexscreenerLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- petit logo de marque externe, pas d'optimisation next/image souhaitée
    <img
      src="https://dexscreener.com/favicon.png"
      alt="Dexscreener — DEX payé"
      className={cn('inline-block size-4 shrink-0 rounded-[3px] object-contain', className)}
      loading="lazy"
      decoding="async"
    />
  );
}
