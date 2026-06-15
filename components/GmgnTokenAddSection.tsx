'use client';

import { useCallback, useEffect, useState } from 'react';
import { TokenForm } from '@/components/TokenForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Token } from '@/types/token';
import {
  localCustomDayRange,
  localGmgnAllTimeRange,
  localTodayPurchaseRange,
  localYesterdayPurchaseRange,
} from '@/lib/token-date-filter';
import { cn } from '@/lib/utils';
import { formatGmgnDecimalString } from '@/lib/gmgn/price-rounding';
import { apiPost, ApiError } from '@/lib/api-client';
import { GmgnPeriodSelector, type GmgnFetchPeriod } from '@/features/ruggers/components/GmgnPeriodSelector';
import { GmgnPreviewList } from '@/features/ruggers/components/GmgnPreviewList';
import type { GmgnPreviewRow, GmgnPurchasePreview } from '@/features/ruggers/types';

export type { GmgnPreviewRow } from '@/features/ruggers/types';

export interface GmgnTokenAddSectionProps {
  /** Mint set for dedupe when `loadKnownTokens` is not provided. */
  knownTokens: Token[];
  /** When set, used before each fetch / add to resolve latest mints (ex. rugger API). */
  loadKnownTokens?: () => Promise<Token[]>;
  /** Return `false` if persistence failed so the preview stays open. */
  onAddPurchases: (items: GmgnPreviewRow[]) => boolean | void | Promise<boolean | void>;
  onManualAdd: (token: Token) => void | Promise<void>;
  headerActions?: React.ReactNode;
  addAllButtonLabel?: string;
  /** Prefills the single-wallet GMGN field when it changes. */
  walletAddressPrefill?: string | null;
}

// Vercel Hobby plafonne la fonction à 60s. Chaque requête = collect (jusqu'à
// GMGN_COLLECT_BUDGET_MS) + batch klines (650 ms/appel, throttle GMGN). 25 klines
// ≈ 16s : combiné au collect, ça tient sous 60s avec marge pour les pénalités 429.
const GMGN_KLINE_BATCH_SIZE = 25;

function gmgnErrorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Erreur réseau';
}

function resolveGmgnRange(period: GmgnFetchPeriod, from: string, to: string) {
  if (period === 'today') return localTodayPurchaseRange();
  if (period === 'yesterday') return localYesterdayPurchaseRange();
  if (period === 'all') return localGmgnAllTimeRange();
  return from && to ? localCustomDayRange(from, to) : null;
}

function mapApiPurchasesToRows(purchases: GmgnPurchasePreview[]): GmgnPreviewRow[] {
  return purchases.map((p) => ({
    rowKey: p.tokenAddress.trim(),
    tokenAddress: p.tokenAddress,
    name: p.name,
    purchasedAt: p.purchasedAt,
    truncatedKlines: p.truncatedKlines,
    entryStr: formatGmgnDecimalString(p.entryPrice),
    highStr: formatGmgnDecimalString(p.high),
    lowStr: formatGmgnDecimalString(p.low),
    entryToLowMinutes: p.entryToLowMinutes ?? null,
    sourceWallet: p.sourceWallet,
  }));
}

function mergeKlinePatchesIntoRows(rows: GmgnPreviewRow[], patches: GmgnPurchasePreview[]): GmgnPreviewRow[] {
  const byMint = new Map(patches.map((p) => [p.tokenAddress.trim(), p] as const));
  return rows.map((row) => {
    const p = byMint.get(row.tokenAddress.trim());
    if (!p) return row;
    return {
      ...row,
      truncatedKlines: p.truncatedKlines,
      entryStr: formatGmgnDecimalString(p.entryPrice),
      highStr: formatGmgnDecimalString(p.high),
      lowStr: formatGmgnDecimalString(p.low),
    };
  });
}

interface GmgnWalletPurchasesMeta {
  totalPurchases: number;
  klineSliceOffset: number;
  klineSliceBatchSize: number;
  klineEnrichCap: number;
  enrichedCountThisRequest: number;
  serverMaxKlineCap: number;
}

function parseWalletLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const a = line.trim();
    if (a === '' || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

function buildMintSet(tokens: Token[]): Set<string> {
  const s = new Set<string>();
  for (const t of tokens) {
    const m = (t.tokenAddress?.trim() || t.name?.trim()) ?? '';
    if (m !== '') s.add(m);
  }
  return s;
}

type AddMode = 'manual' | 'walletBuyer' | 'motherExchange' | 'tokenTracking';

export default function GmgnTokenAddSection({
  knownTokens,
  loadKnownTokens,
  onAddPurchases,
  onManualAdd,
  headerActions,
  addAllButtonLabel = 'Tout ajouter',
  walletAddressPrefill,
}: GmgnTokenAddSectionProps) {
  const [tokenAddMode, setTokenAddMode] = useState<AddMode>('walletBuyer');
  const [gmgnWalletInput, setGmgnWalletInput] = useState('');
  const [motherWalletText, setMotherWalletText] = useState('');
  const [tokenTrackingText, setTokenTrackingText] = useState('');
  const [gmgnFetchPeriod, setGmgnFetchPeriod] = useState<GmgnFetchPeriod>('today');
  const [gmgnFetchFrom, setGmgnFetchFrom] = useState('');
  const [gmgnFetchTo, setGmgnFetchTo] = useState('');
  const [gmgnKlineBudgetStr, setGmgnKlineBudgetStr] = useState('300');
  const [gmgnLoading, setGmgnLoading] = useState(false);
  const [gmgnEnrichingMore, setGmgnEnrichingMore] = useState(false);
  const [gmgnEnrichProgress, setGmgnEnrichProgress] = useState<string | null>(null);
  const [gmgnError, setGmgnError] = useState<string | null>(null);
  const [gmgnPreview, setGmgnPreview] = useState<GmgnPreviewRow[] | null>(null);
  const [gmgnDedupeNotice, setGmgnDedupeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (walletAddressPrefill?.trim()) setGmgnWalletInput(walletAddressPrefill.trim());
  }, [walletAddressPrefill]);

  const resolveKnownTokens = useCallback(
    async () => (loadKnownTokens ? loadKnownTokens() : knownTokens),
    [loadKnownTokens, knownTokens]
  );

  const resetGmgnState = useCallback(() => {
    setGmgnError(null);
    setGmgnPreview(null);
    setGmgnDedupeNotice(null);
  }, []);

  /** Applique rows fetchées : dédup contre les mints connus + messages d'état. */
  const applyFetchedRows = useCallback(
    (rows: GmgnPreviewRow[], knownMints: Set<string>, noun: 'achat' | 'token', emptyMessage: string) => {
      const filtered = rows.filter((r) => !knownMints.has(r.tokenAddress.trim()));
      const skipped = rows.length - filtered.length;
      if (rows.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(emptyMessage);
      } else if (filtered.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(`Les ${rows.length} ${noun}(s) trouvé(s) sont déjà enregistrés.`);
      } else {
        setGmgnPreview(filtered);
        setGmgnDedupeNotice(skipped > 0 ? `${skipped} ${noun}(s) déjà présent(s) — exclus de la liste.` : null);
      }
    },
    []
  );

  // --- Wallet buyer : fetch + enrichissement klines incrémental ---
  const handleGmgnFetch = useCallback(async () => {
    resetGmgnState();
    const w = gmgnWalletInput.trim();
    if (!w) {
      setGmgnError('Adresse wallet requise.');
      return;
    }
    const range = resolveGmgnRange(gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo);
    if (!range) {
      setGmgnError('Indique deux dates (début et fin) pour la plage personnalisée.');
      return;
    }
    setGmgnLoading(true);
    setGmgnEnrichingMore(false);
    setGmgnEnrichProgress(null);
    try {
      const knownMints = buildMintSet(await resolveKnownTokens());
      const budgetParsed = Math.floor(Number(String(gmgnKlineBudgetStr).replace(',', '.')));
      const budget = Number.isFinite(budgetParsed) && budgetParsed >= 1 ? Math.min(budgetParsed, 5000) : 300;

      const data1 = await apiPost<{ purchases?: GmgnPurchasePreview[]; meta?: GmgnWalletPurchasesMeta }>(
        '/api/gmgn/wallet-purchases',
        {
          walletAddress: w,
          fromMs: range.fromMs,
          toMs: range.toMs,
          klineEnrichTotalCap: budget,
          klineEnrichOffset: 0,
          klineEnrichBatchSize: GMGN_KLINE_BATCH_SIZE,
        }
      );
      const rowsAll = mapApiPurchasesToRows(data1.purchases ?? []);
      applyFetchedRows(rowsAll, knownMints, 'achat', 'Aucun achat « buy » renvoyé par GMGN sur ce créneau.');
      if (rowsAll.length === 0 || rowsAll.every((r) => knownMints.has(r.tokenAddress.trim()))) return;
      setGmgnLoading(false);

      const meta = data1.meta;
      if (!meta) return;
      const enrichLimit = Math.min(meta.klineEnrichCap, meta.totalPurchases);
      let off = meta.klineSliceBatchSize;
      if (off >= enrichLimit) return;

      setGmgnEnrichingMore(true);
      setGmgnEnrichProgress(`${Math.min(off, enrichLimit)} / ${enrichLimit}`);
      try {
        while (off < enrichLimit) {
          let patches: GmgnPurchasePreview[];
          try {
            const dataN = await apiPost<{ purchasePatches?: GmgnPurchasePreview[] }>('/api/gmgn/wallet-purchases', {
              walletAddress: w,
              fromMs: range.fromMs,
              toMs: range.toMs,
              klineEnrichTotalCap: budget,
              klineEnrichOffset: off,
              klineEnrichBatchSize: GMGN_KLINE_BATCH_SIZE,
              klineSliceOnly: true,
            });
            patches = dataN.purchasePatches ?? [];
          } catch (e) {
            setGmgnError(e instanceof ApiError ? e.message : `Enrichissement kline interrompu après ${off} token(s).`);
            break;
          }
          setGmgnPreview((prev) => (prev ? mergeKlinePatchesIntoRows(prev, patches) : prev));
          off += GMGN_KLINE_BATCH_SIZE;
          setGmgnEnrichProgress(`${Math.min(off, enrichLimit)} / ${enrichLimit}`);
        }
      } finally {
        setGmgnEnrichingMore(false);
        setGmgnEnrichProgress(null);
      }
    } catch (e) {
      setGmgnError(gmgnErrorMessage(e));
    } finally {
      setGmgnLoading(false);
    }
  }, [gmgnWalletInput, gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo, gmgnKlineBudgetStr, resolveKnownTokens, resetGmgnState, applyFetchedRows]);

  // --- Mother / Exchange + Token tracking : fetch batch simple ---
  const runBatchFetch = useCallback(
    async (config: {
      values: string[];
      emptyValuesError: string;
      tooManyError: string;
      maxCount: number;
      endpoint: string;
      body: (range: { fromMs: number; toMs: number }) => Record<string, unknown>;
      noun: 'achat' | 'token';
      emptyMessage: string;
    }) => {
      resetGmgnState();
      if (config.values.length === 0) {
        setGmgnError(config.emptyValuesError);
        return;
      }
      if (config.values.length > config.maxCount) {
        setGmgnError(config.tooManyError);
        return;
      }
      const range = resolveGmgnRange(gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo);
      if (!range) {
        setGmgnError('Indique deux dates (début et fin) pour la plage personnalisée.');
        return;
      }
      setGmgnLoading(true);
      try {
        const knownMints = buildMintSet(await resolveKnownTokens());
        const data = await apiPost<{ purchases?: GmgnPurchasePreview[] }>(config.endpoint, config.body(range));
        applyFetchedRows(mapApiPurchasesToRows(data.purchases ?? []), knownMints, config.noun, config.emptyMessage);
      } catch (e) {
        setGmgnError(gmgnErrorMessage(e));
      } finally {
        setGmgnLoading(false);
      }
    },
    [gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo, resolveKnownTokens, resetGmgnState, applyFetchedRows]
  );

  const handleMotherFetch = useCallback(
    () =>
      runBatchFetch({
        values: parseWalletLines(motherWalletText),
        emptyValuesError: 'Indique au moins une adresse wallet (une par ligne).',
        tooManyError: 'Maximum 20 adresses distinctes.',
        maxCount: 20,
        endpoint: '/api/gmgn/wallet-purchases',
        body: (range) => ({ walletAddresses: parseWalletLines(motherWalletText), fromMs: range.fromMs, toMs: range.toMs }),
        noun: 'achat',
        emptyMessage: 'Aucun achat « buy » renvoyé par GMGN sur ce créneau.',
      }),
    [motherWalletText, runBatchFetch]
  );

  const handleTokenTrackingFetch = useCallback(
    () =>
      runBatchFetch({
        values: parseWalletLines(tokenTrackingText),
        emptyValuesError: 'Indique au moins une adresse token (une par ligne).',
        tooManyError: 'Maximum 30 tokens distincts.',
        maxCount: 30,
        endpoint: '/api/gmgn/token-tracking',
        body: (range) => ({ tokenAddresses: parseWalletLines(tokenTrackingText), fromMs: range.fromMs, toMs: range.toMs }),
        noun: 'token',
        emptyMessage: 'Aucune donnée GMGN trouvée pour ces tokens sur ce créneau.',
      }),
    [tokenTrackingText, runBatchFetch]
  );

  const handleAddGmgnPurchases = useCallback(
    async (items: GmgnPreviewRow[]) => {
      if (items.length === 0) return;
      const knownMints = buildMintSet(await resolveKnownTokens());
      const newItems = items.filter((p) => !knownMints.has(p.tokenAddress.trim()));
      if (newItems.length === 0) return;
      const result = await onAddPurchases(newItems);
      if (result === false) return;
      setGmgnPreview(null);
      setGmgnDedupeNotice(null);
    },
    [onAddPurchases, resolveKnownTokens]
  );

  const removeGmgnPreviewRow = useCallback((rowKey: string) => {
    setGmgnPreview((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.rowKey !== rowKey);
      return next.length === 0 ? null : next;
    });
  }, []);

  const updateGmgnPreviewRow = useCallback(
    (rowKey: string, field: 'entryStr' | 'highStr' | 'lowStr', value: string) => {
      setGmgnPreview((prev) => (prev ? prev.map((r) => (r.rowKey === rowKey ? { ...r, [field]: value } : r)) : prev));
    },
    []
  );

  const isFetchInProgress = gmgnLoading || gmgnEnrichingMore;

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow sm:p-6">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-3">
        <h2 className="text-lg font-semibold leading-tight">Ajouter des tokens</h2>
        {headerActions}
      </div>
      <div className="flex flex-wrap gap-2">
        {(['walletBuyer', 'motherExchange', 'tokenTracking', 'manual'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              setTokenAddMode(mode);
              resetGmgnState();
            }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              tokenAddMode === mode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {mode === 'walletBuyer'
              ? 'Wallet Buyer Tracking'
              : mode === 'motherExchange'
                ? 'Mother / Exchange Tracking'
                : mode === 'tokenTracking'
                  ? 'Token Tracking'
                  : 'Ajout manuel'}
          </button>
        ))}
      </div>

      {tokenAddMode === 'manual' && <TokenForm onAdd={(t) => void onManualAdd(t)} />}

      {tokenAddMode !== 'manual' && (
        <div className="space-y-4">
          <GmgnPeriodSelector
            period={gmgnFetchPeriod}
            onPeriodChange={setGmgnFetchPeriod}
            from={gmgnFetchFrom}
            onFromChange={setGmgnFetchFrom}
            to={gmgnFetchTo}
            onToChange={setGmgnFetchTo}
          />

          {tokenAddMode === 'walletBuyer' && (
            <div className="mt-4 flex max-w-2xl flex-col gap-3">
              <Label htmlFor="gmgn-wallet" className="block text-sm font-medium leading-normal">
                Adresse wallet
              </Label>
              <Input
                id="gmgn-wallet"
                value={gmgnWalletInput}
                onChange={(e) => setGmgnWalletInput(e.target.value)}
                placeholder="Adresse Solana"
                className="w-full font-mono text-sm"
              />
              <div className="space-y-2">
                <Label htmlFor="gmgn-kline-budget" className="text-sm font-medium leading-normal">
                  Budget klines (nombre max de tokens à enrichir avec courbes GMGN)
                </Label>
                <Input
                  id="gmgn-kline-budget"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={5000}
                  value={gmgnKlineBudgetStr}
                  onChange={(e) => setGmgnKlineBudgetStr(e.target.value)}
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Chargement par paquets de {GMGN_KLINE_BATCH_SIZE} : les premiers tokens s&apos;affichent tout de suite, puis le reste se met à jour. Le serveur applique aussi un plafond (variable{' '}
                  <span className="font-mono">GMGN_MAX_KLINE_ENRICH_CAP</span>, défaut 2000).
                </p>
              </div>
            </div>
          )}
          {tokenAddMode === 'motherExchange' && (
            <div className="mt-4 flex max-w-2xl flex-col gap-3">
              <Label htmlFor="mother-wallets" className="block text-sm font-medium leading-normal">
                Adresses wallet (une par ligne)
              </Label>
              <textarea
                id="mother-wallets"
                value={motherWalletText}
                onChange={(e) => setMotherWalletText(e.target.value)}
                placeholder="Colle une ou plusieurs adresses Solana…"
                rows={5}
                className={cn(
                  'min-h-[120px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-[color,box-shadow] outline-none',
                  'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              />
            </div>
          )}
          {tokenAddMode === 'tokenTracking' && (
            <div className="mt-4 flex max-w-2xl flex-col gap-3">
              <Label htmlFor="token-tracking" className="block text-sm font-medium leading-normal">
                Adresses token (une par ligne)
              </Label>
              <textarea
                id="token-tracking"
                value={tokenTrackingText}
                onChange={(e) => setTokenTrackingText(e.target.value)}
                placeholder="Colle une ou plusieurs adresses de token Solana…"
                rows={5}
                className={cn(
                  'min-h-[120px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-[color,box-shadow] outline-none',
                  'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              />
            </div>
          )}

          {gmgnError && <p className="text-sm text-destructive">{gmgnError}</p>}
          {gmgnEnrichProgress !== null && (
            <p className="text-xs text-muted-foreground">Enrichissement klines : {gmgnEnrichProgress}</p>
          )}
          <Button
            type="button"
            onClick={() =>
              void (tokenAddMode === 'motherExchange'
                ? handleMotherFetch()
                : tokenAddMode === 'tokenTracking'
                  ? handleTokenTrackingFetch()
                  : handleGmgnFetch())
            }
            disabled={isFetchInProgress}
          >
            {gmgnLoading ? 'Chargement GMGN…' : gmgnEnrichingMore ? 'Enrichissement klines…' : 'Fetch achats'}
          </Button>

          {gmgnPreview && gmgnPreview.length > 0 && (
            <GmgnPreviewList
              rows={gmgnPreview}
              dedupeNotice={gmgnDedupeNotice}
              addAllLabel={addAllButtonLabel}
              onAddAll={() => void handleAddGmgnPurchases(gmgnPreview)}
              onAddOne={(p) => void handleAddGmgnPurchases([p])}
              onRemove={removeGmgnPreviewRow}
              onUpdateField={updateGmgnPreviewRow}
            />
          )}
          {gmgnPreview !== null && gmgnPreview.length === 0 && !gmgnLoading && (
            <p className="text-sm text-muted-foreground">{gmgnDedupeNotice ?? 'Aucun nouveau token à ajouter.'}</p>
          )}
        </div>
      )}
    </section>
  );
}
