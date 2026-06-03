'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Footprints,
  Loader2,
  RefreshCw,
  Route,
  ShieldAlert,
  Star,
  Target,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AddressTraceHop,
  AddressTraceStoppedBy,
  TracerType,
} from '@/types/address-trace';
import { solscanAccountHref, solscanTxHref } from '@/lib/solana-external-links';

interface LogEntry {
  time: Date;
  message: string;
}

interface StartedEvent {
  type: 'started';
  startAddress: string;
  tracerType: TracerType;
  minSol: number;
  maxSol: number;
  startCreatorCount?: number;
}

interface ProgressEvent {
  type: 'progress';
  message: string;
  depth?: number;
}

interface HopEvent {
  type: 'hop';
  hop: AddressTraceHop;
}

interface DoneEvent {
  type: 'done';
  stoppedBy: AddressTraceStoppedBy;
  fullJournal: AddressTraceHop[];
  fromCache: boolean;
}

interface ErrorEvent {
  type: 'error';
  error: string;
}

interface CancelledEvent {
  type: 'cancelled';
  message?: string;
}

type TraceEvent =
  | StartedEvent
  | ProgressEvent
  | HopEvent
  | DoneEvent
  | ErrorEvent
  | CancelledEvent;

const TRACER_OPTIONS: Array<{ id: TracerType; label: string }> = [
  { id: '7srsw', label: '7Srsw' },
  { id: '7srsw-v2', label: '7Srsw V2' },
];

function deobfuscatedLabel(tracerType: TracerType): string {
  return tracerType === '7srsw-v2' ? '7Srsw V2 déjoué' : '7Srsw déjoué';
}

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function truncateSignature(sig: string): string {
  if (sig.length <= 16) return sig;
  return `${sig.slice(0, 8)}…${sig.slice(-6)}`;
}

function formatLogTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatSol(amount: number): string {
  return amount.toLocaleString('fr-FR', { maximumFractionDigits: 6, minimumFractionDigits: 2 });
}

function CreatorStar({ count, className = '' }: { count: number; className?: string }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      title={`Créateur on-chain de ${count} token(s) (Helius DAS — Metaplex creators + update authority)`}
      aria-label={`Créateur on-chain de ${count} tokens`}
    >
      <Star className="size-3.5 fill-green-500 text-green-500" />
    </span>
  );
}

function stoppedByLabel(stoppedBy: AddressTraceStoppedBy): string {
  switch (stoppedBy) {
    case 'completed':
      return 'Traçage terminé.';
    case 'depth':
      return 'Profondeur maximale atteinte.';
    case 'exchange':
      return 'Adresse d’exchange détectée — arrêt.';
    case 'noisy':
      return 'Adresse trop bruyante (>500 transferts sortants) — arrêt.';
    case 'no_match':
      return 'Aucun transfert sortant dans la fenêtre — fin du chemin.';
    case 'circular':
      return 'Boucle détectée (adresse déjà visitée) — arrêt.';
    default:
      return 'Arrêt du traçage.';
  }
}

