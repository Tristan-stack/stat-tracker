'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TokenTable } from '@/components/TokenTable';
import { StatsSummary } from '@/components/StatsSummary';
import GmgnTokenAddSection, { type GmgnPreviewRow } from '@/components/GmgnTokenAddSection';
import { TokenImportExport } from '@/components/TokenImportExport';
import { Button } from '@/components/ui/button';
import type { Rugger, StatusId } from '@/types/rugger';
import type { Token, ExitMode } from '@/types/token';
import { getTokenWithMetrics } from '@/lib/token-calculations';
import { isMigrationPeakMcap, type MigrationView } from '@/lib/migration';
import { localGmgnAllTimeRange, type TokenPurchaseFilter } from '@/lib/token-date-filter';
import { cn } from '@/lib/utils';
import { parseGmgnDecimalString } from '@/lib/gmgn/price-rounding';
import { getTokenMintAddress } from '@/lib/token-display';
import { canOpenSolanaAddressOrMint } from '@/lib/open-trusted-solana-external';
import { apiPost } from '@/lib/api-client';
import { TokenFilterBar } from '@/features/ruggers/components/TokenFilterBar';
import { GlobalTargetControl } from '@/features/ruggers/components/GlobalTargetControl';
import { FirstBuyStatsStrip, type FirstBuyStats } from '@/features/ruggers/components/FirstBuyStatsStrip';
import {
  useRuggerTokensPage,
  useRuggerTokensAll,
  useRuggerTokensUnfiltered,
  useFirstBuyPreview,
  useDexPaidPreview,
  useInsertTokens,
  useUpdateToken,
  useDeleteToken,
  useApplyGlobalTarget,
  useResetTokens,
  fetchRuggerTokensUnfiltered,
  type TokenFilters,
} from '@/features/ruggers/hooks/use-tokens';

interface RuggerTokensTabProps {
  ruggerId: string;
  rugger: Rugger;
  onRuggerChange: () => void;
}

const TOKEN_TABLE_PAGE_SIZES = [10, 15, 30] as const;
const DEFAULT_GMGN_TARGET_PERCENT = 100;
const FIRST_BUY_UNIT_LS = 'stattracker-first-buy-unit';

interface GmgnPurchasePreview {
  name: string;
  purchasedAt: string;
  high: number;
  low: number;
  entryToLowMinutes?: number | null;
}

function buildRuggerMintSet(tokens: Token[]): Set<string> {
  const s = new Set<string>();
  for (const t of tokens) {
    const m = (t.tokenAddress?.trim() || t.name?.trim()) ?? '';
    if (m !== '') s.add(m);
  }
  return s;
}

