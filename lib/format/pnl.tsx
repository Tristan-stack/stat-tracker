/**
 * Convention P&L achromatique « monopo saigon ».
 *
 * Décision design : aucune couleur sémantique (pas de vert/rouge). Le sens d'un
 * profit/perte se lit exclusivement au **signe +/−**, à la **flèche ▲▼** et au
 * **poids typo** (+ `tabular-nums`). Remplace les ternaires
 * `text-green-600 dark:text-green-400` / `text-red-600 …` des écrans data.
 *
 * Source unique : ne pas réimplémenter de coloration P&L inline dans les composants.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Flèche directionnelle achromatique : ▲ gain, ▼ perte, '' si nul/non fini. */
export function pnlArrow(value: number | null | undefined): '▲' | '▼' | '' {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '';
  return value > 0 ? '▲' : '▼';
}

export interface PnlValueProps {
  /** Valeur signée qui détermine la direction (gain ≥ 0 / perte < 0). */
  value: number | null | undefined;
  /** Contenu déjà formaté (la magnitude, généralement avec son signe). */
  children: ReactNode;
  /** Affiche la flèche ▲▼ devant la valeur (défaut : true). */
  arrow?: boolean;
  className?: string;
}

/**
 * Rend une valeur P&L selon la convention achromatique : flèche directionnelle
 * optionnelle + emphase typo, sans la moindre couleur. Le signe reste porté par
 * le texte formaté passé en `children`.
 */
export function PnlValue({ value, children, arrow = true, className }: PnlValueProps) {
  const glyph = arrow ? pnlArrow(value) : '';
  return (
    <span className={cn('font-semibold tabular-nums', className)}>
      {glyph && (
        <span aria-hidden className="mr-1 inline-block align-middle text-[0.7em]">
          {glyph}
        </span>
      )}
      {children}
    </span>
  );
}