export default function AddressTracerPage() {
  const [startAddress, setStartAddress] = useState('');
  const [minSol, setMinSol] = useState('');
  const [maxSol, setMaxSol] = useState('');
  const [tracerType, setTracerType] = useState<TracerType>('7srsw');

  const [hops, setHops] = useState<AddressTraceHop[]>([]);
  const [stoppedBy, setStoppedBy] = useState<AddressTraceStoppedBy | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [startCreatorCount, setStartCreatorCount] = useState<number>(0);
  const [isDeletingCache, setIsDeletingCache] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, { time: new Date(), message }]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const minSolNum = useMemo(() => Number.parseFloat(minSol), [minSol]);
  const maxSolNum = useMemo(() => Number.parseFloat(maxSol), [maxSol]);

  const inputsValid = useMemo(() => {
    if (startAddress.trim() === '') return false;
    if (!Number.isFinite(minSolNum) || !Number.isFinite(maxSolNum)) return false;
    if (minSolNum < 0 || maxSolNum < 0) return false;
    if (minSolNum > maxSolNum) return false;
    return true;
  }, [startAddress, minSolNum, maxSolNum]);

  const finalAddress = useMemo(() => {
    if (hops.length > 0) return hops[hops.length - 1]!.to;
    return startAddress.trim();
  }, [hops, startAddress]);

  const creatorCountByAddress = useMemo(() => {
    const map = new Map<string, number>();
    const start = startAddress.trim();
    if (start !== '' && startCreatorCount > 0) map.set(start, startCreatorCount);
    for (const hop of hops) {
      const count = hop.toCreatorCount ?? 0;
      if (count > 0) map.set(hop.to, count);
    }
    return map;
  }, [hops, startAddress, startCreatorCount]);

  const creatorCountFor = useCallback(
    (address: string) => creatorCountByAddress.get(address) ?? 0,
    [creatorCountByAddress]
  );

  const finalCreatorCount = useMemo(
    () => creatorCountFor(finalAddress),
    [creatorCountFor, finalAddress]
  );

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied((prev) => (prev === text ? null : prev)), 1500);
    } catch {
      setError('Impossible de copier dans le presse-papiers.');
    }
  }, []);

  const runTrace = useCallback(
    async (opts: { forceRefresh: boolean }) => {
      setError(null);
      setInfoMessage(null);
      setStoppedBy(null);
      setFromCache(false);
      setHops([]);
      setStartCreatorCount(0);

      if (!inputsValid) {
        setError('Renseigne une adresse Solana et une fenêtre SOL valide (min ≤ max).');
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsTracing(true);

      try {
        const res = await fetch('/api/address-tracer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            startAddress: startAddress.trim(),
            minSol: minSolNum,
            maxSol: maxSolNum,
            tracerType,
            forceRefresh: opts.forceRefresh,
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
            const event = JSON.parse(trimmed) as TraceEvent;

            if (event.type === 'started') {
              appendLog(
                `Démarrage du traçage (${event.tracerType}) — fenêtre ${event.minSol}–${event.maxSol} SOL.`
              );
              const sc = event.startCreatorCount ?? 0;
              setStartCreatorCount(sc);
              if (sc > 0) {
                appendLog(`Adresse de départ : créateur de ${sc} token(s).`);
              }
            } else if (event.type === 'progress') {
              appendLog(event.message);
            } else if (event.type === 'hop') {
              setHops((prev) => [...prev, event.hop]);
              appendLog(
                `Hop ${event.hop.index} : ${truncateAddress(event.hop.from)} → ${truncateAddress(event.hop.to)} (${formatSol(event.hop.solAmount)} SOL)${event.hop.deobfuscated ? ` [${deobfuscatedLabel(event.hop.deobfuscatedVariant ?? event.hop.tracerType)}]` : ''}`
              );
            } else if (event.type === 'done') {
              setStoppedBy(event.stoppedBy);
              setFromCache(event.fromCache);
              setHops(event.fullJournal);
              appendLog(event.fromCache ? 'Restitué depuis le cache.' : stoppedByLabel(event.stoppedBy));
            } else if (event.type === 'error') {
              setError(event.error);
            } else if (event.type === 'cancelled') {
              setInfoMessage(event.message ?? 'Traçage annulé.');
            }
          }
        }
      } catch (err) {
        const isAbort =
          (err instanceof DOMException || err instanceof Error) && (err as Error).name === 'AbortError';
        if (isAbort) {
          setInfoMessage('Traçage annulé.');
        } else {
          setError(err instanceof Error ? err.message : 'Erreur réseau.');
        }
      } finally {
        abortRef.current = null;
        setIsTracing(false);
      }
    },
    [appendLog, inputsValid, maxSolNum, minSolNum, startAddress, tracerType]
  );

  const handleStart = useCallback(
    (forceRefresh: boolean) => {
      setLogs([]);
      void runTrace({ forceRefresh });
    },
    [runTrace]
  );

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setHops([]);
    setStoppedBy(null);
    setFromCache(false);
    setError(null);
    setInfoMessage(null);
    setLogs([]);
    setStartCreatorCount(0);
  }, []);

  const handleDeleteCache = useCallback(async () => {
    if (!inputsValid) {
      setError('Renseigne une adresse et une fenêtre SOL valide avant de vider le cache.');
      return;
    }
    setError(null);
    setInfoMessage(null);
    setIsDeletingCache(true);
    try {
      const res = await fetch('/api/address-tracer', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAddress: startAddress.trim(),
          minSol: minSolNum,
          maxSol: maxSolNum,
          tracerType,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status}`);
        return;
      }
      const n = data.deleted ?? 0;
      setInfoMessage(
        n > 0
          ? `Cache supprimé pour cette adresse et cette fenêtre.`
          : `Aucun cache existant à supprimer.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setIsDeletingCache(false);
    }
  }, [inputsValid, maxSolNum, minSolNum, startAddress, tracerType]);

  return (
    <div className="space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Footprints className="size-6" />
          Adresse Tracer
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Suit le chemin des fonds SOL à partir d&apos;une adresse de départ. Sur chaque saut, seuls les transferts
          sortants dont le montant tombe dans la fenêtre <span className="font-medium text-foreground">[min, max]</span>{' '}
          sont suivis. Le moteur prend toujours le transfert le plus récent ; le tracer{' '}
          <span className="font-medium text-foreground">7Srsw</span> déjoue le leurre en lisant l&apos;instruction brute
          pour retrouver le vrai destinataire.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Paramètres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="start-address">Adresse de départ</Label>
            <Input
              id="start-address"
              className="font-mono text-sm"
              placeholder="Coller une adresse Solana…"
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              disabled={isTracing}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="min-sol">Montant min (SOL)</Label>
              <Input
                id="min-sol"
                type="number"
                inputMode="decimal"
                step="0.0001"
                min="0"
                placeholder="ex. 1.0"
                value={minSol}
                onChange={(e) => setMinSol(e.target.value)}
                disabled={isTracing}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="max-sol">Montant max (SOL)</Label>
              <Input
                id="max-sol"
                type="number"
                inputMode="decimal"
                step="0.0001"
                min="0"
                placeholder="ex. 1.5"
                value={maxSol}
                onChange={(e) => setMaxSol(e.target.value)}
                disabled={isTracing}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tracer-type">Type de tracer</Label>
              <select
                id="tracer-type"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={tracerType}
                onChange={(e) => setTracerType(e.target.value as TracerType)}
                disabled={isTracing}
              >
                {TRACER_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => handleStart(false)} disabled={isTracing || !inputsValid}>
              {isTracing ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Traçage…
                </>
              ) : (
                <>
                  <Route className="mr-2 size-4" />
                  Lancer le traçage
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleStart(true)}
              disabled={isTracing || !inputsValid}
              title="Ignore le cache et relance Helius"
            >
              <RefreshCw className="mr-2 size-4" />
              Rafraîchir
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDeleteCache()}
              disabled={isTracing || isDeletingCache || !inputsValid}
              title="Supprime l'entrée cache pour cette adresse + cette fenêtre"
            >
              {isDeletingCache ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Vider le cache
            </Button>
            {isTracing && (
              <Button type="button" variant="outline" onClick={handleAbort}>
                Annuler
              </Button>
            )}
            {(hops.length > 0 || error || stoppedBy) && !isTracing && (
              <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                <X className="mr-1 size-4" />
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {infoMessage && !error && <p className="text-sm text-muted-foreground">{infoMessage}</p>}

      {fromCache && stoppedBy && (
        <p className="text-xs text-muted-foreground">Résultat restitué depuis le cache.</p>
      )}

      {startCreatorCount > 0 && hops.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-green-500/40 bg-green-500/5 px-3 py-2 text-xs">
          <Star className="size-3.5 fill-green-500 text-green-500" />
          <span>
            Adresse de départ{' '}
            <a
              href={solscanAccountHref(startAddress.trim())}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono underline-offset-2 hover:underline"
              title={startAddress.trim()}
            >
              {truncateAddress(startAddress.trim())}
            </a>{' '}
            : créateur on-chain de{' '}
            <span className="font-semibold text-green-700 dark:text-green-400">{startCreatorCount}</span>{' '}
            token(s).
          </span>
        </div>
      )}

      {hops.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Chemin parcouru — {hops.length} saut(s)
              {stoppedBy && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  · {stoppedByLabel(stoppedBy)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {hops.map((hop) => (
                <li
                  key={`${hop.index}-${hop.signature}`}
                  className="flex flex-col gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {hop.index}
                    </span>
                    <a
                      href={solscanAccountHref(hop.from)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-mono text-xs underline-offset-2 hover:underline"
                      title={hop.from}
                    >
                      {truncateAddress(hop.from)}
                    </a>
                    <CreatorStar count={creatorCountFor(hop.from)} />
                    <span className="text-muted-foreground">→</span>
                    <a
                      href={solscanAccountHref(hop.to)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-mono text-xs underline-offset-2 hover:underline"
                      title={hop.to}
                    >
                      {truncateAddress(hop.to)}
                    </a>
                    <CreatorStar count={creatorCountFor(hop.to)} />
                    {hop.deobfuscated && (
                      <span
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                        title={`Destinataire apparent : ${hop.apparentTo}`}
                      >
                        <ShieldAlert className="size-3" />
                        {deobfuscatedLabel(hop.deobfuscatedVariant ?? hop.tracerType)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-mono text-foreground">{formatSol(hop.solAmount)} SOL</span>
                    <a
                      href={solscanTxHref(hop.signature)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-mono underline-offset-2 hover:underline"
                      title={hop.signature}
                    >
                      {truncateSignature(hop.signature)}
                    </a>
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-background"
                      onClick={() => void copyToClipboard(hop.to)}
                      title="Copier le destinataire"
                    >
                      {copied === hop.to ? (
                        <Check className="size-3.5 text-green-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {stoppedBy && !isTracing && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4" />
              Adresse finale
            </CardTitle>
            <p className="text-xs text-muted-foreground">{stoppedByLabel(stoppedBy)}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <a
                className="break-all font-mono text-sm underline-offset-2 hover:underline"
                href={solscanAccountHref(finalAddress)}
                target="_blank"
                rel="noreferrer noopener"
                title={finalAddress}
              >
                {finalAddress}
              </a>
              <CreatorStar count={finalCreatorCount} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyToClipboard(finalAddress)}
                title="Copier l'adresse finale"
              >
                {copied === finalAddress ? (
                  <Check className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
            {hops.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Dernier transfert reçu :{' '}
                <span className="font-mono text-foreground">
                  {formatSol(hops[hops.length - 1]!.solAmount)} SOL
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Aucun mouvement détecté depuis l&apos;adresse de départ.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {(isTracing || logs.length > 0) && (
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
          {showLogs && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
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
    </div>
  );
}
