'use client';

import { forwardRef } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatPercent, formatSol, formatUsd, shortAddress } from '@/lib/pnl/format';
import type { PnlCardViewProps } from '@/components/pnl/PnlCard';
import type { PnlElementKey } from '@/types/pnl';

const FALLBACK_BASE = '#0f172a';

const PnlCardVertical = forwardRef<HTMLDivElement, PnlCardViewProps>(function PnlCardVertical(
  { data, settings, backgroundImageData, walletLabel, dominantColor },
  ref
) {
  const { pnl, balance } = data;
  const show = (key: PnlElementKey) => settings.visibleElements[key];

  const base = dominantColor?.base ?? FALLBACK_BASE;
  const panel = dominantColor?.panel ?? '#1e293b';
  const textColor = dominantColor?.textColor ?? settings.textColor;

  const realizedUsd = pnl.realizedUsd;
  const realizedSol = pnl.realizedSol;
  const isPositive = (realizedSol ?? realizedUsd ?? 0) >= 0;
  const showRealizedSol = show('realizedSol') && realizedSol !== null;
  const showRealizedUsd = show('realizedUsd');
  const showRealized = showRealizedSol || showRealizedUsd;
  const primaryRealized = showRealizedSol ? formatSol(realizedSol) : formatUsd(realizedUsd);
  const secondaryRealized = showRealizedSol && showRealizedUsd ? formatUsd(realizedUsd) : null;

  const rangeLabel = `${format(data.fromMs, 'd MMM', { locale: fr })} — ${format(data.toMs, 'd MMM yyyy', { locale: fr })}`;

  const stats: { key: PnlElementKey; label: string; value: string }[] = [];
  if (show('unrealized')) stats.push({ key: 'unrealized', label: 'PNL latent', value: formatUsd(pnl.unrealizedUsd) });
  if (show('winRate')) stats.push({ key: 'winRate', label: 'Winrate', value: formatPercent(pnl.winRatePercent) });
  if (show('bought')) stats.push({ key: 'bought', label: 'Acheté', value: formatUsd(pnl.boughtUsd) });
  if (show('sold')) stats.push({ key: 'sold', label: 'Vendu', value: formatUsd(pnl.soldUsd) });
  if (show('balanceSol')) stats.push({ key: 'balanceSol', label: 'Balance', value: formatSol(balance?.sol ?? null) });
  if (show('balanceUsd')) stats.push({ key: 'balanceUsd', label: 'Balance USD', value: formatUsd(balance?.valueUsd ?? null) });

  return (
    <div
      ref={ref}
      className="flex aspect-[5/7] w-full max-w-[420px] flex-col gap-3 overflow-hidden rounded-2xl p-4 shadow-lg"
      style={{ backgroundColor: base, color: textColor, fontFamily: settings.fontFamily }}
    >
      {/* En-tête léger : période */}
      <div className="flex items-center justify-between text-xs font-medium opacity-80">
        <span className="uppercase tracking-wide">PNL</span>
        {show('dateRange') && <span>{rangeLabel}</span>}
      </div>

      {/* Image centrée */}
      <div
        className="flex flex-1 items-center justify-center overflow-hidden rounded-xl"
        style={{ backgroundColor: panel }}
      >
        {backgroundImageData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundImageData}
            alt=""
            className="max-h-full max-w-full object-contain"
            style={{ imageRendering: 'auto' }}
          />
        ) : (
          <span className="px-4 text-center text-xs opacity-60">
            Upload une image de fond pour la carte verticale
          </span>
        )}
      </div>

      {/* Bloc d'infos */}
      <div className="rounded-xl p-4" style={{ backgroundColor: panel }}>
        {show('walletLabel') && walletLabel && (
          <p className="truncate text-xl font-extrabold leading-tight">{walletLabel}</p>
        )}
        {show('walletAddress') && (
          <p className="truncate font-mono text-[11px] opacity-70">{shortAddress(data.walletAddress)}</p>
        )}

        {showRealized && (
          <div className="mt-2">
            <p
              className="text-3xl font-extrabold tracking-tight"
              style={{ color: isPositive ? '#22c55e' : '#ef4444' }}
            >
              {primaryRealized}
            </p>
            {secondaryRealized && <p className="text-base font-semibold opacity-90">{secondaryRealized}</p>}
          </div>
        )}

        {stats.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {stats.map((s) => (
              <div key={s.key} className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wide opacity-70">{s.label}</span>
                <span className="text-sm font-semibold tabular-nums">{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {!showRealized && stats.length === 0 && (
          <p className="text-xs opacity-70">Aucun élément sélectionné.</p>
        )}
      </div>
    </div>
  );
});

export default PnlCardVertical;
