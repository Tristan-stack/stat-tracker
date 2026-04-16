'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TokenTable } from '@/components/TokenTable';
import { StatsSummary } from '@/components/StatsSummary';
import GmgnTokenAddSection, { type GmgnPreviewRow } from '@/components/GmgnTokenAddSection';
import { TokenImportExport } from '@/components/TokenImportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import type { Rugger, StatusId } from '@/types/rugger';
import { STATUS_LABELS, STATUS_ORDER, STATUS_FILTER_BUTTON_STYLES } from '@/types/rugger';
import type { Token, ExitMode } from '@/types/token';
import { getTokenWithMetrics } from '@/lib/token-calculations';
import { isMigrationPeakMcap, type MigrationView } from '@/lib/migration';
import {
  appendTokenDateQueryParams,
  getPurchaseFilterLabel,
  localGmgnAllTimeRange,
  type TokenPurchaseFilter,
} from '@/lib/token-date-filter';
import { IconTrash } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { parseGmgnDecimalString } from '@/lib/gmgn/price-rounding';

interface RuggerTokensTabProps {
  ruggerId: string;
  rugger: Rugger;
  onRuggerChange: () => void;
}

interface TokensResponse {
  tokens: Token[];
  page: number;
  pageSize: number;
  total: number;
  allSameTargetPercent: number | null;
}

const TOKEN_TABLE_PAGE_SIZES = [10, 15, 30] as const;

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

interface GmgnPurchasePreview {
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  entryPrice: number;
  high: number;
  low: number;
  truncatedKlines: boolean;
  sourceWallet?: string;
}

function buildRuggerMintSet(tokens: Token[]): Set<string> {
  const s = new Set<string>();
  for (const t of tokens) {
    const m = (t.tokenAddress?.trim() || t.name?.trim()) ?? '';
    if (m !== '') s.add(m);
  }
  return s;
}

const DEFAULT_GMGN_TARGET_PERCENT = 100;

