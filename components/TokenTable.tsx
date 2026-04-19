'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TokenWithMetrics, ExitMode } from '@/types/token';
import { STATUS_DOT_CLASSES } from '@/types/rugger';
import { Eye, EyeOff, RefreshCcw, Trash2 } from 'lucide-react';
import { isMigrationPeakMcap, MIGRATION_MCAP_THRESHOLD, type MigrationView } from '@/lib/migration';
import { cn } from '@/lib/utils';
import { formatMintShort, getTokenMintAddress, getTokenTableNameCell } from '@/lib/token-display';
import type { FirstBuyPreviewEntry } from '@/types/first-buy-preview';

function formatNum(value: number, decimals = 2): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNum(value, 2)} %`;
}

function formatPurchaseDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function percentToMcap(entryPrice: number, targetPercent: number): number {
  return entryPrice * (1 + targetPercent / 100);
}

function mcapToPercent(entryPrice: number, targetMcap: number): number {
  return ((targetMcap / entryPrice) - 1) * 100;
}

/** Token importé via GMGN (mint Solana renseigné). */
function isGmgnImportedToken(t: Pick<TokenWithMetrics, 'tokenAddress'>): boolean {
  return Boolean(t.tokenAddress?.trim());
}

/** Données incomplètes : pas de date d’achat, ou high/low encore plats comme l’entrée (klines manquants). */
export function tokenRowHasMissingImportData(t: TokenWithMetrics): boolean {
  if (!isGmgnImportedToken(t)) return false;
  if (!t.purchasedAt?.trim()) return true;
  const e = t.entryPrice;
  if (e <= 0) return false;
  const tol = Math.max(1e-12, Math.abs(e) * 1e-9);
  const flatHigh = Math.abs(t.high - e) <= tol;
  const flatLow = Math.abs(t.low - e) <= tol;
  return flatHigh && flatLow;
}

function InlineNumericInput({
  value,
  onChange,
  suffix,
  min,
  className: inputClassName,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  min?: number;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const commit = () => {
    const normalized = localValue.trim().replace(',', '.');
    const n = Number(normalized);
    const floor = min ?? 0;
    if (Number.isFinite(n) && n >= floor && n !== value) {
      onChange(n);
    } else {
      setLocalValue(String(value));
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        type="text"
        inputMode="decimal"
        className={cn(
          'h-8 rounded-md border border-input bg-background px-2 text-right text-xs tabular-nums',
          inputClassName ?? 'w-20'
        )}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function McapTargetInput({
  entryPrice,
  targetPercent,
  onChangeTarget,
}: {
  entryPrice: number;
  targetPercent: number;
  onChangeTarget: (nextPercent: number) => void;
}) {
  const derivedMcap = percentToMcap(entryPrice, targetPercent);
  const [localValue, setLocalValue] = useState(String(Math.round(derivedMcap)));

  useEffect(() => {
    setLocalValue(String(Math.round(percentToMcap(entryPrice, targetPercent))));
  }, [entryPrice, targetPercent]);

  const commit = () => {
    const normalized = localValue.trim().replace(',', '.');
    const n = Number(normalized);
    if (Number.isFinite(n) && n > 0 && entryPrice > 0) {
      const newPercent = mcapToPercent(entryPrice, n);
      const rounded = Math.round(newPercent * 100) / 100;
      if (rounded !== targetPercent) {
        onChangeTarget(rounded);
        return;
      }
    }
    setLocalValue(String(Math.round(derivedMcap)));
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-xs tabular-nums"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
    />
  );
}

function formatFirstBuyCell(
  unit: 'usd' | 'sol',
  entry: FirstBuyPreviewEntry | undefined,
  isLoading: boolean,
  hasMint: boolean
): ReactNode {
  if (!hasMint) return '—';
  if (isLoading && entry === undefined) return '…';
  if (!entry) return '—';
  const v = unit === 'usd' ? entry.usd : entry.sol;
  if (v === null || !Number.isFinite(v)) {
    const hint = entry.error ?? 'Donnée indisponible';
    return (
      <span className="text-muted-foreground" title={hint}>
        —
      </span>
    );
  }
  if (unit === 'usd') {
    return (
      <span className="tabular-nums">
        {v.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: 0 })} $
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {v.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} SOL
    </span>
  );
}

export interface TokenTableProps {
  tokens: TokenWithMetrics[];
  onChangeTarget: (id: string, nextPercent: number) => void;
  onChangeEntryPrice: (id: string, nextPrice: number) => void;
  onRefreshToken?: (token: TokenWithMetrics) => void;
  refreshingTokenIds?: Set<string>;
  onDeleteToken?: (id: string) => void;
  /** Si absent, la colonne visibilité n’est pas affichée (ex. page rugger). */
  onToggleHidden?: (id: string) => void;
  /** Filtre migration piloté par le parent (pagination serveur). */
  migrationView?: MigrationView;
  onMigrationViewChange?: (view: MigrationView) => void;
  /** Total migrations connues (liste complète). Sinon dérivé des `tokens` passés. */
  migrationKnownCount?: number;
  /** Colonne « 1er achat » GMGN (rugger type acheteur). */
  firstBuyColumn?: {
    unit: 'usd' | 'sol';
    onUnitChange: (unit: 'usd' | 'sol') => void;
    byMint: Record<string, FirstBuyPreviewEntry>;
    isLoading: boolean;
  };
}

export function TokenTable({
  tokens,
  onChangeTarget,
  onChangeEntryPrice,
  onRefreshToken,
  refreshingTokenIds,
  onDeleteToken,
  onToggleHidden,
  migrationView: migrationViewProp,
  onMigrationViewChange,
  migrationKnownCount,
  firstBuyColumn,
}: TokenTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exitMode, setExitMode] = useState<ExitMode>('percent');
  const [localMigrationView, setLocalMigrationView] = useState<MigrationView>('all');

  const serverControlsMigration = onMigrationViewChange != null;
  const migrationView = serverControlsMigration ? (migrationViewProp ?? 'all') : localMigrationView;

  const setMigrationView = useCallback(
    (v: MigrationView) => {
      if (serverControlsMigration) onMigrationViewChange(v);
      else setLocalMigrationView(v);
    },
    [serverControlsMigration, onMigrationViewChange]
  );

  const derivedMigrationCount = useMemo(
    () => tokens.filter((t) => isMigrationPeakMcap(t.high)).length,
    [tokens]
  );
  const knownMigrationTotal = migrationKnownCount ?? derivedMigrationCount;

  const displayedTokens = useMemo(() => {
    if (serverControlsMigration) return tokens;
    if (migrationView === 'migrations') {
      return tokens.filter((t) => isMigrationPeakMcap(t.high));
    }
    return tokens;
  }, [serverControlsMigration, tokens, migrationView]);

  const handleCopyMint = useCallback(async (token: TokenWithMetrics) => {
    await navigator.clipboard.writeText(getTokenMintAddress(token));
    setCopiedId(token.id);
    setTimeout(() => setCopiedId((prev) => (prev === token.id ? null : prev)), 1500);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Objectif de sortie :</span>
        <div className="flex rounded-md border text-xs">
          <button
            type="button"
            onClick={() => setExitMode('percent')}
            className={cn(
              'px-3 py-1 rounded-l-md transition-colors font-medium',
              exitMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            % de gain
          </button>
          <button
            type="button"
            onClick={() => setExitMode('mcap')}
            className={cn(
              'px-3 py-1 rounded-r-md transition-colors font-medium',
              exitMode === 'mcap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            MCap cible
          </button>
        </div>
        <span className="text-xs text-muted-foreground">|</span>
        {firstBuyColumn && (
          <>
            <span className="text-xs font-medium text-muted-foreground">1er achat :</span>
            <div className="flex rounded-md border text-xs">
              <button
                type="button"
                onClick={() => firstBuyColumn.onUnitChange('usd')}
                className={cn(
                  'px-3 py-1 rounded-l-md transition-colors font-medium',
                  firstBuyColumn.unit === 'usd' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                USD
              </button>
              <button
                type="button"
                onClick={() => firstBuyColumn.onUnitChange('sol')}
                className={cn(
                  'px-3 py-1 rounded-r-md transition-colors font-medium border-l border-border',
                  firstBuyColumn.unit === 'sol' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                SOL
              </button>
            </div>
            <span className="text-xs text-muted-foreground">|</span>
          </>
        )}
        <span className="text-xs font-medium text-muted-foreground">Migration :</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border text-xs">
            <button
              type="button"
              onClick={() => setMigrationView('all')}
              className={cn(
                'px-3 py-1 rounded-l-md transition-colors font-medium',
                migrationView === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => setMigrationView('migrations')}
              className={cn(
                'px-3 py-1 rounded-r-md transition-colors font-medium',
                migrationView === 'migrations' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Migrations
            </button>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {knownMigrationTotal}{' '}
            {knownMigrationTotal === 1 ? 'migration connue' : 'migrations connues'}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border -mx-1 sm:mx-0">
        <table className="w-full min-w-[960px] text-xs sm:text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {onToggleHidden && (
                <th className="w-10 px-1 py-3 text-center font-medium sm:w-11 sm:px-2 sm:py-4">
                  <span className="sr-only">Visibilité stats</span>
                </th>
              )}
              <th className="px-3 py-3 text-left font-medium sm:px-5 sm:py-4">Nom</th>
              <th className="px-3 py-3 text-left font-medium sm:px-5 sm:py-4">Adresse</th>
              <th className="whitespace-nowrap px-2 py-3 text-left font-medium sm:px-3 sm:py-4">Achat</th>
              {firstBuyColumn && (
                <th className="whitespace-nowrap px-2 py-3 text-right font-medium sm:px-3 sm:py-4">1er achat</th>
              )}
              <th className="px-5 py-4 text-right font-medium">Entrée</th>
              <th className="px-5 py-4 text-right font-medium">Plus haut</th>
              <th className="px-3 py-4 text-center font-medium">Migration</th>
              <th className="px-5 py-4 text-right font-medium">Plus bas</th>
              <th className="px-5 py-4 text-right font-medium">
                {exitMode === 'percent' ? 'Objectif %' : 'Objectif MCap'}
              </th>
              <th className="px-5 py-4 text-right font-medium">Gain actuel</th>
              <th className="px-5 py-4 text-right font-medium">Gain max</th>
              <th className="px-5 py-4 text-right font-medium">Perte max</th>
              <th className="px-5 py-4 text-center font-medium">Objectif atteint</th>
              {(onDeleteToken || onRefreshToken) && <th className="px-3 py-4 text-center font-medium">Action</th>}
            </tr>
          </thead>
          <tbody>
            {displayedTokens.map((t) => (
              <tr
                key={t.id}
                className={cn(
                  'border-b last:border-0 hover:bg-muted/30',
                  t.hidden && 'opacity-60 text-muted-foreground',
                  tokenRowHasMissingImportData(t) &&
                    'border-l-4 border-l-red-500 bg-red-500/[0.06] dark:bg-red-500/10'
                )}
                title={
                  tokenRowHasMissingImportData(t)
                    ? 'Import GMGN : date ou plage high/low incomplète — vérifie les valeurs.'
                    : undefined
                }
              >
                {onToggleHidden && (
                  <td className="w-10 px-1 py-3 text-center align-middle sm:w-11 sm:px-2 sm:py-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-foreground hover:bg-muted"
                      aria-pressed={!t.hidden}
                      aria-label={
                        t.hidden
                          ? 'Inclure ce token dans les statistiques'
                          : 'Exclure ce token des statistiques'
                      }
                      title={
                        t.hidden
                          ? 'Inclure dans les statistiques'
                          : 'Exclure des statistiques'
                      }
                      onClick={() => onToggleHidden(t.id)}
                    >
                      {t.hidden ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </td>
                )}
                <td className="max-w-[120px] px-3 py-3 font-medium sm:max-w-[200px] sm:px-5 sm:py-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        t.statusId ? STATUS_DOT_CLASSES[t.statusId] : 'bg-muted-foreground/40'
                      )}
                      aria-hidden
                    />
                    <span className="truncate normal-case" title={getTokenTableNameCell(t)}>
                      {getTokenTableNameCell(t)}
                    </span>
                  </div>
                </td>
                <td className="max-w-[140px] px-3 py-3 font-mono text-[11px] sm:max-w-none sm:px-5 sm:py-4">
                  <button
                    type="button"
                    onClick={() => handleCopyMint(t)}
                    className="w-full truncate text-left hover:text-primary transition-colors"
                    title={`${getTokenMintAddress(t)} — cliquer pour copier`}
                  >
                    {copiedId === t.id ? '✓ Copié' : formatMintShort(getTokenMintAddress(t))}
                  </button>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-left text-muted-foreground tabular-nums sm:px-3 sm:py-4">
                  {formatPurchaseDate(t.purchasedAt)}
                </td>
                {firstBuyColumn && (
                  <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums sm:px-3 sm:py-4">
                    {formatFirstBuyCell(
                      firstBuyColumn.unit,
                      firstBuyColumn.byMint[getTokenMintAddress(t).trim()],
                      firstBuyColumn.isLoading,
                      getTokenMintAddress(t).trim() !== ''
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4">
                  <InlineNumericInput
                    value={t.entryPrice}
                    onChange={(n) => onChangeEntryPrice(t.id, n)}
                    min={0}
                    className="w-24"
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4">{formatNum(t.high)}</td>
                <td className="px-2 py-3 text-center align-middle sm:px-3 sm:py-4">
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold leading-none',
                      isMigrationPeakMcap(t.high)
                        ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                        : 'bg-muted text-muted-foreground'
                    )}
                    title={
                      isMigrationPeakMcap(t.high)
                        ? `MCap max ≥ ${MIGRATION_MCAP_THRESHOLD} (migration)`
                        : `MCap max < ${MIGRATION_MCAP_THRESHOLD}`
                    }
                  >
                    M
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4">{formatNum(t.low)}</td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {exitMode === 'percent' ? (
                    <InlineNumericInput
                      value={t.targetExitPercent}
                      onChange={(n) => onChangeTarget(t.id, n)}
                      suffix="%"
                    />
                  ) : (
                    <McapTargetInput
                      entryPrice={t.entryPrice}
                      targetPercent={t.targetExitPercent}
                      onChangeTarget={(n) => onChangeTarget(t.id, n)}
                    />
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-green-600 dark:text-green-400 sm:px-5 sm:py-4">{formatPercent(t.targetExitPercent)}</td>
                <td
                  className={`whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4 ${
                    t.maxGainPercent >= 0 ? 'text-green-600 dark:text-green-400' : ''
                  }`}
                >
                  {formatPercent(t.maxGainPercent)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4 ${
                    t.maxLossPercent <= 0 ? 'text-red-600 dark:text-red-400' : ''
                  }`}
                >
                  {formatPercent(t.maxLossPercent)}
                </td>
                <td className="px-3 py-3 text-center sm:px-5 sm:py-4">{t.targetReached ? 'Oui' : 'Non'}</td>
                {(onDeleteToken || onRefreshToken) && (
                  <td className="px-2 py-3 text-center sm:px-3 sm:py-4">
                    <div className="flex items-center justify-center gap-1">
                      {onRefreshToken && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => onRefreshToken(t)}
                          disabled={refreshingTokenIds?.has(t.id) === true}
                          aria-label="Rafraîchir les valeurs depuis GMGN"
                          title="Rafraîchir depuis GMGN (sans toucher l'entrée)"
                        >
                          <RefreshCcw
                            className={cn(
                              'h-4 w-4',
                              refreshingTokenIds?.has(t.id) && 'animate-spin'
                            )}
                          />
                        </Button>
                      )}
                      {onDeleteToken && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => onDeleteToken(t.id)}
                          aria-label="Supprimer le token"
                          title="Supprimer le token"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
