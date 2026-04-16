'use client';

import { useCallback, useEffect, useState } from 'react';
import { TokenForm } from '@/components/TokenForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import type { Token } from '@/types/token';
import {
  localCustomDayRange,
  localGmgnAllTimeRange,
  localTodayPurchaseRange,
  localYesterdayPurchaseRange,
} from '@/lib/token-date-filter';
import { IconTrash } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { formatGmgnDecimalString } from '@/lib/gmgn/price-rounding';

export interface GmgnPreviewRow {
  rowKey: string;
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  truncatedKlines: boolean;
  entryStr: string;
  highStr: string;
  lowStr: string;
  sourceWallet?: string;
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

function mapApiPurchasesToRows(purchases: GmgnPurchasePreview[]): GmgnPreviewRow[] {
  return purchases.map((p) => ({
    rowKey: crypto.randomUUID(),
    tokenAddress: p.tokenAddress,
    name: p.name,
    purchasedAt: p.purchasedAt,
    truncatedKlines: p.truncatedKlines,
    entryStr: formatGmgnDecimalString(p.entryPrice),
    highStr: formatGmgnDecimalString(p.high),
    lowStr: formatGmgnDecimalString(p.low),
    sourceWallet: p.sourceWallet,
  }));
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

export default function GmgnTokenAddSection({
  knownTokens,
  loadKnownTokens,
  onAddPurchases,
  onManualAdd,
  headerActions,
  addAllButtonLabel = 'Tout ajouter',
  walletAddressPrefill,
}: GmgnTokenAddSectionProps) {
  const [tokenAddMode, setTokenAddMode] = useState<
    'manual' | 'walletBuyer' | 'motherExchange' | 'tokenTracking'
  >('walletBuyer');
  const [gmgnWalletInput, setGmgnWalletInput] = useState('');
  const [motherWalletText, setMotherWalletText] = useState('');
  const [tokenTrackingText, setTokenTrackingText] = useState('');
  const [gmgnFetchPeriod, setGmgnFetchPeriod] = useState<'today' | 'yesterday' | 'all' | 'custom'>('today');
  const [gmgnFetchFrom, setGmgnFetchFrom] = useState('');
  const [gmgnFetchTo, setGmgnFetchTo] = useState('');
  const [gmgnLoading, setGmgnLoading] = useState(false);
  const [gmgnError, setGmgnError] = useState<string | null>(null);
  const [gmgnPreview, setGmgnPreview] = useState<GmgnPreviewRow[] | null>(null);
  const [gmgnDedupeNotice, setGmgnDedupeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (walletAddressPrefill?.trim()) setGmgnWalletInput(walletAddressPrefill.trim());
  }, [walletAddressPrefill]);

  const resolveKnownTokens = useCallback(async () => {
    if (loadKnownTokens) return loadKnownTokens();
    return knownTokens;
  }, [loadKnownTokens, knownTokens]);

  const handleGmgnFetch = useCallback(async () => {
    setGmgnError(null);
    setGmgnPreview(null);
    setGmgnDedupeNotice(null);
    const w = gmgnWalletInput.trim();
    if (!w) {
      setGmgnError('Adresse wallet requise.');
      return;
    }
    const range =
      gmgnFetchPeriod === 'today'
        ? localTodayPurchaseRange()
        : gmgnFetchPeriod === 'yesterday'
          ? localYesterdayPurchaseRange()
          : gmgnFetchPeriod === 'all'
            ? localGmgnAllTimeRange()
            : gmgnFetchFrom && gmgnFetchTo
              ? localCustomDayRange(gmgnFetchFrom, gmgnFetchTo)
              : null;
    if (!range) {
      setGmgnError('Indique deux dates (début et fin) pour la plage personnalisée.');
      return;
    }
    setGmgnLoading(true);
    try {
      const existingTokens = await resolveKnownTokens();
      const knownMints = buildMintSet(existingTokens);
      const res = await fetch('/api/gmgn/wallet-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: w, fromMs: range.fromMs, toMs: range.toMs }),
      });
      const data = (await res.json()) as { purchases?: GmgnPurchasePreview[]; error?: string };
      if (!res.ok) {
        setGmgnError(data.error ?? 'Échec du fetch GMGN');
        return;
      }
      const rows = mapApiPurchasesToRows(data.purchases ?? []);
      const filtered = rows.filter((r) => !knownMints.has(r.tokenAddress.trim()));
      const skipped = rows.length - filtered.length;
      if (rows.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice('Aucun achat « buy » renvoyé par GMGN sur ce créneau.');
      } else if (filtered.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(`Les ${rows.length} achat(s) trouvé(s) sont déjà enregistrés.`);
      } else {
        setGmgnPreview(filtered);
        setGmgnDedupeNotice(
          skipped > 0 ? `${skipped} achat(s) déjà présent(s) — exclus de la liste.` : null
        );
      }
    } catch {
      setGmgnError('Erreur réseau');
    } finally {
      setGmgnLoading(false);
    }
  }, [gmgnWalletInput, gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo, resolveKnownTokens]);

