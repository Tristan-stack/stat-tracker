'use client';

import { forwardRef } from 'react';
import PnlCardAxiom from '@/components/pnl/PnlCardAxiom';
import PnlCardHorizontal from '@/components/pnl/PnlCardHorizontal';
import PnlCardVertical from '@/components/pnl/PnlCardVertical';
import type { DominantColor } from '@/lib/pnl/extract-dominant-color';
import type { PnlCardSettings, PnlComputeResponse } from '@/types/pnl';

export interface PnlCardViewProps {
  data: PnlComputeResponse;
  settings: PnlCardSettings;
  backgroundImageData: string | null;
  walletLabel: string | null;
  /** Couleur dominante extraite de l'image (utilisée par la carte verticale). */
  dominantColor: DominantColor | null;
}

const PnlCard = forwardRef<HTMLDivElement, PnlCardViewProps>(function PnlCard(props, ref) {
  if (props.settings.cardStyle === 'axiom') {
    return <PnlCardAxiom ref={ref} {...props} />;
  }
  if (props.settings.orientation === 'vertical') {
    return <PnlCardVertical ref={ref} {...props} />;
  }
  return <PnlCardHorizontal ref={ref} {...props} />;
});

export default PnlCard;
