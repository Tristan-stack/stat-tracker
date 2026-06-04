'use client';

import { forwardRef } from 'react';
import { formatPercent, formatRangeLabel, formatSol, formatUsd, shortAddress } from '@/lib/pnl/format';
import type { PnlCardViewProps } from '@/components/pnl/PnlCard';
import type { PnlElementKey } from '@/types/pnl';

const PnlCardHorizontal = forwardRef<HTMLDivElement, PnlCardViewProps>(function PnlCardHorizontal(
  { data, settings, backgroundImageData, walletLabel },
  ref
) {
  const { pnl, balance } = data;
  const show = (key: PnlElementKey) => settings.visibleElements[key];

  const realizedUsd = pnl.realizedUsd;
  const realizedSol = pnl.realizedSol;
  const isPositive = (realizedSol ?? realizedUsd ?? 0) >= 0;

  const showRealizedSol = show('realizedSol') && realizedSol !== null;
  const showRealizedUsd = show('realizedUsd');
  const showRealized = showRealizedSol || showRealizedUsd;
  const primaryRealized = showRealizedSol ? formatSol(realizedSol) : formatUsd(realizedUsd);
  const secondaryRealized = showRealizedSol && showRealizedUsd ? formatUsd(realizedUsd) : null;

  const rangeLabel = formatRangeLabel(data.fromMs, data.toMs);

  const rows: { key: PnlElementKey; label: string; value: string }[] = [];
  if (show('unrealized'))
    rows.push({ key: 'unrealized', label: 'PNL latent', value: formatUsd(pnl.unrealizedUsd) });
  if (show('winRate')) rows.push({ key: 'winRate', label: 'Winrate', value: formatPercent(pnl.winRatePercent) });
  if (show('bought')) rows.push({ key: 'bought', label: 'Acheté', value: formatUsd(pnl.boughtUsd) });
  if (show('sold')) rows.push({ key: 'sold', label: 'Vendu', value: formatUsd(pnl.soldUsd) });
  if (show('balanceSol'))
    rows.push({ key: 'balanceSol', label: 'Balance', value: formatSol(balance?.sol ?? null) });
  if (show('balanceUsd'))
    rows.push({ key: 'balanceUsd', label: 'Balance (USD)', value: formatUsd(balance?.valueUsd ?? null) });

  return (
    <div
      ref={ref}
      className="relative flex aspect-[1200/630] w-full max-w-[600px] flex-col justify-between overflow-hidden rounded-xl p-6 shadow-lg"
      style={{
        color: settings.textColor,
        fontFamily: settings.fontFamily,
        backgroundColor: backgroundImageData ? undefined : '#0f172a',
        backgroundImage: backgroundImageData ? `url(${backgroundImageData})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Voile pour la lisibilité du texte sur l'image. */}
      {backgroundImageData && (
        <div className="pointer-events-none absolute inset-0 bg-black/30" aria-hidden />
      )}

      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {show('walletLabel') && walletLabel && (
            <p className="truncate text-lg font-bold">{walletLabel}</p>
          )}
          {show('walletAddress') && (
            <p className="truncate font-mono text-xs opacity-80">{shortAddress(data.walletAddress)}</p>
          )}
        </div>
        {show('dateRange') && <p className="shrink-0 text-xs opacity-80">{rangeLabel}</p>}
      </div>

      <div className="relative z-10 space-y-1.5">
        {showRealized && (
          <div className="mb-2">
            <p
              className="text-4xl font-extrabold tracking-tight"
              style={{ color: isPositive ? '#22c55e' : '#ef4444' }}
            >
              {primaryRealized}
            </p>
            {secondaryRealized && (
              <p className="text-lg font-semibold opacity-90">{secondaryRealized}</p>
            )}
          </div>
        )}
        {rows.map((r) => (
          <div key={r.key} className="flex items-baseline justify-between gap-4">
            <span className="text-sm opacity-80">{r.label}</span>
            <span className="text-base font-semibold tabular-nums">{r.value}</span>
          </div>
        ))}
        {!showRealized && rows.length === 0 && (
          <p className="text-sm opacity-70">Aucun élément sélectionné. Active des éléments dans la personnalisation.</p>
        )}
      </div>
    </div>
  );
});

export default PnlCardHorizontal;
