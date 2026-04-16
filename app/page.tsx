'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TokenTable } from '@/components/TokenTable';
import { StatsSummary } from '@/components/StatsSummary';
import { TokenImportExport } from '@/components/TokenImportExport';
import { CreateRuggerFromTokens } from '@/components/CreateRuggerFromTokens';
import GmgnTokenAddSection, { type GmgnPreviewRow } from '@/components/GmgnTokenAddSection';
import { parseGmgnDecimalString } from '@/lib/gmgn/price-rounding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { getStoredTokens, saveTokens } from '@/lib/storage';
import {
  compareTokensByPurchaseDateDesc,
  getPurchaseFilterLabel,
  tokenMatchesPurchaseFilter,
  type TokenPurchaseFilter,
} from '@/lib/token-date-filter';
import { getTokenWithMetrics } from '@/lib/token-calculations';
import type { Token, ExitMode } from '@/types/token';
import { cn } from '@/lib/utils';

const DEFAULT_GMGN_TARGET_PERCENT = 100;

function parseYyyyMmDdToDate(value: string): Date | undefined {
  if (value.trim() === '') return undefined;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parts) return undefined;
  const year = Number(parts[1]);
  const month = Number(parts[2]) - 1;
  const day = Number(parts[3]);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function formatDateToYyyyMmDd(date?: Date): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Home() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [tokenPurchaseFilter, setTokenPurchaseFilter] = useState<TokenPurchaseFilter>('all');
  const [tokenTableCustomFrom, setTokenTableCustomFrom] = useState('');
  const [tokenTableCustomTo, setTokenTableCustomTo] = useState('');
  const [tokenTablePickDay, setTokenTablePickDay] = useState('');

  useEffect(() => {
    const stored = getStoredTokens();
    const id = setTimeout(() => {
      setTokens(stored);
      setIsHydrated(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveTokens(tokens);
  }, [tokens, isHydrated]);

  const handleAdd = useCallback((token: Token) => {
    setTokens((prev) => [...prev, token]);
  }, []);

  const handleAddGmgnPurchases = useCallback((items: GmgnPreviewRow[]) => {
    if (items.length === 0) return false;
    const newTokens: Token[] = items.map((p) => {
      const entryPrice = parseGmgnDecimalString(p.entryStr);
      const high = parseGmgnDecimalString(p.highStr);
      const low = parseGmgnDecimalString(p.lowStr);
      return {
        id: crypto.randomUUID(),
        name: p.tokenAddress,
        tokenName: p.name,
        entryPrice: entryPrice > 0 ? entryPrice : 1e-12,
        high: high > 0 ? high : 1e-12,
        low: low > 0 ? low : 1e-12,
        targetExitPercent: DEFAULT_GMGN_TARGET_PERCENT,
        purchasedAt: p.purchasedAt,
        tokenAddress: p.tokenAddress,
      };
    });
    setTokens((prev) => [...prev, ...newTokens]);
    return true;
  }, []);

  const handleChangeTarget = useCallback((id: string, nextPercent: number) => {
    setTokens((prev) =>
      prev.map((token) =>
        token.id === id ? { ...token, targetExitPercent: nextPercent } : token
      )
    );
  }, []);

  const handleChangeEntryPrice = useCallback((id: string, nextPrice: number) => {
    setTokens((prev) =>
      prev.map((token) =>
        token.id === id ? { ...token, entryPrice: nextPrice } : token
      )
    );
  }, []);

  const handleToggleHidden = useCallback((id: string) => {
    setTokens((prev) =>
      prev.map((token) =>
        token.id === id ? { ...token, hidden: !token.hidden } : token
      )
    );
  }, []);

  const purchaseFilterOptions = useMemo(
    () => ({
      customFrom: tokenTableCustomFrom,
      customTo: tokenTableCustomTo,
      pickDay: tokenTablePickDay,
    }),
    [tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay]
  );

  const tokensOrderedByPurchase = useMemo(
    () => [...tokens].sort(compareTokensByPurchaseDateDesc),
    [tokens]
  );

  const tokensForTable = useMemo(
    () =>
      tokensOrderedByPurchase.filter((t) =>
        tokenMatchesPurchaseFilter(t, tokenPurchaseFilter, purchaseFilterOptions)
      ),
    [tokensOrderedByPurchase, tokenPurchaseFilter, purchaseFilterOptions]
  );

  const activeTokens = useMemo(
    () => tokensForTable.filter((t) => !t.hidden),
    [tokensForTable]
  );

  const allSameTargetPercent = useMemo(() => {
    if (tokens.length === 0) return null;
    const first = tokens[0].targetExitPercent;
    return tokens.every((t) => t.targetExitPercent === first) ? first : null;
  }, [tokens]);

  const [globalTargetPercent, setGlobalTargetPercent] = useState('');
  const [globalTargetMcap, setGlobalTargetMcap] = useState('');
  const [globalExitMode, setGlobalExitMode] = useState<ExitMode>('percent');
  const derivedGlobalTarget = allSameTargetPercent != null && globalTargetPercent === ''
    ? String(allSameTargetPercent)
    : globalTargetPercent;

  const handleApplyGlobalTarget = useCallback(() => {
    if (globalExitMode === 'mcap') {
      const mcap = Number(globalTargetMcap.replace(',', '.'));
      if (!Number.isFinite(mcap) || mcap <= 0) return;
      setTokens((prev) =>
        prev.map((t) =>
          t.entryPrice > 0
            ? { ...t, targetExitPercent: Math.round(((mcap / t.entryPrice) - 1) * 10000) / 100 }
            : t
        )
      );
    } else {
      const value = Number(derivedGlobalTarget.replace(',', '.'));
      if (!Number.isFinite(value)) return;
      setTokens((prev) => prev.map((t) => ({ ...t, targetExitPercent: value })));
    }
  }, [globalExitMode, derivedGlobalTarget, globalTargetMcap]);

  const tokensWithMetrics = tokensForTable.map(getTokenWithMetrics);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-12 p-6 py-10 sm:p-8 lg:py-14">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Suivi rentabilité tokens
            </h1>
            <p className="text-muted-foreground">
              Saisis ton entrée, le plus haut, le plus bas et ton objectif de sortie en %.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CreateRuggerFromTokens tokens={activeTokens} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTokens([]);
                setTokenPurchaseFilter('all');
              }}
              disabled={tokens.length === 0}
            >
              Reset les tokens
            </Button>
          </div>
        </header>

        <GmgnTokenAddSection
          knownTokens={tokens}
          onAddPurchases={handleAddGmgnPurchases}
          onManualAdd={handleAdd}
          addAllButtonLabel="Tout ajouter à la liste"
          headerActions={<TokenImportExport tokens={tokens} onImport={setTokens} />}
        />

        <StatsSummary tokens={activeTokens} />

        <section className="space-y-6">
          <h2 className="text-lg font-semibold">
            Tokens (
            {tokenPurchaseFilter === 'all' ? tokens.length : `${tokensForTable.length} / ${tokens.length}`}
            )
            {tokensForTable.length > 0 && activeTokens.length !== tokensForTable.length && (
              <span className="font-normal text-muted-foreground">
                {' '}
                — {activeTokens.length} actif{activeTokens.length !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          {tokens.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
              Aucun token. Utilise la section « Ajouter des tokens » ci-dessus (fetch GMGN ou saisie manuelle).
            </p>
          ) : tokensForTable.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
              Aucun token ne correspond à ce filtre de date d&apos;achat. Choisis « Tous » ou élargis la plage.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Date d&apos;achat :</span>
                  {(['all', 'today', 'yesterday', 'day', 'custom'] satisfies TokenPurchaseFilter[]).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => {
                        setTokenPurchaseFilter(period);
                        if (period === 'day') {
                          setTokenTablePickDay((prev) => prev || formatDateToYyyyMmDd(new Date()));
                        }
                      }}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        tokenPurchaseFilter === period
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      {getPurchaseFilterLabel(period)}
                    </button>
                  ))}
                </div>
                {tokenPurchaseFilter === 'day' && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-2">
                      <Label>Jour</Label>
                      <DatePicker
                        value={parseYyyyMmDdToDate(tokenTablePickDay)}
                        onChange={(date) => setTokenTablePickDay(formatDateToYyyyMmDd(date))}
                        placeholder="Choisir un jour"
                        className="w-[200px]"
                      />
                    </div>
                  </div>
                )}
                {tokenPurchaseFilter === 'custom' && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-2">
                      <Label>Du</Label>
                      <DatePicker
                        value={parseYyyyMmDdToDate(tokenTableCustomFrom)}
                        onChange={(date) => setTokenTableCustomFrom(formatDateToYyyyMmDd(date))}
                        placeholder="Date de début"
                        className="w-[200px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Au</Label>
                      <DatePicker
                        value={parseYyyyMmDdToDate(tokenTableCustomTo)}
                        onChange={(date) => setTokenTableCustomTo(formatDateToYyyyMmDd(date))}
                        placeholder="Date de fin"
                        className="w-[200px]"
                      />
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Liste triée par date d&apos;achat (plus récent en premier). Sans date renseignée, le token n&apos;apparaît que sous « Tous ».
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                <Label className="text-sm font-medium">Objectif commun</Label>
                <div className="flex rounded-md border text-xs">
                  <button
                    type="button"
                    onClick={() => setGlobalExitMode('percent')}
                    className={cn(
                      'px-2 py-0.5 rounded-l-md transition-colors font-medium',
                      globalExitMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setGlobalExitMode('mcap')}
                    className={cn(
                      'px-2 py-0.5 rounded-r-md transition-colors font-medium',
                      globalExitMode === 'mcap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    MCap
                  </button>
                </div>
                {globalExitMode === 'percent' ? (
                  <Input
                    id="global-target-percent"
                    type="text"
                    inputMode="decimal"
                    className="w-24"
                    value={derivedGlobalTarget}
                    onChange={(e) => setGlobalTargetPercent(e.target.value)}
                    placeholder="100"
                  />
                ) : (
                  <Input
                    id="global-target-mcap"
                    type="text"
                    inputMode="decimal"
                    className="w-32"
                    value={globalTargetMcap}
                    onChange={(e) => setGlobalTargetMcap(e.target.value)}
                    placeholder="500000"
                  />
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    globalExitMode === 'percent'
                      ? !Number.isFinite(Number(derivedGlobalTarget.replace(',', '.')))
                      : !Number.isFinite(Number(globalTargetMcap.replace(',', '.'))) || Number(globalTargetMcap.replace(',', '.')) <= 0
                  }
                  onClick={handleApplyGlobalTarget}
                >
                  Appliquer à tous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {globalExitMode === 'percent'
                    ? 'Applique le même % de sortie à tous les tokens.'
                    : 'Calcule le % de sortie pour chaque token en fonction de son point d\'entrée.'}
                </span>
              </div>
              <TokenTable
                tokens={tokensWithMetrics}
                onChangeTarget={handleChangeTarget}
                onChangeEntryPrice={handleChangeEntryPrice}
                onToggleHidden={handleToggleHidden}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