export default function RuggerTokensTab({ ruggerId, rugger, onRuggerChange }: RuggerTokensTabProps) {
  const id = ruggerId;

  const [tokensPage, setTokensPage] = useState<TokensResponse | null>(null);
  const [allTokensForStats, setAllTokensForStats] = useState<Token[]>([]);
  const [page, setPage] = useState(1);
  const [tokenTablePageSize, setTokenTablePageSize] =
    useState<(typeof TOKEN_TABLE_PAGE_SIZES)[number]>(10);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [globalTargetPercent, setGlobalTargetPercent] = useState('');
  const [globalTargetMcap, setGlobalTargetMcap] = useState('');
  const [globalExitMode, setGlobalExitMode] = useState<ExitMode>('percent');
  const [isApplyingGlobalTarget, setIsApplyingGlobalTarget] = useState(false);
  const [tokenStatusFilter, setTokenStatusFilter] = useState<StatusId | 'all'>('all');
  const [tokenPurchaseFilter, setTokenPurchaseFilter] = useState<TokenPurchaseFilter>('all');
  const [tokenTableCustomFrom, setTokenTableCustomFrom] = useState('');
  const [tokenTableCustomTo, setTokenTableCustomTo] = useState('');
  const [tokenTablePickDay, setTokenTablePickDay] = useState('');
  const [migrationView, setMigrationView] = useState<MigrationView>('all');
  const prevRuggerIdForFetchRef = useRef<string | null>(null);
  const [gmgnRefreshError, setGmgnRefreshError] = useState<string | null>(null);
  const [hiddenTokenIds, setHiddenTokenIds] = useState<Set<string>>(() => new Set());
  const [refreshingTokenIds, setRefreshingTokenIds] = useState<Set<string>>(() => new Set());
  const [unfilteredRuggerTokens, setUnfilteredRuggerTokens] = useState<Token[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`stattracker-rugger-hidden:${id}`);
      if (!raw) { setHiddenTokenIds(new Set()); return; }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) { setHiddenTokenIds(new Set()); return; }
      setHiddenTokenIds(new Set(parsed.filter((x): x is string => typeof x === 'string')));
    } catch { setHiddenTokenIds(new Set()); }
  }, [id]);

  const mergeHidden = useCallback(
    (list: Token[]) => list.map((t) => ({ ...t, hidden: hiddenTokenIds.has(t.id) })),
    [hiddenTokenIds]
  );

  const handleToggleHidden = useCallback(
    (tokenId: string) => {
      setHiddenTokenIds((prev) => {
        const next = new Set(prev);
        if (next.has(tokenId)) next.delete(tokenId);
        else next.add(tokenId);
        try {
          window.localStorage.setItem(`stattracker-rugger-hidden:${id}`, JSON.stringify([...next]));
        } catch { /* ignore */ }
        return next;
      });
    },
    [id]
  );

  const tokensForStats = useMemo(
    () => mergeHidden(allTokensForStats).filter((t) => !t.hidden),
    [mergeHidden, allTokensForStats]
  );

  const tokensForActivityInference = useMemo(
    () => mergeHidden(unfilteredRuggerTokens).filter((t) => !t.hidden),
    [mergeHidden, unfilteredRuggerTokens]
  );

  const migrationKnownTotal = useMemo(
    () => allTokensForStats.filter((t) => isMigrationPeakMcap(t.high)).length,
    [allTokensForStats]
  );

  const handleMigrationViewChange = useCallback((view: MigrationView) => {
    setMigrationView(view);
    setPage(1);
  }, []);

  const loadTokens = useCallback(
    async (
      ruggerId: string,
      nextPage: number,
      listPageSize: number,
      status?: StatusId | 'all',
      purchaseFilter?: TokenPurchaseFilter,
      tableCustomFrom?: string,
      tableCustomTo?: string,
      pickDay?: string,
      migrationOnly = false
    ) => {
      setIsLoadingTokens(true);
      try {
        const searchParams = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(listPageSize),
        });
        if (status && status !== 'all') searchParams.set('status', status);
        appendTokenDateQueryParams(searchParams, purchaseFilter ?? 'all', tableCustomFrom, tableCustomTo, pickDay);
        if (migrationOnly) searchParams.set('migration', 'true');
        const response = await fetch(`/api/ruggers/${ruggerId}/tokens?${searchParams.toString()}`);
        if (!response.ok) return;
        const data = (await response.json()) as TokensResponse;
        setTokensPage(data);
      } finally { setIsLoadingTokens(false); }
    },
    []
  );

  const loadAllTokensForStats = useCallback(
    async (
      ruggerId: string,
      status?: StatusId | 'all',
      purchaseFilter?: TokenPurchaseFilter,
      tableCustomFrom?: string,
      tableCustomTo?: string,
      pickDay?: string
    ) => {
      try {
        const params = new URLSearchParams({ all: 'true' });
        if (status && status !== 'all') params.set('status', status);
        appendTokenDateQueryParams(params, purchaseFilter ?? 'all', tableCustomFrom, tableCustomTo, pickDay);
        const response = await fetch(`/api/ruggers/${ruggerId}/tokens?${params.toString()}`);
        if (!response.ok) return;
        const data = (await response.json()) as TokensResponse;
        setAllTokensForStats(data.tokens);
      } catch { setAllTokensForStats([]); }
    },
    []
  );

  const loadAllRuggerTokensUnfiltered = useCallback(async (ruggerId: string): Promise<Token[]> => {
    try {
      const response = await fetch(`/api/ruggers/${ruggerId}/tokens?all=true`);
      if (!response.ok) return [];
      const data = (await response.json()) as TokensResponse;
      return data.tokens;
    } catch { return []; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadAllRuggerTokensUnfiltered(id).then((list) => {
      if (!cancelled) setUnfilteredRuggerTokens(list);
    });
    return () => { cancelled = true; };
  }, [id, rugger.tokenCount, allTokensForStats.length, loadAllRuggerTokensUnfiltered]);

  useEffect(() => {
    const ruggerChanged = prevRuggerIdForFetchRef.current !== id;
    if (ruggerChanged) {
      prevRuggerIdForFetchRef.current = id;
      setMigrationView('all');
      setPage(1);
    }
    const fetchPage = ruggerChanged ? 1 : page;
    const migrationOnly = ruggerChanged ? false : migrationView === 'migrations';
    void loadTokens(id, fetchPage, tokenTablePageSize, tokenStatusFilter, tokenPurchaseFilter, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay, migrationOnly);
    void loadAllTokensForStats(id, tokenStatusFilter, tokenPurchaseFilter, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay);
  }, [id, page, tokenStatusFilter, tokenPurchaseFilter, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay, migrationView, tokenTablePageSize, loadTokens, loadAllTokensForStats]);

  useEffect(() => {
    if (tokensPage?.allSameTargetPercent != null) {
      setGlobalTargetPercent(String(tokensPage.allSameTargetPercent));
    }
  }, [tokensPage?.allSameTargetPercent]);

  const reloadTokens = useCallback(async () => {
    await loadTokens(id, page, tokenTablePageSize, tokenStatusFilter, tokenPurchaseFilter, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay, migrationView === 'migrations');
    await loadAllTokensForStats(id, tokenStatusFilter, tokenPurchaseFilter, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay);
  }, [id, page, tokenTablePageSize, tokenStatusFilter, tokenPurchaseFilter, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay, migrationView, loadTokens, loadAllTokensForStats]);

  const reloadTokensFromPage1 = useCallback(async () => {
    setPage(1);
    await loadTokens(id, 1, tokenTablePageSize, tokenStatusFilter, tokenPurchaseFilter, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay, migrationView === 'migrations');
    await loadAllTokensForStats(id, tokenStatusFilter, tokenPurchaseFilter, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay);
  }, [id, tokenTablePageSize, tokenStatusFilter, tokenPurchaseFilter, tokenTableCustomFrom, tokenTableCustomTo, tokenTablePickDay, migrationView, loadTokens, loadAllTokensForStats]);

  const handleImportTokens = useCallback(
    async (importedTokens: Token[]) => {
      const response = await fetch(`/api/ruggers/${id}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: importedTokens }),
      });
      if (!response.ok) return;
      await reloadTokensFromPage1();
      onRuggerChange();
    },
    [id, reloadTokensFromPage1, onRuggerChange]
  );

  const handleAddToken = useCallback(
    async (token: Token) => {
      const response = await fetch(`/api/ruggers/${id}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: [token], replace: false }),
      });
      if (!response.ok) return;
      await reloadTokensFromPage1();
    },
    [id, reloadTokensFromPage1]
  );

  const handleChangeTarget = useCallback(
    async (tokenId: string, nextPercent: number) => {
      const response = await fetch(`/api/ruggers/${id}/tokens/${tokenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetExitPercent: nextPercent }),
      });
      if (!response.ok) return;
      await reloadTokens();
    },
    [id, reloadTokens]
  );

  const handleChangeEntryPrice = useCallback(
    async (tokenId: string, nextPrice: number) => {
      const response = await fetch(`/api/ruggers/${id}/tokens/${tokenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryPrice: nextPrice }),
      });
      if (!response.ok) return;
      await reloadTokens();
    },
    [id, reloadTokens]
  );

  const handleDeleteToken = useCallback(
    async (tokenId: string) => {
      if (!window.confirm('Supprimer ce token ?')) return;
      const response = await fetch(`/api/ruggers/${id}/tokens/${tokenId}`, { method: 'DELETE' });
      if (!response.ok) return;
      await reloadTokens();
    },
    [id, reloadTokens]
  );

  const handleRefreshTokenFromGmgn = useCallback(
    async (token: Token) => {
      const mint = token.tokenAddress?.trim() ?? '';
      if (mint === '') {
        setGmgnRefreshError('Token sans mint : refresh GMGN impossible.');
        return;
      }
      setGmgnRefreshError(null);
      setRefreshingTokenIds((prev) => new Set(prev).add(token.id));
      const fromMs = localGmgnAllTimeRange().fromMs;
      const toMs = Date.now();
      try {
        const res = await fetch('/api/gmgn/token-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenAddress: mint, fromMs, toMs, athHigh: true }),
        });
        const data = (await res.json()) as { purchases?: GmgnPurchasePreview[]; error?: string };
        if (!res.ok || !data.purchases || data.purchases.length === 0) {
          setGmgnRefreshError(data.error ?? 'Aucune donnée GMGN trouvée pour ce token.');
          return;
        }
        const p = data.purchases[0];
        const patchRes = await fetch(`/api/ruggers/${id}/tokens/${token.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ high: p.high, low: p.low, tokenName: p.name, purchasedAt: p.purchasedAt }),
        });
        if (!patchRes.ok) return;
        setTokensPage((prev) =>
          prev ? { ...prev, tokens: prev.tokens.map((t) => t.id === token.id ? { ...t, high: p.high, low: p.low, tokenName: p.name, purchasedAt: p.purchasedAt } : t) } : prev
        );
        setAllTokensForStats((prev) =>
          prev.map((t) => t.id === token.id ? { ...t, high: p.high, low: p.low, tokenName: p.name, purchasedAt: p.purchasedAt } : t)
        );
        void loadAllRuggerTokensUnfiltered(id).then(setUnfilteredRuggerTokens);
      } finally {
        setRefreshingTokenIds((prev) => { const next = new Set(prev); next.delete(token.id); return next; });
      }
    },
    [id, loadAllRuggerTokensUnfiltered]
  );

  const handleApplyGlobalTarget = useCallback(async () => {
    setIsApplyingGlobalTarget(true);
    try {
      let body: Record<string, number>;
      if (globalExitMode === 'mcap') {
        const mcap = Number(globalTargetMcap.replace(',', '.'));
        if (!Number.isFinite(mcap) || mcap <= 0) return;
        body = { targetExitMcap: mcap };
      } else {
        const value = Number(globalTargetPercent.replace(',', '.'));
        if (!Number.isFinite(value)) return;
        body = { targetExitPercent: value };
      }
      const response = await fetch(`/api/ruggers/${id}/tokens`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) return;
      await reloadTokens();
    } finally { setIsApplyingGlobalTarget(false); }
  }, [id, globalExitMode, globalTargetPercent, globalTargetMcap, reloadTokens]);

  const handleResetTokens = useCallback(async () => {
    if (!window.confirm('Supprimer tous les tokens de ce rugger ?')) return;
    const response = await fetch(`/api/ruggers/${id}/tokens`, { method: 'DELETE' });
    if (!response.ok) return;
    await reloadTokensFromPage1();
    onRuggerChange();
  }, [id, reloadTokensFromPage1, onRuggerChange]);

  const handleAddGmgnPurchases = useCallback(
    async (items: GmgnPreviewRow[]) => {
      if (items.length === 0) return false;
      const existingTokens = await loadAllRuggerTokensUnfiltered(id);
      const knownMints = buildRuggerMintSet(existingTokens);
      const newItems = items.filter((p) => !knownMints.has(p.tokenAddress.trim()));
      if (newItems.length === 0) return false;
      const tokens: Token[] = newItems.map((p) => {
        const entryPrice = parseGmgnDecimalString(p.entryStr);
        const high = parseGmgnDecimalString(p.highStr);
        const low = parseGmgnDecimalString(p.lowStr);
        return {
          id: crypto.randomUUID(), name: p.tokenAddress, tokenName: p.name,
          entryPrice: entryPrice > 0 ? entryPrice : 1e-12, high: high > 0 ? high : 1e-12, low: low > 0 ? low : 1e-12,
          targetExitPercent: DEFAULT_GMGN_TARGET_PERCENT, purchasedAt: p.purchasedAt, tokenAddress: p.tokenAddress,
        };
      });
      const response = await fetch(`/api/ruggers/${id}/tokens`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens, replace: false }),
      });
      if (!response.ok) return false;
      await reloadTokensFromPage1();
      return true;
    },
    [id, reloadTokensFromPage1, loadAllRuggerTokensUnfiltered]
  );

  const totalPages = useMemo(() => {
    if (!tokensPage) return 1;
    return Math.max(1, Math.ceil(tokensPage.total / tokensPage.pageSize));
  }, [tokensPage]);

  const hasAnyRuggerTokens =
    (tokensPage?.total ?? 0) > 0 || allTokensForStats.length > 0 || (rugger.tokenCount ?? 0) > 0;

  const activeTokens: Token[] = mergeHidden(tokensPage?.tokens ?? []);
  const tokensWithMetrics = activeTokens.map(getTokenWithMetrics);

  return (
    <div className="space-y-8">
      <StatsSummary
        tokens={tokensForStats}
        activityInferenceTokens={tokensForActivityInference}
      />

      <GmgnTokenAddSection
        knownTokens={unfilteredRuggerTokens}
        loadKnownTokens={() => loadAllRuggerTokensUnfiltered(id)}
        onAddPurchases={handleAddGmgnPurchases}
        onManualAdd={handleAddToken}
        walletAddressPrefill={rugger.walletAddress}
        addAllButtonLabel="Tout ajouter au rugger"
        headerActions={
          <TokenImportExport
            variant="menu"
            tokens={mergeHidden(allTokensForStats)}
            onImport={handleImportTokens}
          />
        }
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Tokens</h2>
            <div className="flex gap-1">
              {(['all', ...STATUS_ORDER] as const).map((s) => {
                const styles = STATUS_FILTER_BUTTON_STYLES[s];
                return (
                  <button key={s} type="button" onClick={() => { setTokenStatusFilter(s); setPage(1); }}
                    className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', tokenStatusFilter === s ? styles.selected : styles.unselected)}>
                    {s === 'all' ? 'Tous' : STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
            {hasAnyRuggerTokens && (
              <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleResetTokens}>
                <IconTrash className="size-4 mr-1" />Reset les tokens
              </Button>
            )}
          </div>
          {tokensPage && (
            <p className="text-xs text-muted-foreground">Page {tokensPage.page} sur {totalPages} – {tokensPage.total} token{tokensPage.total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Date d&apos;achat :</span>
            {(['all', 'today', 'yesterday', 'day', 'custom'] satisfies TokenPurchaseFilter[]).map((period) => (
              <button key={period} type="button" onClick={() => { setTokenPurchaseFilter(period); setPage(1); if (period === 'day') setTokenTablePickDay((prev) => prev || formatDateToYyyyMmDd(new Date())); }}
                className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', tokenPurchaseFilter === period ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                {getPurchaseFilterLabel(period)}
              </button>
            ))}
          </div>
          {tokenPurchaseFilter === 'day' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label>Jour</Label>
                <DatePicker value={parseYyyyMmDdToDate(tokenTablePickDay)} onChange={(date) => { setTokenTablePickDay(formatDateToYyyyMmDd(date)); setPage(1); }} placeholder="Choisir un jour" className="w-[200px]" />
              </div>
            </div>
          )}
          {tokenPurchaseFilter === 'custom' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2"><Label>Du</Label><DatePicker value={parseYyyyMmDdToDate(tokenTableCustomFrom)} onChange={(date) => { setTokenTableCustomFrom(formatDateToYyyyMmDd(date)); setPage(1); }} placeholder="Date de début" className="w-[200px]" /></div>
              <div className="space-y-2"><Label>Au</Label><DatePicker value={parseYyyyMmDdToDate(tokenTableCustomTo)} onChange={(date) => { setTokenTableCustomTo(formatDateToYyyyMmDd(date)); setPage(1); }} placeholder="Date de fin" className="w-[200px]" /></div>
            </div>
          )}
        </div>
        {gmgnRefreshError && (
          <p className="text-sm text-destructive" role="alert">
            {gmgnRefreshError}
          </p>
        )}
        {isLoadingTokens && tokensPage === null ? (
          <p className="text-sm text-muted-foreground">Chargement des tokens…</p>
        ) : activeTokens.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            Aucun token pour ce rugger{tokenPurchaseFilter !== 'all' || tokenStatusFilter !== 'all' ? ' avec ces filtres' : ''}. Importe une liste JSON ci-dessus.
          </p>
        ) : (
          <>
            {isLoadingTokens && <p className="text-xs text-muted-foreground" aria-live="polite">Actualisation des données…</p>}
            <div className={cn('space-y-4 transition-opacity', isLoadingTokens && 'pointer-events-none opacity-60')}>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                <Label className="text-sm font-medium">Objectif commun</Label>
                <div className="flex rounded-md border text-xs">
                  <button type="button" onClick={() => setGlobalExitMode('percent')} className={cn('px-2 py-0.5 rounded-l-md transition-colors font-medium', globalExitMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>%</button>
                  <button type="button" onClick={() => setGlobalExitMode('mcap')} className={cn('px-2 py-0.5 rounded-r-md transition-colors font-medium', globalExitMode === 'mcap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>MCap</button>
                </div>
                {globalExitMode === 'percent'
                  ? <Input type="text" inputMode="decimal" className="w-24" value={globalTargetPercent} onChange={(e) => setGlobalTargetPercent(e.target.value)} placeholder="100" />
                  : <Input type="text" inputMode="decimal" className="w-32" value={globalTargetMcap} onChange={(e) => setGlobalTargetMcap(e.target.value)} placeholder="500000" />}
                <Button type="button" size="sm" disabled={isApplyingGlobalTarget || (globalExitMode === 'percent' ? !Number.isFinite(Number(globalTargetPercent.replace(',', '.'))) : !Number.isFinite(Number(globalTargetMcap.replace(',', '.'))) || Number(globalTargetMcap.replace(',', '.')) <= 0)} onClick={handleApplyGlobalTarget}>
                  {isApplyingGlobalTarget ? 'Application…' : 'Appliquer à tous'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {globalExitMode === 'percent' ? 'Applique le même % de sortie à tous les tokens.' : "Calcule le % de sortie pour chaque token en fonction de son point d'entrée."}
                </span>
              </div>
              <TokenTable tokens={tokensWithMetrics} onChangeTarget={handleChangeTarget} onChangeEntryPrice={handleChangeEntryPrice} onRefreshToken={handleRefreshTokenFromGmgn} refreshingTokenIds={refreshingTokenIds} onDeleteToken={handleDeleteToken} onToggleHidden={handleToggleHidden} migrationView={migrationView} onMigrationViewChange={handleMigrationViewChange} migrationKnownCount={migrationKnownTotal} />
              <div className="flex flex-wrap items-center justify-start gap-3">
                <span className="text-xs font-medium text-muted-foreground">Par page</span>
                <div className="flex rounded-md border text-xs">
                  {TOKEN_TABLE_PAGE_SIZES.map((n, i) => (
                    <button key={n} type="button" onClick={() => { setTokenTablePageSize(n); setPage(1); }}
                      className={cn('px-2.5 py-1 font-medium transition-colors', i === 0 && 'rounded-l-md', i === TOKEN_TABLE_PAGE_SIZES.length - 1 && 'rounded-r-md', i > 0 && 'border-l border-border', tokenTablePageSize === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
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
