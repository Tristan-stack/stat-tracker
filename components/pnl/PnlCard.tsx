'use client';

import { forwardRef } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { PnlCardSettings, PnlComputeResponse, PnlElementKey } from '@/types/pnl';

interface PnlCardProps {
  data: PnlComputeResponse;
  settings: PnlCardSettings;
  backgroundImageData: string | null;
  walletLabel: string | null;
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatSol(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 3 })} SOL`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

const PnlCard = forwardRef<HTMLDivElement, PnlCardProps>(function PnlCard(
  { data, settings, backgroundImageData, walletLabel },
  ref
) {
  const { pnl, balance } = data;
  const show = (key: PnlElementKey) => settings.visibleElements[key];

  const realizedUsd = pnl.realizedUsd;
  const realizedSol = pnl.realizedSol;
  const isPositive = (realizedSol ?? realizedUsd ?? 0) >= 0;

  // Bloc PNL mis en avant : SOL en gros (si dispo) + USD en secondaire.
  const showRealizedSol = show('realizedSol') && realizedSol !== null;
  const showRealizedUsd = show('realizedUsd');
  const showRealized = showRealizedSol || showRealizedUsd;
  const primaryRealized = showRealizedSol ? formatSol(realizedSol) : formatUsd(realizedUsd);
  const secondaryRealized = showRealizedSol && showRealizedUsd ? formatUsd(realizedUsd) : null;

  const rangeLabel = `${format(data.fromMs, 'd MMM', { locale: fr })} — ${format(data.toMs, 'd MMM yyyy', { locale: fr })}`;

  const rows: { key: PnlElementKey; label: string; value: string; emphasis?: boolean; positive?: boolean }[] = [];
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

export default PnlCard;
