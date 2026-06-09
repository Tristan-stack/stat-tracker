'use client';

export interface FirstBuyStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

function formatFirstBuyStatValue(v: number, unit: 'usd' | 'sol'): string {
  if (unit === 'usd') {
    return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  }
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} SOL`;
}

interface FirstBuyStatsStripProps {
  stats: FirstBuyStats | null;
  unit: 'usd' | 'sol';
  isLoading: boolean;
}

export function FirstBuyStatsStrip({ stats, unit, isLoading }: FirstBuyStatsStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-teal-500/25 bg-teal-500/10 px-4 py-2 text-xs dark:bg-teal-950/30">
      <span className="font-semibold text-foreground">1er achat</span>
      <span className="text-muted-foreground">(stats, hors masqués)</span>
      <span className="rounded bg-background/80 px-1.5 py-0.5 font-medium text-muted-foreground">
        {unit === 'usd' ? 'USD' : 'SOL'}
      </span>
      {isLoading ? (
        <span className="text-muted-foreground">Chargement…</span>
      ) : stats ? (
        <>
          <span className="tabular-nums text-muted-foreground">
            Min : <span className="font-medium text-foreground">{formatFirstBuyStatValue(stats.min, unit)}</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-muted-foreground">
            Max : <span className="font-medium text-foreground">{formatFirstBuyStatValue(stats.max, unit)}</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-muted-foreground">
            Moyenne : <span className="font-medium text-foreground">{formatFirstBuyStatValue(stats.avg, unit)}</span>
          </span>
          <span className="text-muted-foreground">
            ({stats.count} token{stats.count > 1 ? 's' : ''})
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">Aucun montant exploitable (mints ou données GMGN).</span>
      )}
    </div>
  );
}
