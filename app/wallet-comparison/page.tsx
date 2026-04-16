'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { endOfDay, format, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { WatchlistWallet } from '@/types/watchlist';
import type { Rugger } from '@/types/rugger';
import type { CachedWalletComparison, CompareResponseSnapshot } from '@/lib/wallet-comparison/session-comparison-cache';
import {
  clearWalletComparisonSessionCache,
  getWalletComparisonSessionCache,
  pushWalletComparisonSessionCache,
  removeWalletComparisonSessionEntry,
} from '@/lib/wallet-comparison/session-comparison-cache';
import { aggregateAnalysesForGlobalBest } from '@/lib/wallet-comparison/meta-compare-analyses';
import type { MetaWalletAggregate } from '@/lib/wallet-comparison/meta-compare-analyses';
import {
  clearWalletsUsedHistory,
  getWalletsUsedHistory,
  recordWalletsUsed,
  removeWalletUsedEntry,
} from '@/lib/wallet-comparison/wallet-used-history';
import type { WalletUsedEntry } from '@/lib/wallet-comparison/wallet-used-history';
import WalletGmgnTokenPanel from '@/components/wallet-comparison/WalletGmgnTokenPanel';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  LineChart,
  Loader2,
  Plus,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';

function truncateAddress(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

type RangePreset = '30' | '90' | '180' | 'custom';

type CompareResponse = CompareResponseSnapshot;

interface LogEntry {
  time: Date;
  message: string;
}

interface ProgressState {
  totalWallets: number;
  index: number;
  currentWallet: string | null;
}

function walletKey(addr: string) {
  return addr.trim().toLowerCase();
}

function addWalletUnique(list: string[], addr: string): string[] {
  const k = walletKey(addr);
  if (k === '') return list;
  if (list.some((w) => walletKey(w) === k)) return list;
  return [...list, addr.trim()];
}

function removeWalletAt(list: string[], index: number): string[] {
  return list.filter((_, i) => i !== index);
}

function formatLogTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function WalletComparisonPage() {
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [rangePreset, setRangePreset] = useState<RangePreset>('180');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [watchlist, setWatchlist] = useState<WatchlistWallet[]>([]);
  const [ruggers, setRuggers] = useState<Rugger[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(true);

  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [sessionCache, setSessionCache] = useState<CachedWalletComparison[]>([]);
  const [walletHistory, setWalletHistory] = useState<WalletUsedEntry[]>([]);
  const [metaSelectedIds, setMetaSelectedIds] = useState<string[]>([]);
  const [metaSummary, setMetaSummary] = useState<{
    aggregates: MetaWalletAggregate[];
    globalBestWallets: string[];
    analysisCount: number;
    fromMs: number;
    toMs: number;
  } | null>(null);
  const [gmgnPanel, setGmgnPanel] = useState<{ walletAddress: string; fromMs: number; toMs: number } | null>(null);
  const [copiedWalletHint, setCopiedWalletHint] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, { time: new Date(), message }]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const fetchLists = useCallback(async () => {
    setIsLoadingLists(true);
    try {
      const [wRes, rRes] = await Promise.all([
        fetch('/api/watchlist'),
        fetch('/api/ruggers?pageSize=100'),
      ]);
      if (wRes.ok) {
        const d = (await wRes.json()) as { wallets: WatchlistWallet[] };
        setWatchlist(d.wallets);
      }
      if (rRes.ok) {
        const d = (await rRes.json()) as { ruggers: Rugger[] };
        setRuggers(d.ruggers);
      }
    } finally {
      setIsLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    void fetchLists();
  }, [fetchLists]);

  useEffect(() => {
    setSessionCache(getWalletComparisonSessionCache());
    setWalletHistory(getWalletsUsedHistory());
  }, []);

  const rangeMs = useMemo(() => {
    if (rangePreset === 'custom') return null;
    const days = Number(rangePreset);
    return days * 24 * 60 * 60 * 1000;
  }, [rangePreset]);

  const handleAddManual = useCallback(() => {
    setError(null);
    const v = manualInput.trim();
    if (!v) return;
    setSelectedWallets((prev) => addWalletUnique(prev, v));
    setManualInput('');
    setWalletHistory(recordWalletsUsed([v]));
  }, [manualInput]);

  const resolveTimeBounds = useCallback(() => {
    const toMs = Date.now();
    if (rangePreset === 'custom') {
      if (!dateRange?.from || !dateRange?.to) return null;
      const fromMs = startOfDay(dateRange.from).getTime();
      const endMs = endOfDay(dateRange.to).getTime();
      if (fromMs > endMs) return null;
      return { fromMs, toMs: endMs };
    }
    if (rangeMs !== null) {
      return { fromMs: toMs - rangeMs, toMs };
    }
    return { fromMs: toMs - 180 * 24 * 60 * 60 * 1000, toMs };
  }, [rangePreset, rangeMs, dateRange]);

  const calendarLabel = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return `${format(dateRange.from, 'd MMM yyyy', { locale: fr })} — ${format(dateRange.to, 'd MMM yyyy', { locale: fr })}`;
    }
    return 'Choisir une plage';
  }, [dateRange]);

  const handleCancelCompare = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const copyWalletAddress = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedWalletHint(address);
      window.setTimeout(() => {
        setCopiedWalletHint((prev) => (prev === address ? null : prev));
      }, 1500);
    } catch {
      setError('Impossible de copier dans le presse-papiers.');
    }
  }, []);

  const handleCompare = useCallback(async () => {
    setError(null);
    setInfoMessage(null);
    setResult(null);
    setGmgnPanel(null);
    setLogs([]);
    setProgress(null);
    if (selectedWallets.length < 2) {
      setError('Ajoute au moins 2 wallets à comparer.');
      return;
    }
    const bounds = resolveTimeBounds();
    if (!bounds) {
      setError('Choisis une plage de dates complète (début et fin).');
      return;
    }

    const walletSnapshot = [...selectedWallets];
    const boundsSnapshot = { fromMs: bounds.fromMs, toMs: bounds.toMs };

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsComparing(true);
    try {
      const res = await fetch('/api/wallet-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          walletAddresses: selectedWallets,
          fromMs: bounds.fromMs,
          toMs: bounds.toMs,
          stream: true,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Erreur ${res.status}`);
        return;
      }

      if (!res.body) {
        setError('Réponse vide (flux).');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '') continue;
          const event = JSON.parse(trimmed) as
            | { type: 'started'; totalWallets: number; message: string }
            | {
                type: 'progress';
                message: string;
                index?: number;
                total?: number;
                currentWallet?: string;
              }
            | {
                type: 'wallet_done';
                walletAddress: string;
                ok: boolean;
                mintCount?: number;
                error?: string;
                message?: string;
              }
            | { type: 'done'; payload: CompareResponse }
            | { type: 'error'; error: string; partialFailures?: Array<{ walletAddress: string; error: string }> }
            | { type: 'cancelled'; message?: string };

          if (event.type === 'started') {
            setProgress({
              totalWallets: event.totalWallets,
              index: 0,
              currentWallet: null,
            });
            appendLog(event.message);
          } else if (event.type === 'progress') {
            appendLog(event.message);
            if (event.total !== undefined && event.index !== undefined) {
              setProgress({
                totalWallets: event.total,
                index: event.index,
                currentWallet: event.currentWallet ?? null,
              });
            }
          } else if (event.type === 'wallet_done') {
            appendLog(event.message ?? (event.ok ? 'OK' : event.error ?? 'Erreur'));
          } else if (event.type === 'done') {
            setResult(event.payload);
            setWalletHistory(recordWalletsUsed(walletSnapshot));
            setSessionCache(
              pushWalletComparisonSessionCache({
                walletAddressesRequested: walletSnapshot,
                fromMs: boundsSnapshot.fromMs,
                toMs: boundsSnapshot.toMs,
                result: event.payload,
              })
            );
            appendLog('Comparaison terminée.');
            setProgress(null);
          } else if (event.type === 'error') {
            setError(event.error);
            if (event.partialFailures?.length) {
              appendLog(`${event.partialFailures.length} wallet(s) en échec.`);
            }
            setProgress(null);
          } else if (event.type === 'cancelled') {
            setInfoMessage(event.message ?? 'Comparaison annulée.');
            setProgress(null);
            appendLog('Annulé.');
          }
        }
      }
    } catch (err) {
      const isAbort =
        (err instanceof DOMException || err instanceof Error) && (err as Error).name === 'AbortError';
      if (isAbort) {
        setInfoMessage('Comparaison annulée.');
        appendLog('Annulé (AbortError).');
      } else {
        setError('Erreur réseau.');
      }
    } finally {
      abortRef.current = null;
      setIsComparing(false);
    }
  }, [selectedWallets, resolveTimeBounds, appendLog]);

  const handleOpenCachedComparison = useCallback((entry: CachedWalletComparison) => {
    setError(null);
    setInfoMessage(null);
    setGmgnPanel(null);
    setResult(entry.result);
    setSelectedWallets([...entry.walletAddressesRequested]);
    setWalletHistory(recordWalletsUsed(entry.walletAddressesRequested));
    setRangePreset('custom');
    setDateRange({
      from: new Date(entry.fromMs),
      to: new Date(entry.toMs),
    });
  }, []);

  const handleRemoveCachedComparison = useCallback((id: string) => {
    setSessionCache(removeWalletComparisonSessionEntry(id));
    setMetaSelectedIds((prev) => prev.filter((x) => x !== id));
    setMetaSummary(null);
  }, []);

  const handleClearSessionCache = useCallback(() => {
    clearWalletComparisonSessionCache();
    setSessionCache([]);
    setMetaSelectedIds([]);
    setMetaSummary(null);
  }, []);

  const toggleMetaAnalysisSelection = useCallback((id: string) => {
    setMetaSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setMetaSummary(null);
  }, []);

  const handleRunMetaCompare = useCallback(() => {
    setError(null);
    const selected = sessionCache.filter((e) => metaSelectedIds.includes(e.id));
    if (selected.length < 2) {
      setError('Coche au moins 2 analyses en cache pour la synthèse globale.');
      return;
    }
    const { aggregates, globalBestWallets } = aggregateAnalysesForGlobalBest(selected.map((s) => s.result));
    const fromMs = Math.min(...selected.map((s) => s.fromMs));
    const toMs = Math.max(...selected.map((s) => s.toMs));
    setMetaSummary({
      aggregates,
      globalBestWallets,
      analysisCount: selected.length,
      fromMs,
      toMs,
    });
  }, [sessionCache, metaSelectedIds]);

  const handleClearWalletHistory = useCallback(() => {
    clearWalletsUsedHistory();
    setWalletHistory([]);
  }, []);

  const handleRemoveHistoryEntry = useCallback((address: string) => {
    setWalletHistory(removeWalletUsedEntry(address));
  }, []);

  const formatEntry = (n: number) => {
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return '0';
    if (n < 0.0001) return n.toExponential(2);
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  return (
    <div className="space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comparaison de wallets</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Sur les tokens achetés en commun dans la période, le meilleur entrée (prix le plus bas, ex aequo : achat le
          plus ancien) remporte le point. Le score affiché est{' '}
          <span className="font-medium text-foreground">victoires / nombre de tokens communs</span>.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Historique des wallets (session)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Adresses déjà utilisées (comparaisons réussies ou ajouts). Clic + pour les remettre dans la liste à
              comparer.
            </p>
          </div>
          {walletHistory.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={handleClearWalletHistory}>
              Effacer l&apos;historique
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {walletHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune adresse encore — lance une comparaison ou ajoute un wallet ci-dessous.
            </p>
          ) : (
            <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
              {walletHistory.map((h) => (
                <li
                  key={walletKey(h.address)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/80 bg-muted/15 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs" title={h.address}>
                      {truncateAddress(h.address)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {h.useCount} utilisation(s) ·{' '}
                      {new Date(h.lastUsedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      title="Copier"
                      onClick={() => void copyWalletAddress(h.address)}
                    >
                      {copiedWalletHint === h.address ? (
                        <Check className="size-4 text-green-500" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2"
                      onClick={() => setSelectedWallets((prev) => addWalletUnique(prev, h.address))}
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-muted-foreground"
                      onClick={() => handleRemoveHistoryEntry(h.address)}
                      aria-label="Retirer cette adresse"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {sessionCache.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Analyses en cache (session)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Conservées dans le navigateur jusqu&apos;à fermeture de l&apos;onglet. Pas en base de données.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={handleClearSessionCache}>
              Tout effacer
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Coche plusieurs lignes puis lance la synthèse pour classer les wallets sur l&apos;ensemble des analyses
              sélectionnées (gagnants globaux + victoires cumulées).
            </p>
            <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
              {sessionCache.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-2 sm:px-3"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 rounded border-input"
                      checked={metaSelectedIds.includes(entry.id)}
                      onChange={() => toggleMetaAnalysisSelection(entry.id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{entry.label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {new Date(entry.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </span>
                  </label>
                  <div className="ml-auto flex shrink-0 flex-wrap gap-1">
                    <Button type="button" size="sm" variant="secondary" onClick={() => handleOpenCachedComparison(entry)}>
                      Ouvrir
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => handleRemoveCachedComparison(entry.id)}
                    >
                      Retirer
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleRunMetaCompare}>
                Synthèse globale ({metaSelectedIds.length} sélection(s))
              </Button>
              {metaSelectedIds.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setMetaSelectedIds([])}>
                  Décocher tout
                </Button>
              )}
            </div>

            {metaSummary && (
              <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium">
                  Meilleur(s) wallet(s) sur {metaSummary.analysisCount} analyse(s)
                </p>
                {metaSummary.globalBestWallets.length === 0 ? (
                  <p className="font-mono text-sm text-foreground">—</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {metaSummary.globalBestWallets.map((w) => (
                      <li
                        key={w}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                      >
                        <span className="font-mono text-xs" title={w}>
                          {w}
                        </span>
                        <div className="flex gap-1">
                          <Button type="button" size="sm" variant="outline" onClick={() => void copyWalletAddress(w)}>
                            {copiedWalletHint === w ? (
                              <Check className="size-3.5 text-green-500" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="gap-1"
                            onClick={() =>
                              setGmgnPanel({
                                walletAddress: w,
                                fromMs: metaSummary.fromMs,
                                toMs: metaSummary.toMs,
                              })
                            }
                          >
                            <LineChart className="size-3.5" />
                            Tokens
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Classement : nombre de fois « gagnant global » de l&apos;analyse, puis victoires cumulées sur tokens
                  communs, puis nombre d&apos;analyses où le wallet était présent.
                </p>
                <div className="overflow-x-auto rounded-md border bg-background">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead className="bg-muted/60 text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 text-left">Wallet</th>
                        <th className="px-2 py-2 text-right">Gagnant global</th>
                        <th className="px-2 py-2 text-right">Victoires Σ</th>
                        <th className="px-2 py-2 text-right">Analyses</th>
                        <th className="px-2 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metaSummary.aggregates.map((row) => (
                        <tr key={row.walletAddress} className="border-t border-border">
                          <td className="px-2 py-2 font-mono" title={row.walletAddress}>
                            {truncateAddress(row.walletAddress)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{row.timesTopWinner}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{row.winsTotal}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{row.analysesIncluded}</td>
                          <td className="px-2 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => void copyWalletAddress(row.walletAddress)}
                              >
                                {copiedWalletHint === row.walletAddress ? (
                                  <Check className="size-3 text-green-500" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-1.5"
                                title="GMGN sur la période couverte par les analyses sélectionnées"
                                onClick={() =>
                                  setGmgnPanel({
                                    walletAddress: row.walletAddress,
                                    fromMs: metaSummary.fromMs,
                                    toMs: metaSummary.toMs,
                                  })
                                }
                              >
                                <LineChart className="size-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Wallets à comparer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedWallets.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {selectedWallets.map((w, i) => (
                <li
                  key={`${walletKey(w)}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-sm font-mono"
                >
                  <span title={w}>{truncateAddress(w)}</span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    title="Copier l'adresse"
                    onClick={() => void copyWalletAddress(w)}
                  >
                    {copiedWalletHint === w ? (
                      <Check className="size-3.5 text-green-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label="Retirer"
                    onClick={() => setSelectedWallets((prev) => removeWalletAt(prev, i))}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[200px] flex-1 font-mono text-sm"
              placeholder="Coller une adresse Solana…"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddManual();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={handleAddManual}>
              <Plus className="mr-1 size-4" />
              Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Watchlist</CardTitle>
            <p className="text-xs text-muted-foreground">Ajouter une adresse depuis ta watchlist.</p>
          </CardHeader>
          <CardContent>
            {isLoadingLists ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : watchlist.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun wallet.{' '}
                <Link href="/watchlist" className="underline">
                  Gérer la watchlist
                </Link>
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                {watchlist.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1 hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate font-mono text-xs" title={w.walletAddress}>
                      {w.label ? `${w.label} · ` : ''}
                      {truncateAddress(w.walletAddress)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        setSelectedWallets((prev) => addWalletUnique(prev, w.walletAddress));
                        setWalletHistory(recordWalletsUsed([w.walletAddress]));
                      }}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ruggers (wallet principal)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Seule l&apos;adresse principale du rugger est ajoutée. Sans adresse, la ligne reste grisée.
            </p>
          </CardHeader>
          <CardContent>
            {isLoadingLists ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : ruggers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun rugger.{' '}
                <Link href="/rugger" className="underline">
                  Créer un rugger
                </Link>
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                {ruggers.map((r) => {
                  const addr = r.walletAddress?.trim() ?? '';
                  const disabled = addr === '';
                  return (
                    <li
                      key={r.id}
                      className={`flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1 ${
                        disabled ? 'text-muted-foreground opacity-60' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{r.name ?? `Rugger ${r.id.slice(0, 8)}`}</p>
                        {disabled ? (
                          <p className="text-[11px] text-muted-foreground">Pas d&apos;adresse principale</p>
                        ) : (
                          <p className="truncate font-mono text-[11px]" title={addr}>
                            {truncateAddress(addr)}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={disabled}
                        title={disabled ? 'Pas d\'adresse principale' : 'Ajouter ce wallet'}
                        onClick={() => {
                          setSelectedWallets((prev) => addWalletUnique(prev, addr));
                          setWalletHistory(recordWalletsUsed([addr]));
                        }}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Période</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['30', '90', '180'] as const).map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={rangePreset === d ? 'default' : 'outline'}
                onClick={() => {
                  setRangePreset(d);
                  setDateRange(undefined);
                }}
              >
                {d} jours
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={rangePreset === 'custom' ? 'default' : 'outline'}
              onClick={() => setRangePreset('custom')}
            >
              Personnalisé
            </Button>
          </div>
          {rangePreset === 'custom' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1">
                <Label>Plage (calendrier)</Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn('min-w-[240px] justify-start text-left font-normal', !dateRange?.from && 'text-muted-foreground')}
                    >
                      <CalendarDays className="mr-2 size-4" />
                      {calendarLabel}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={(r) => {
                        setDateRange(r);
                        if (r?.from && r?.to) {
                          setCalendarOpen(false);
                        }
                      }}
                      numberOfMonths={2}
                      locale={fr}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void handleCompare()} disabled={isComparing}>
          {isComparing ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Comparaison…
            </>
          ) : (
            'Comparer'
          )}
        </Button>
        {isComparing && (
          <Button type="button" variant="outline" onClick={handleCancelCompare}>
            Annuler
          </Button>
        )}
        {selectedWallets.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedWallets([])} disabled={isComparing}>
            <Trash2 className="mr-1 size-4" />
            Vider la liste
          </Button>
        )}
      </div>

      {(isComparing || logs.length > 0) && (
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between text-left text-xs font-medium"
            onClick={() => setShowLogs((v) => !v)}
          >
            <span className="inline-flex items-center gap-1.5">
              <Terminal className="size-3.5" />
              Journal
            </span>
            {showLogs ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {progress && isComparing && (
            <p className="mb-2 text-xs text-muted-foreground">
              Étape {progress.index}/{progress.totalWallets}
              {progress.currentWallet && (
                <>
                  {' '}
                  · <span className="font-mono text-foreground">{progress.currentWallet.slice(0, 10)}…</span>
                </>
              )}
            </p>
          )}
          {showLogs && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
              {logs.map((log, i) => (
                <p key={`${log.time.getTime()}-${i}`}>
                  <span className="text-muted-foreground/80">[{formatLogTime(log.time)}]</span> {log.message}
                </p>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {infoMessage && !error && <p className="text-sm text-muted-foreground">{infoMessage}</p>}

      {result && (
        <div className="space-y-4">
          {result.skippedWallets.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                {result.skippedWallets.length} wallet(s) ignoré(s) (erreur GMGN)
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                {result.skippedWallets.map((s) => (
                  <li key={s.walletAddress}>
                    <span className="font-mono">{truncateAddress(s.walletAddress)}</span> — {s.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Résultat</CardTitle>
              <p className="text-xs text-muted-foreground">
                Fenêtre : {new Date(result.fromMs).toLocaleString()} → {new Date(result.toMs).toLocaleString()} ·{' '}
                {result.walletsCompared.length} wallet(s) comparé(s)
                {result.skippedWallets.length > 0 ? ` (${result.skippedWallets.length} exclu(s))` : ''}
                {result.distinctMintUnionCount !== undefined && (
                  <>
                    {' '}
                    ·{' '}
                    <span className="font-medium text-foreground">
                      {result.commonMintCount} en commun sur {result.distinctMintUnionCount}
                    </span>{' '}
                    token(s) distinct(s) au total (union sur la période)
                  </>
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.commonMintCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun token en commun sur la période (intersection des achats retenus par mint).
                  {result.distinctMintUnionCount !== undefined && result.distinctMintUnionCount > 0 && (
                    <>
                      {' '}
                      Sur les wallets comparés,{' '}
                      <span className="font-medium text-foreground">{result.distinctMintUnionCount}</span> mint(s)
                      distinct(s) au total sur la période.
                    </>
                  )}
                </p>
              ) : (
                <>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">Meilleur(s) wallet(s)</p>
                    {result.globalWinnerWallets.length === 0 ? (
                      <p className="mt-1 text-lg font-semibold">—</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {result.globalWinnerWallets.map((w) => (
                          <li
                            key={w}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2"
                          >
                            <span className="font-mono text-sm" title={w}>
                              {w}
                            </span>
                            <div className="flex shrink-0 flex-wrap gap-1">
                              <Button type="button" size="sm" variant="outline" onClick={() => void copyWalletAddress(w)}>
                                {copiedWalletHint === w ? (
                                  <Check className="size-4 text-green-500" />
                                ) : (
                                  <Copy className="size-4" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="gap-1"
                                onClick={() =>
                                  setGmgnPanel({ walletAddress: w, fromMs: result.fromMs, toMs: result.toMs })
                                }
                              >
                                <LineChart className="size-3.5" />
                                Détails tokens
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {result.globalWinnerWallets.length > 0 && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Score sur tokens communs :{' '}
                        <span className="font-medium text-foreground">
                          {result.scores.find((s) => s.walletAddress === result.globalWinnerWallets[0])?.wins ?? 0}
                          {' / '}
                          {result.commonMintCount}
                        </span>
                        {result.globalWinnerWallets.length > 1 && (
                          <span className="ml-1">(ex aequo après départage)</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[360px] text-sm">
                      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Wallet</th>
                          <th className="px-3 py-2 text-right">Victoires</th>
                          <th className="px-3 py-2 text-right">%</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.scores.map((row) => (
                          <tr key={row.walletAddress} className="border-t border-border">
                            <td className="px-3 py-2 font-mono text-xs" title={row.walletAddress}>
                              {truncateAddress(row.walletAddress)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {row.wins} / {row.commonMintCount}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {row.winRatePercent.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title="Copier l'adresse"
                                  onClick={() => void copyWalletAddress(row.walletAddress)}
                                >
                                  {copiedWalletHint === row.walletAddress ? (
                                    <Check className="size-3.5 text-green-500" />
                                  ) : (
                                    <Copy className="size-3.5" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 gap-0 px-2"
                                  title="Analyse GMGN sur la période de la comparaison"
                                  onClick={() =>
                                    setGmgnPanel({
                                      walletAddress: row.walletAddress,
                                      fromMs: result.fromMs,
                                      toMs: result.toMs,
                                    })
                                  }
                                >
                                  <LineChart className="size-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 className="mb-1 text-sm font-medium">Détail par token commun</h3>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Pour chaque token : entrées triées de la meilleure à la moins bonne (prix d&apos;entrée croissant,
                      ex aequo : achat le plus ancien).
                    </p>
                    <div className="max-h-80 overflow-auto rounded-md border">
                      <table className="w-full min-w-[480px] text-xs">
                        <thead className="sticky top-0 bg-muted/80 text-[10px] uppercase text-muted-foreground">
                          <tr>
                            <th className="px-2 py-2 text-left">Token</th>
                            <th className="px-2 py-2 text-left">Gagnant</th>
                            <th className="px-2 py-2 text-left">Entrées</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.perMint.map((m) => (
                            <tr key={m.mint} className="border-t border-border align-top">
                              <td className="px-2 py-2">
                                <p className="font-medium">{m.tokenName ?? '—'}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">{truncateAddress(m.mint)}</p>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1 font-mono text-[10px]">
                                  <span>{truncateAddress(m.winnerWallet)}</span>
                                  <button
                                    type="button"
                                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                                    title="Copier le gagnant"
                                    onClick={() => void copyWalletAddress(m.winnerWallet)}
                                  >
                                    {copiedWalletHint === m.winnerWallet ? (
                                      <Check className="size-3 text-green-500" />
                                    ) : (
                                      <Copy className="size-3" />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <ul className="space-y-0.5">
                                  {m.entries.map((e) => (
                                    <li key={e.walletAddress} className="flex items-center gap-1 font-mono text-[10px]">
                                      <span>
                                        {truncateAddress(e.walletAddress)}: {formatEntry(e.entryPrice)}
                                      </span>
                                      <button
                                        type="button"
                                        className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                                        title="Copier l'adresse"
                                        onClick={() => void copyWalletAddress(e.walletAddress)}
                                      >
                                        {copiedWalletHint === e.walletAddress ? (
                                          <Check className="size-3 text-green-500" />
                                        ) : (
                                          <Copy className="size-3" />
                                        )}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {gmgnPanel && (
            <WalletGmgnTokenPanel
              walletAddress={gmgnPanel.walletAddress}
              fromMs={gmgnPanel.fromMs}
              toMs={gmgnPanel.toMs}
              onClose={() => setGmgnPanel(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