  const handleMotherFetch = useCallback(async () => {
    setGmgnError(null);
    setGmgnPreview(null);
    setGmgnDedupeNotice(null);
    const wallets = parseWalletLines(motherWalletText);
    if (wallets.length === 0) {
      setGmgnError('Indique au moins une adresse wallet (une par ligne).');
      return;
    }
    if (wallets.length > 20) {
      setGmgnError('Maximum 20 adresses distinctes.');
      return;
    }
    const range =
      gmgnFetchPeriod === 'today'
        ? localTodayPurchaseRange()
        : gmgnFetchPeriod === 'yesterday'
          ? localYesterdayPurchaseRange()
          : gmgnFetchPeriod === 'all'
            ? localGmgnAllTimeRange()
            : gmgnFetchFrom && gmgnFetchTo
              ? localCustomDayRange(gmgnFetchFrom, gmgnFetchTo)
              : null;
    if (!range) {
      setGmgnError('Indique deux dates (début et fin) pour la plage personnalisée.');
      return;
    }
    setGmgnLoading(true);
    try {
      const existingTokens = await resolveKnownTokens();
      const knownMints = buildMintSet(existingTokens);
      const res = await fetch('/api/gmgn/wallet-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddresses: wallets, fromMs: range.fromMs, toMs: range.toMs }),
      });
      const data = (await res.json()) as { purchases?: GmgnPurchasePreview[]; error?: string };
      if (!res.ok) {
        setGmgnError(data.error ?? 'Échec du fetch GMGN');
        return;
      }
      const rows = mapApiPurchasesToRows(data.purchases ?? []);
      const filtered = rows.filter((r) => !knownMints.has(r.tokenAddress.trim()));
      const skipped = rows.length - filtered.length;
      if (rows.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice('Aucun achat « buy » renvoyé par GMGN sur ce créneau.');
      } else if (filtered.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(`Les ${rows.length} achat(s) trouvé(s) sont déjà enregistrés.`);
      } else {
        setGmgnPreview(filtered);
        setGmgnDedupeNotice(
          skipped > 0 ? `${skipped} achat(s) déjà présent(s) — exclus de la liste.` : null
        );
      }
    } catch {
      setGmgnError('Erreur réseau');
    } finally {
      setGmgnLoading(false);
    }
  }, [motherWalletText, gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo, resolveKnownTokens]);

  const handleTokenTrackingFetch = useCallback(async () => {
    setGmgnError(null);
    setGmgnPreview(null);
    setGmgnDedupeNotice(null);
    const tokenList = parseWalletLines(tokenTrackingText);
    if (tokenList.length === 0) {
      setGmgnError('Indique au moins une adresse token (une par ligne).');
      return;
    }
    if (tokenList.length > 30) {
      setGmgnError('Maximum 30 tokens distincts.');
      return;
    }
    const range =
      gmgnFetchPeriod === 'today'
        ? localTodayPurchaseRange()
        : gmgnFetchPeriod === 'yesterday'
          ? localYesterdayPurchaseRange()
          : gmgnFetchPeriod === 'all'
            ? localGmgnAllTimeRange()
            : gmgnFetchFrom && gmgnFetchTo
              ? localCustomDayRange(gmgnFetchFrom, gmgnFetchTo)
              : null;
    if (!range) {
      setGmgnError('Indique deux dates (début et fin) pour la plage personnalisée.');
      return;
    }
    setGmgnLoading(true);
    try {
      const existingTokens = await resolveKnownTokens();
      const knownMints = buildMintSet(existingTokens);
      const res = await fetch('/api/gmgn/token-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenAddresses: tokenList,
          fromMs: range.fromMs,
          toMs: range.toMs,
        }),
      });
      const data = (await res.json()) as { purchases?: GmgnPurchasePreview[]; error?: string };
      if (!res.ok) {
        setGmgnError(data.error ?? 'Échec du fetch GMGN');
        return;
      }
      const rows = mapApiPurchasesToRows(data.purchases ?? []);
      const filtered = rows.filter((r) => !knownMints.has(r.tokenAddress.trim()));
      const skipped = rows.length - filtered.length;
      if (rows.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice('Aucune donnée GMGN trouvée pour ces tokens sur ce créneau.');
      } else if (filtered.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(`Les ${rows.length} token(s) trouvé(s) sont déjà enregistrés.`);
      } else {
        setGmgnPreview(filtered);
        setGmgnDedupeNotice(
          skipped > 0 ? `${skipped} token(s) déjà présent(s) — exclus de la liste.` : null
        );
      }
    } catch {
      setGmgnError('Erreur réseau');
    } finally {
      setGmgnLoading(false);
    }
  }, [tokenTrackingText, gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo, resolveKnownTokens]);

  const handleAddGmgnPurchases = useCallback(
    async (items: GmgnPreviewRow[]) => {
      if (items.length === 0) return;
      const existingTokens = await resolveKnownTokens();
      const knownMints = buildMintSet(existingTokens);
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
      setGmgnPreview((prev) => {
        if (!prev) return prev;
        return prev.map((r) => (r.rowKey === rowKey ? { ...r, [field]: value } : r));
      });
    },
    []
  );

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
              setGmgnPreview(null);
              setGmgnDedupeNotice(null);
              setGmgnError(null);
            }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              tokenAddMode === mode
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
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

      {(tokenAddMode === 'walletBuyer' ||
        tokenAddMode === 'motherExchange' ||
        tokenAddMode === 'tokenTracking') && (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">Période du fetch</span>
            <div className="flex flex-wrap items-center gap-2">
              {(['today', 'yesterday', 'all', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setGmgnFetchPeriod(p)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    gmgnFetchPeriod === p
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {p === 'today'
                    ? "Aujourd'hui"
                    : p === 'yesterday'
                      ? 'Hier'
                      : p === 'all'
                        ? 'Tous'
                        : 'Personnalisé'}
                </button>
              ))}
            </div>
          </div>
          {gmgnFetchPeriod === 'custom' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label>Du</Label>
                <DatePicker
                  value={parseYyyyMmDdToDate(gmgnFetchFrom)}
                  onChange={(date) => setGmgnFetchFrom(formatDateToYyyyMmDd(date))}
                  placeholder="Date de début"
                  className="w-[200px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Au</Label>
                <DatePicker
                  value={parseYyyyMmDdToDate(gmgnFetchTo)}
                  onChange={(date) => setGmgnFetchTo(formatDateToYyyyMmDd(date))}
                  placeholder="Date de fin"
                  className="w-[200px]"
                />
              </div>
            </div>
          )}
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
                  'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
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
                  'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
                )}
              />
            </div>
          )}
          {gmgnError && <p className="text-sm text-destructive">{gmgnError}</p>}
          <Button
            type="button"
            onClick={() =>
              void (tokenAddMode === 'motherExchange'
                ? handleMotherFetch()
                : tokenAddMode === 'tokenTracking'
                  ? handleTokenTrackingFetch()
                  : handleGmgnFetch())
            }
            disabled={gmgnLoading}
          >
            {gmgnLoading ? 'Chargement GMGN…' : 'Fetch achats'}
          </Button>
          {gmgnPreview && gmgnPreview.length > 0 && (
            <div className="space-y-3">
              {gmgnDedupeNotice && <p className="text-xs text-muted-foreground">{gmgnDedupeNotice}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {gmgnPreview.length} nouveau{gmgnPreview.length !== 1 ? 'x' : ''} achat
                  {gmgnPreview.length !== 1 ? 's' : ''} à ajouter
                </p>
                <Button type="button" size="sm" onClick={() => void handleAddGmgnPurchases(gmgnPreview)}>
                  {addAllButtonLabel}
                </Button>
              </div>
              <ul className="max-h-96 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3 text-sm">
                {gmgnPreview.map((p) => (
                  <li
                    key={p.rowKey}
                    className={cn(
                      'flex flex-col gap-3 rounded-md border bg-background/80 px-3 py-2',
                      p.truncatedKlines && 'border-2 border-red-500'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {p.tokenAddress}
                        </div>
                        {p.sourceWallet && (
                          <div className="truncate font-mono text-[10px] text-muted-foreground/90">
                            Wallet : {p.sourceWallet}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {new Date(p.purchasedAt).toLocaleString('fr-FR')}
                          {p.truncatedKlines && ' · kline non chargé (limite)'}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeGmgnPreviewRow(p.rowKey)}
                          aria-label="Retirer de la liste"
                        >
                          <IconTrash className="size-4" />
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void handleAddGmgnPurchases([p])}>
                          Ajouter
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Entrée</Label>
                        <Input
                          className="font-mono text-xs"
                          inputMode="decimal"
                          value={p.entryStr}
                          onChange={(e) => updateGmgnPreviewRow(p.rowKey, 'entryStr', e.target.value)}
                          placeholder="ex. 6.41"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">High</Label>
                        <Input
                          className="font-mono text-xs"
                          inputMode="decimal"
                          value={p.highStr}
                          onChange={(e) => updateGmgnPreviewRow(p.rowKey, 'highStr', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Low</Label>
                        <Input
                          className="font-mono text-xs"
                          inputMode="decimal"
                          value={p.lowStr}
                          onChange={(e) => updateGmgnPreviewRow(p.rowKey, 'lowStr', e.target.value)}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gmgnPreview !== null && gmgnPreview.length === 0 && !gmgnLoading && (
            <p className="text-sm text-muted-foreground">
              {gmgnDedupeNotice ?? 'Aucun nouveau token à ajouter.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