export default function RuggerTokensTab({ ruggerId: id, rugger, onRuggerChange }: RuggerTokensTabProps) {
  const [page, setPage] = useState(1);
  const [tokenTablePageSize, setTokenTablePageSize] = useState<(typeof TOKEN_TABLE_PAGE_SIZES)[number]>(10);
  const [tokenStatusFilter, setTokenStatusFilter] = useState<StatusId | 'all'>('all');
  const [tokenPurchaseFilter, setTokenPurchaseFilter] = useState<TokenPurchaseFilter>('all');
  const [tokenEntryMcapMin, setTokenEntryMcapMin] = useState('');
  const [tokenEntryMcapMax, setTokenEntryMcapMax] = useState('');
  const [tokenTableCustomFrom, setTokenTableCustomFrom] = useState('');
  const [tokenTableCustomTo, setTokenTableCustomTo] = useState('');
  const [tokenTablePickDay, setTokenTablePickDay] = useState('');
  const [migrationView, setMigrationView] = useState<MigrationView>('all');

  const [globalTargetPercent, setGlobalTargetPercent] = useState('');
  const [globalTargetMcap, setGlobalTargetMcap] = useState('');
  const [globalExitMode, setGlobalExitMode] = useState<ExitMode>('percent');
  const [gmgnRefreshError, setGmgnRefreshError] = useState<string | null>(null);
  const [gmgnRefreshInfo, setGmgnRefreshInfo] = useState<string | null>(null);
  const [hiddenTokenIds, setHiddenTokenIds] = useState<Set<string>>(() => new Set());
  const [refreshingTokenIds, setRefreshingTokenIds] = useState<Set<string>>(() => new Set());
  const [firstBuyUnit, setFirstBuyUnit] = useState<'usd' | 'sol'>('usd');

  const filters: TokenFilters = useMemo(
    () => ({
      status: tokenStatusFilter,
      purchaseFilter: tokenPurchaseFilter,
      entryMcapMin: tokenEntryMcapMin,
      entryMcapMax: tokenEntryMcapMax,
      customFrom: tokenTableCustomFrom,
      customTo: tokenTableCustomTo,
      pickDay: tokenTablePickDay,
      migrationOnly: migrationView === 'migrations',
    }),
    [tokenStatusFilter, tokenPurchaseFilter, tokenEntryMcapMin, tokenEntryMcapMax, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay, migrationView]
  );

  const tokensPageQuery = useRuggerTokensPage(id, page, tokenTablePageSize, filters);
  const allTokensQuery = useRuggerTokensAll(id, filters);
  const unfilteredQuery = useRuggerTokensUnfiltered(id);

  const tokensData = tokensPageQuery.data ?? null;
  const allTokensForStats = useMemo(() => allTokensQuery.data ?? [], [allTokensQuery.data]);
  const unfilteredRuggerTokens = useMemo(() => unfilteredQuery.data ?? [], [unfilteredQuery.data]);

  const insertTokens = useInsertTokens(id);
  const updateToken = useUpdateToken(id);
  const deleteToken = useDeleteToken(id);
  const applyGlobalTarget = useApplyGlobalTarget(id);
  const resetTokens = useResetTokens(id);

  // --- localStorage : unité 1er achat + tokens masqués (par rugger) ---
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(FIRST_BUY_UNIT_LS);
      if (v === 'sol' || v === 'usd') setFirstBuyUnit(v);
    } catch {
      /* ignore */
    }
  }, []);

  const handleFirstBuyUnitChange = useCallback((u: 'usd' | 'sol') => {
    setFirstBuyUnit(u);
    try {
      window.localStorage.setItem(FIRST_BUY_UNIT_LS, u);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`stattracker-rugger-hidden:${id}`);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      setHiddenTokenIds(new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []));
    } catch {
      setHiddenTokenIds(new Set());
    }
  }, [id]);

  const handleToggleHidden = useCallback(
    (tokenId: string) => {
      setHiddenTokenIds((prev) => {
        const next = new Set(prev);
        if (next.has(tokenId)) next.delete(tokenId);
        else next.add(tokenId);
        try {
          window.localStorage.setItem(`stattracker-rugger-hidden:${id}`, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [id]
  );

  const mergeHidden = useCallback(
    (list: Token[]) => list.map((t) => ({ ...t, hidden: hiddenTokenIds.has(t.id) })),
    [hiddenTokenIds]
  );

  const tokensForStats = useMemo(() => mergeHidden(allTokensForStats).filter((t) => !t.hidden), [mergeHidden, allTokensForStats]);
  const tokensForActivityInference = useMemo(() => mergeHidden(unfilteredRuggerTokens).filter((t) => !t.hidden), [mergeHidden, unfilteredRuggerTokens]);
  const migrationKnownTotal = useMemo(() => allTokensForStats.filter((t) => isMigrationPeakMcap(t.high)).length, [allTokensForStats]);
  const pagedTokensMerged = useMemo(() => mergeHidden(tokensData?.tokens ?? []), [mergeHidden, tokensData?.tokens]);

  // --- 1er achat (wallets « buyer ») ---
  const firstBuyNeededMints = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tokensForStats) {
      const m = getTokenMintAddress(t).trim();
      if (m === '' || seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
    return out.sort();
  }, [tokensForStats]);

  const buyerWallet = rugger.walletType === 'buyer' ? (rugger.walletAddress?.trim() ?? '') : '';
  const firstBuyEnabled = buyerWallet !== '' && firstBuyNeededMints.length > 0;
  const firstBuyQuery = useFirstBuyPreview(id, firstBuyNeededMints, firstBuyEnabled);
  const firstBuyByMint = useMemo(() => firstBuyQuery.data ?? {}, [firstBuyQuery.data]);
  const firstBuyLoading = firstBuyEnabled && firstBuyQuery.isFetching;

  const firstBuyStats = useMemo<FirstBuyStats | null>(() => {
    if (rugger.walletType !== 'buyer') return null;
    const values: number[] = [];
    for (const t of tokensForStats) {
      const mint = getTokenMintAddress(t).trim();
      const e = mint ? firstBuyByMint[mint] : undefined;
      if (!e) continue;
      const v = firstBuyUnit === 'usd' ? e.usd : e.sol;
      if (v === null || !Number.isFinite(v)) continue;
      values.push(v);
    }
    if (values.length === 0) return null;
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((s, x) => s + x, 0) / values.length,
      count: values.length,
    };
  }, [rugger.walletType, tokensForStats, firstBuyByMint, firstBuyUnit]);

  // Synchronise le champ « objectif commun » quand tous les tokens partagent le même %.
  useEffect(() => {
    if (tokensData?.allSameTargetPercent != null) {
      setGlobalTargetPercent(String(tokensData.allSameTargetPercent));
    }
  }, [tokensData?.allSameTargetPercent]);

  const handleMigrationViewChange = useCallback((view: MigrationView) => {
    setMigrationView(view);
    setPage(1);
  }, []);

  // --- Mutations (handlers fins) ---
  const handleImportTokens = useCallback(
    async (importedTokens: Token[]) => {
      try {
        await insertTokens.mutateAsync({ tokens: importedTokens });
        setPage(1);
        onRuggerChange();
      } catch {
        /* erreur ignorée */
      }
    },
    [insertTokens, onRuggerChange]
  );

  const handleAddToken = useCallback(
    async (token: Token) => {
      await insertTokens.mutateAsync({ tokens: [token], replace: false }).then(() => setPage(1)).catch(() => {});
    },
    [insertTokens]
  );

  const patchToken = useCallback(
    (tokenId: string, patch: Record<string, unknown>) => updateToken.mutateAsync({ tokenId, patch }).catch(() => undefined),
    [updateToken]
  );

  const handleDeleteToken = useCallback(
    async (tokenId: string) => {
      if (!window.confirm('Supprimer ce token ?')) return;
      await deleteToken.mutateAsync(tokenId).catch(() => {});
    },
    [deleteToken]
  );

  const handleRefreshTokenFromGmgn = useCallback(
    async (token: Token) => {
      const mint = token.tokenAddress?.trim() ?? '';
      if (mint === '') {
        setGmgnRefreshError('Token sans mint : refresh GMGN impossible.');
        return;
      }
      setGmgnRefreshError(null);
      setGmgnRefreshInfo(null);
      setRefreshingTokenIds((prev) => new Set(prev).add(token.id));
      try {
        const { fromMs } = localGmgnAllTimeRange();
        const data = await apiPost<{ purchases?: GmgnPurchasePreview[] }>('/api/gmgn/token-tracking', {
          tokenAddress: mint,
          fromMs,
          toMs: Date.now(),
          athHigh: true,
        });
        const p = data.purchases?.[0];
        if (!p) {
          setGmgnRefreshError('Aucune donnée GMGN trouvée pour ce token.');
          return;
        }
        const patch: Record<string, unknown> = { high: p.high, low: p.low, tokenName: p.name, purchasedAt: p.purchasedAt };
        if (typeof p.entryToLowMinutes === 'number' && Number.isFinite(p.entryToLowMinutes)) {
          patch.entryToLowMinutes = p.entryToLowMinutes;
        }
        const res = await updateToken.mutateAsync({ tokenId: token.id, patch });
        if (typeof res?.warning === 'string' && res.warning.trim() !== '') setGmgnRefreshInfo(res.warning.trim());
      } catch (e) {
        setGmgnRefreshError(e instanceof Error ? e.message : 'Aucune donnée GMGN trouvée pour ce token.');
      } finally {
        setRefreshingTokenIds((prev) => {
          const next = new Set(prev);
          next.delete(token.id);
          return next;
        });
      }
    },
    [updateToken]
  );

  const handleApplyGlobalTarget = useCallback(async () => {
    if (globalExitMode === 'mcap') {
      const mcap = Number(globalTargetMcap.replace(',', '.'));
      if (!Number.isFinite(mcap) || mcap <= 0) return;
      await applyGlobalTarget.mutateAsync({ targetExitMcap: mcap }).catch(() => {});
    } else {
      const value = Number(globalTargetPercent.replace(',', '.'));
      if (!Number.isFinite(value)) return;
      await applyGlobalTarget.mutateAsync({ targetExitPercent: value }).catch(() => {});
    }
  }, [globalExitMode, globalTargetPercent, globalTargetMcap, applyGlobalTarget]);

  const handleResetTokens = useCallback(async () => {
    if (!window.confirm('Supprimer tous les tokens de ce rugger ?')) return;
    try {
      await resetTokens.mutateAsync();
      setPage(1);
      onRuggerChange();
    } catch {
      /* ignore */
    }
  }, [resetTokens, onRuggerChange]);

  const handleAddGmgnPurchases = useCallback(
    async (items: GmgnPreviewRow[]) => {
      if (items.length === 0) return false;
      const knownMints = buildRuggerMintSet(await fetchRuggerTokensUnfiltered(id));
      const newItems = items.filter((p) => !knownMints.has(p.tokenAddress.trim()));
      if (newItems.length === 0) return false;
      const tokens: Token[] = newItems.map((p) => {
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
          entryToLowMinutes:
            typeof p.entryToLowMinutes === 'number' && Number.isFinite(p.entryToLowMinutes) ? p.entryToLowMinutes : null,
        };
      });
      try {
        await insertTokens.mutateAsync({ tokens, replace: false });
        setPage(1);
        return true;
      } catch {
        return false;
      }
    },
    [id, insertTokens]
  );

  const totalPages = useMemo(() => (tokensData ? Math.max(1, Math.ceil(tokensData.total / tokensData.pageSize)) : 1), [tokensData]);
  const hasAnyRuggerTokens = (tokensData?.total ?? 0) > 0 || allTokensForStats.length > 0 || (rugger.tokenCount ?? 0) > 0;
  const activeTokens = pagedTokensMerged;
  const tokensWithMetrics = activeTokens.map(getTokenWithMetrics);
  const isFetchingTokens = tokensPageQuery.isFetching;

  const firstBuyColumn =
    rugger.walletType === 'buyer'
      ? { unit: firstBuyUnit, onUnitChange: handleFirstBuyUnitChange, byMint: firstBuyByMint, isLoading: firstBuyLoading }
      : undefined;

  // Statut « DEX payé » (Dexscreener) pour les mints de la page courante.
  const dexPaidMints = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of activeTokens) {
      const m = getTokenMintAddress(t).trim();
      if (m === '' || seen.has(m) || !canOpenSolanaAddressOrMint(m)) continue;
      seen.add(m);
      out.push(m);
    }
    return out;
  }, [activeTokens]);
  const dexPaidQuery = useDexPaidPreview(dexPaidMints, dexPaidMints.length > 0);
  const dexPaidByMint = useMemo(() => dexPaidQuery.data ?? {}, [dexPaidQuery.data]);
  const dexPaidLoading = dexPaidQuery.isFetching;

  return (
    <div className="space-y-8">
      <StatsSummary tokens={tokensForStats} activityInferenceTokens={tokensForActivityInference} />
      <GmgnTokenAddSection
        knownTokens={unfilteredRuggerTokens}
        loadKnownTokens={() => fetchRuggerTokensUnfiltered(id)}
        onAddPurchases={handleAddGmgnPurchases}
        onManualAdd={handleAddToken}
        walletAddressPrefill={rugger.walletAddress}
        addAllButtonLabel="Tout ajouter au rugger"
        headerActions={
          <TokenImportExport variant="menu" tokens={mergeHidden(allTokensForStats)} onImport={handleImportTokens} />
        }
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Tokens</h2>
          {tokensData && (
            <p className="text-xs text-muted-foreground">
              Page {tokensData.page} sur {totalPages} – {tokensData.total} token{tokensData.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <TokenFilterBar
          status={tokenStatusFilter}
          onStatusChange={(s) => { setTokenStatusFilter(s); setPage(1); }}
          purchaseFilter={tokenPurchaseFilter}
          onPurchaseFilterChange={(p) => { setTokenPurchaseFilter(p); setPage(1); }}
          entryMcapMin={tokenEntryMcapMin}
          onEntryMcapMinChange={(v) => { setTokenEntryMcapMin(v); setPage(1); }}
          entryMcapMax={tokenEntryMcapMax}
          onEntryMcapMaxChange={(v) => { setTokenEntryMcapMax(v); setPage(1); }}
          customFrom={tokenTableCustomFrom}
          onCustomFromChange={(v) => { setTokenTableCustomFrom(v); setPage(1); }}
          customTo={tokenTableCustomTo}
          onCustomToChange={(v) => { setTokenTableCustomTo(v); setPage(1); }}
          pickDay={tokenTablePickDay}
          onPickDayChange={(v) => { setTokenTablePickDay(v); setPage(1); }}
          showReset={hasAnyRuggerTokens}
          onReset={handleResetTokens}
        />

        {gmgnRefreshError && <p className="text-sm text-destructive" role="alert">{gmgnRefreshError}</p>}
        {gmgnRefreshInfo && !gmgnRefreshError && (
          <p className="text-sm font-medium text-foreground" role="status">{gmgnRefreshInfo}</p>
        )}
        {rugger.walletType === 'buyer' && !rugger.walletAddress?.trim() && activeTokens.length > 0 && (
          <p className="text-xs text-muted-foreground" role="status">
            Renseigne l&apos;adresse Solana du wallet acheteur sur le rugger pour afficher le montant du 1er achat GMGN par token.
          </p>
        )}

        {tokensPageQuery.isLoading && !tokensData ? (
          <p className="text-sm text-muted-foreground">Chargement des tokens…</p>
        ) : activeTokens.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            Aucun token pour ce rugger{tokenPurchaseFilter !== 'all' || tokenStatusFilter !== 'all' ? ' avec ces filtres' : ''}. Importe une liste JSON ci-dessus.
          </p>
        ) : (
          <>
            {isFetchingTokens && <p className="text-xs text-muted-foreground" aria-live="polite">Actualisation des données…</p>}
            <div className={cn('space-y-4 transition-opacity', isFetchingTokens && 'pointer-events-none opacity-60')}>
              <GlobalTargetControl
                exitMode={globalExitMode}
                onExitModeChange={setGlobalExitMode}
                percent={globalTargetPercent}
                onPercentChange={setGlobalTargetPercent}
                mcap={globalTargetMcap}
                onMcapChange={setGlobalTargetMcap}
                isApplying={applyGlobalTarget.isPending}
                onApply={handleApplyGlobalTarget}
              />
              {rugger.walletType === 'buyer' && rugger.walletAddress?.trim() !== '' && (
                <FirstBuyStatsStrip stats={firstBuyStats} unit={firstBuyUnit} isLoading={firstBuyLoading} />
              )}
              <TokenTable
                tokens={tokensWithMetrics}
                onChangeTarget={(tokenId, v) => void patchToken(tokenId, { targetExitPercent: v })}
                onChangeEntryPrice={(tokenId, v) => void patchToken(tokenId, { entryPrice: v })}
                onChangeHigh={(tokenId, v) => void patchToken(tokenId, { high: v })}
                onRefreshToken={handleRefreshTokenFromGmgn}
                refreshingTokenIds={refreshingTokenIds}
                onDeleteToken={handleDeleteToken}
                onToggleHidden={handleToggleHidden}
                migrationView={migrationView}
                onMigrationViewChange={handleMigrationViewChange}
                migrationKnownCount={migrationKnownTotal}
                firstBuyColumn={firstBuyColumn}
                dexPaidByMint={dexPaidByMint}
                dexPaidLoading={dexPaidLoading}
              />
              <div className="flex flex-wrap items-center justify-start gap-3">
                <span className="text-xs font-medium text-muted-foreground">Par page</span>
                <div className="flex rounded-md border text-xs">
                  {TOKEN_TABLE_PAGE_SIZES.map((n, i) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => { setTokenTablePageSize(n); setPage(1); }}
                      className={cn(
                        'px-2.5 py-1 font-medium transition-colors',
                        i === 0 && 'rounded-l-md',
                        i === TOKEN_TABLE_PAGE_SIZES.length - 1 && 'rounded-r-md',
                        i > 0 && 'border-l border-border',
                        tokenTablePageSize === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Page précédente</Button>
                  <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Page suivante</Button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
