'use client';

import { forwardRef } from 'react';
import SonarMark from '@/components/icons/SonarMark';
import { APP_NAME, APP_NAME_LOWER } from '@/lib/brand';
import { formatPercent, formatRangeLabel, formatSol, formatUsd, shortAddress } from '@/lib/pnl/format';
import type { PnlCardViewProps } from '@/components/pnl/PnlCard';
import type { PnlElementKey } from '@/types/pnl';

const POSITIVE = '#22c55e';

/** Ajoute un « + » explicite devant un montant positif déjà formaté. */
function withSign(formatted: string, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return formatted;
  return value >= 0 ? `+${formatted}` : formatted;
}

/** Choisit noir/blanc pour rester lisible par-dessus une couleur de fond donnée. */
function contrastText(hex: string): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Luminance relative perçue (approx.).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#000000' : '#ffffff';
}

/**
 * Carte PNL façon « Axiom referral card » : image plein cadre, hero PNL dans un
 * bloc coloré, lignes pilotées par les éléments sélectionnés, marque {APP_NAME}.
 */
const PnlCardAxiom = forwardRef<HTMLDivElement, PnlCardViewProps>(function PnlCardAxiom(
  { data, settings, backgroundImageData, walletLabel },
  ref
) {
  const { pnl, balance } = data;
  const show = (key: PnlElementKey) => settings.visibleElements[key];

  // Hero : PNL réalisé. Primaire = SOL si demandé, sinon USD ; USD en secondaire si les deux.
  const realizedUsd = pnl.realizedUsd;
  const realizedSol = pnl.realizedSol;
  const showRealizedSol = show('realizedSol') && realizedSol !== null;
  const showRealizedUsd = show('realizedUsd');
  const showRealized = showRealizedSol || showRealizedUsd;
  const heroValue = showRealizedSol ? realizedSol : realizedUsd;
  const heroText = withSign(showRealizedSol ? formatSol(realizedSol) : formatUsd(realizedUsd), heroValue);
  const secondaryRealized = showRealizedSol && showRealizedUsd ? formatUsd(realizedUsd) : null;

  // Lignes de stats : uniquement ce que l'utilisateur choisit d'afficher.
  const rows: { key: PnlElementKey; label: string; value: string; color?: string }[] = [];
  if (show('unrealized'))
    rows.push({ key: 'unrealized', label: 'PNL latent', value: formatUsd(pnl.unrealizedUsd) });
  if (show('winRate'))
    rows.push({
      key: 'winRate',
      label: 'Winrate',
      value: formatPercent(pnl.winRatePercent),
      color: pnl.winRatePercent === null ? undefined : POSITIVE,
    });
  if (show('bought')) rows.push({ key: 'bought', label: 'Acheté', value: formatUsd(pnl.boughtUsd) });
  if (show('sold')) rows.push({ key: 'sold', label: 'Vendu', value: formatUsd(pnl.soldUsd) });
  if (show('balanceSol'))
    rows.push({ key: 'balanceSol', label: 'Balance', value: formatSol(balance?.sol ?? null) });
  if (show('balanceUsd'))
    rows.push({ key: 'balanceUsd', label: 'Balance USD', value: formatUsd(balance?.valueUsd ?? null) });

  const name = show('walletLabel') ? walletLabel : null;
  const address = show('walletAddress') ? shortAddress(data.walletAddress) : null;
  const rangeLabel = formatRangeLabel(data.fromMs, data.toMs);
  const heroTextColor = contrastText(settings.accentColor);

  return (
    <div
      ref={ref}
      className="relative flex aspect-840/520 w-full max-w-[600px] flex-col overflow-hidden p-6 shadow-lg"
      style={{
        color: settings.textColor,
        fontFamily: settings.fontFamily,
        fontWeight: settings.fontWeight,
        backgroundColor: backgroundImageData ? undefined : '#0b0b0f',
        backgroundImage: backgroundImageData ? `url(${backgroundImageData})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Scrim diagonal (gauche → droite) pour garder le texte lisible sur l'image. */}
      {backgroundImageData && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(105deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.28) 44%, rgba(0,0,0,0) 72%)',
          }}
        />
      )}

      {/* Header : logo optionnel à gauche, wordmark à droite. Couleur = marque. */}
      <header className="relative z-10 flex items-start justify-between gap-2" style={{ color: settings.brandColor }}>
        {settings.showLogo ? (
          <SonarMark color={settings.logoColor} className="size-9 shrink-0" />
        ) : (
          <span />
        )}
        <div className="text-right">
          <p className="text-lg tracking-[0.2em]">{APP_NAME.toUpperCase()}</p>
          {show('dateRange') && <p className="text-[11px] opacity-70">{rangeLabel}</p>}
        </div>
      </header>

      {/* Corps : nom + hero PNL + stats */}
      <div
        className="relative z-10 flex flex-1 flex-col justify-center gap-3 py-4"
        style={{ textShadow: '0 1px 10px rgba(0,0,0,0.4)' }}
      >
        {name && <p className="truncate text-3xl tracking-tight">{name}</p>}
        {address && <p className="truncate font-mono text-xs opacity-70">{address}</p>}

        {showRealized && (
          <div>
            <div
              className="inline-flex w-fit max-w-full items-center px-4 py-2"
              style={{ backgroundColor: settings.accentColor }}
            >
              <span
                className="whitespace-nowrap text-[2.6rem] leading-none tracking-tight"
                style={{ color: heroTextColor }}
              >
                {heroText}
              </span>
            </div>
            {secondaryRealized && (
              <p className="mt-1 text-base opacity-80">{secondaryRealized}</p>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <dl className="mt-1 space-y-1">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center gap-6 text-lg">
                <dt className="w-24 opacity-90">{r.label}</dt>
                <dd className="tabular-nums" style={r.color ? { color: r.color } : undefined}>
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* Footer : marque + tagline. Couleur = marque. */}
      <footer
        className="relative z-10 flex items-center justify-between gap-3 text-sm opacity-80"
        style={{ color: settings.brandColor }}
      >
        <span className="truncate">{APP_NAME_LOWER} · Solana PNL</span>
      </footer>
    </div>
  );
});

export default PnlCardAxiom;
