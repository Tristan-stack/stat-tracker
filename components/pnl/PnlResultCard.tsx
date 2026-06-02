'use client';

import { useRef } from 'react';
import PnlCard from '@/components/pnl/PnlCard';
import PnlExportButton from '@/components/pnl/PnlExportButton';
import type { DominantColor } from '@/lib/pnl/extract-dominant-color';
import type { PnlCardSettings, PnlComputeResponse } from '@/types/pnl';

interface PnlResultCardProps {
  data: PnlComputeResponse;
  settings: PnlCardSettings;
  backgroundImageData: string | null;
  walletLabel: string | null;
  dominantColor: DominantColor | null;
}

function safeFileName(label: string | null, address: string): string {
  const base = (label ?? address).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'wallet';
  return `pnl-${base}.png`;
}

export default function PnlResultCard({
  data,
  settings,
  backgroundImageData,
  walletLabel,
  dominantColor,
}: PnlResultCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-2">
      <PnlCard
        ref={cardRef}
        data={data}
        settings={settings}
        backgroundImageData={backgroundImageData}
        walletLabel={walletLabel}
        dominantColor={dominantColor}
      />
      <div className="flex items-center justify-between gap-2">
        {data.warnings.length > 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">{data.warnings[0]}</p>
        ) : (
          <span className="text-xs text-muted-foreground">
            {data.pnl.source === 'gmgn_stats'
              ? 'Source : GMGN stats'
              : data.pnl.source === 'balance_delta'
                ? 'Source : delta de balance (Helius)'
                : 'Source : activité GMGN'}
          </span>
        )}
        <PnlExportButton nodeRef={cardRef} fileName={safeFileName(walletLabel, data.walletAddress)} />
      </div>
    </div>
  );
}
