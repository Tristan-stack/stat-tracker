'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AnalysisMode, WalletAnalysis } from '@/types/analysis';
import { IconLoader2, IconTerminal2, IconChevronDown, IconChevronUp } from '@tabler/icons-react';

interface SSEProgressEvent {
  percent: number;
  phase: string;
  detail?: string;
}

interface LogEntry {
  time: Date;
  message: string;
}

interface AnalysisProgressProps {
  ruggerId: string;
  mode: AnalysisMode;
  fundingDepth: number;
  /** Nombre de wallets (top coverage) pour recovery GMGN ; 0 = désactivé. */
  walletCentricRecoveryLimit?: number;
  /** Si défini : ne pas relancer l’analyse, poller le statut jusqu’à completed/failed. */
  resumeAnalysisId?: string | null;
  onStarted?: (analysisId: string) => void;
  onComplete: (analysisId: string) => void;
  onError: (message: string) => void;
}

type ConnectionState = 'connecting' | 'streaming' | 'complete' | 'error';
const CONNECT_TIMEOUT_MS = 60_000;

function formatEta(ms: number): string {
  if (ms < 1000) return '<1s';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `~${s}s`;
  return `~${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatLogTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AnalysisProgress({
  ruggerId,
  mode,
  fundingDepth,
  walletCentricRecoveryLimit = 15,
  resumeAnalysisId = null,
  onStarted,
  onComplete,
  onError,
}: AnalysisProgressProps) {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState('Initialisation…');
  const [detail, setDetail] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [eta, setEta] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);
  const analysisIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onStartedRef = useRef(onStarted);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onStartedRef.current = onStarted;
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const appendLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, { time: new Date(), message }]);
  }, []);

  const updateEta = useCallback((currentPercent: number) => {
    const startedAt = startedAtRef.current;
    if (!startedAt || currentPercent <= 5) {
      setEta(null);
      return;
    }
    const elapsed = Date.now() - startedAt;
    const remaining = (elapsed / currentPercent) * (100 - currentPercent);
    setEta(formatEta(remaining));
  }, []);

  useEffect(() => {
    if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showLogs]);

  const startAnalysis = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    connectTimeoutRef.current = setTimeout(() => {
      controller.abort('connect-timeout');
    }, CONNECT_TIMEOUT_MS);

    const handleEvent = (event: string, data: Record<string, unknown>) => {
      switch (event) {
        case 'ping':
          break;
        case 'started':
          analysisIdRef.current = (data.analysisId as string) ?? null;
          if (analysisIdRef.current) onStartedRef.current?.(analysisIdRef.current);
          startedAtRef.current = Date.now();
          setPhase('Analyse démarrée');
          setPercent(0);
          appendLog(`Analyse démarrée (mode: ${mode}, tokens: ${data.tokenCount ?? '?'})`);
          break;
        case 'progress': {
          const p = data as unknown as SSEProgressEvent;
          const pct = p.percent ?? 0;
          setPercent(pct);
          setPhase(p.phase ?? '');
          setDetail((p.detail as string) ?? null);
          updateEta(pct);
          const detailStr = p.detail ? ` — ${p.detail}` : '';
          appendLog(`[${Math.round(pct)}%] ${p.phase ?? ''}${detailStr}`);
          break;
        }
        case 'buyers_found': {
          const msg = `${data.buyersFound ?? 0} wallets acheteurs découverts`;
          setPhase(msg);
          appendLog(msg + (data.tokenAddress ? ` (${String(data.tokenAddress).slice(0, 8)}…)` : ''));
          break;
        }
        case 'tokens_discovered': {
          const msg =
            `${data.candidateCount ?? 0} tokens découverts via Helius` +
            ` (${data.registeredCount ?? 0} enregistrés)`;
          setPhase(msg);
          appendLog(msg);
          break;
        }
        case 'tokens_validated': {
          const msg =
            `${data.validatedCount ?? 0} tokens validés` +
            ` (${data.discardedCount ?? 0} rejetés, ${data.multiTokenWalletCount ?? 0} wallets multi-token)`;
          setPhase(msg);
          appendLog(msg);
          break;
        }
        case 'siblings_found': {
          const msg = `${data.siblingsFound ?? 0} wallets siblings découverts`;
          setPhase(msg);
          appendLog(msg);
          break;
        }
        case 'merging':
          setPhase('Fusion des résultats…');
          appendLog('Fusion des résultats…');
          break;
        case 'complete': {
          setPercent(100);
          setPhase('Analyse terminée');
          setConnectionState('complete');
          setEta(null);
          const elapsed = startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;
          appendLog(`Analyse terminée — ${data.buyerCount ?? '?'} wallets, ${data.motherCount ?? '?'} mères (${elapsed}s)`);
          const id = (data.analysisId as string) ?? analysisIdRef.current;
          if (id) onCompleteRef.current(id);
          break;
        }
        case 'error': {
          const errMsg = (data.message as string) ?? 'Erreur inconnue';
          setErrorMessage(errMsg);
          setConnectionState('error');
          setEta(null);
          appendLog(`ERREUR: ${errMsg}`);
          onErrorRef.current(errMsg);
          break;
        }
      }
    };

    try {
      appendLog('Connexion au serveur…');
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, fundingDepth, walletCentricRecoveryLimit }),
        signal: controller.signal,
      });
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur serveur' }));
        const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
        setErrorMessage(msg);
        setConnectionState('error');
        appendLog(`ERREUR: ${msg}`);
        onErrorRef.current(msg);
        return;
      }

      setConnectionState('streaming');
      appendLog('Stream connecté');
      const reader = res.body?.getReader();
      if (!reader) {
        setErrorMessage('Pas de stream disponible');
        setConnectionState('error');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;
              handleEvent(currentEvent, parsed);
            } catch { /* skip malformed */ }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        if (controller.signal.reason !== 'connect-timeout') return;
        const timeoutMsg =
          'Connexion au serveur expirée. Vérifie le réseau, reconnecte-toi si besoin, puis réessaie.';
        setErrorMessage(timeoutMsg);
        setConnectionState('error');
        appendLog(`ERREUR: ${timeoutMsg}`);
        onErrorRef.current(timeoutMsg);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Connexion perdue';
      setErrorMessage(msg);
      setConnectionState('error');
      appendLog(`ERREUR: ${msg}`);
      onErrorRef.current(msg);
    } finally {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    }
  }, [ruggerId, mode, fundingDepth, walletCentricRecoveryLimit, appendLog, updateEta]);

  useEffect(() => {
    if (!resumeAnalysisId) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    hasStartedRef.current = true;
    analysisIdRef.current = resumeAnalysisId;
    startedAtRef.current = Date.now();
    onStartedRef.current?.(resumeAnalysisId);
    setConnectionState('streaming');
    appendLog('Reprise du suivi de l’analyse en cours (rafraîchissement périodique)…');

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/ruggers/${ruggerId}/analysis`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { analyses: WalletAnalysis[] };
        const row = data.analyses.find((x) => x.id === resumeAnalysisId);
        if (!row || cancelled) return;

        setPercent(row.progress);
        setPhase(row.progressLabel ?? row.status);
        setDetail(
          row.status === 'running' || row.status === 'pending'
            ? 'Statut serveur — les logs détaillés (SSE) ne sont pas rejoués après reconnexion.'
            : null
        );
        updateEta(row.progress);

        if (row.status === 'completed') {
          cancelled = true;
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          setPercent(100);
          setPhase('Analyse terminée');
          setDetail(null);
          setConnectionState('complete');
          setEta(null);
          appendLog(
            `Analyse terminée — ${row.buyerCount} wallets · ${row.tokenCount} tokens (aperçu depuis l’historique)`
          );
          onCompleteRef.current(resumeAnalysisId);
          return;
        }

        if (row.status === 'failed') {
          cancelled = true;
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          const err = row.errorMessage ?? 'Analyse en échec';
          setErrorMessage(err);
          setConnectionState('error');
          setEta(null);
          appendLog(`ERREUR: ${err}`);
          onErrorRef.current(err);
        }
      } catch {
        if (!cancelled) appendLog('Erreur réseau lors du rafraîchissement du statut…');
      }
    };

    void poll();
    pollTimer = setInterval(() => void poll(), 2500);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      hasStartedRef.current = false;
      analysisIdRef.current = null;
      startedAtRef.current = null;
    };
  }, [resumeAnalysisId, ruggerId, appendLog, updateEta]);

  useEffect(() => {
    if (resumeAnalysisId) return;

    void startAnalysis();
    return () => {
      abortRef.current?.abort();
      hasStartedRef.current = false;
      analysisIdRef.current = null;
      startedAtRef.current = null;
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- startAnalysis regroupe déjà les deps du flux SSE
  }, [resumeAnalysisId, ruggerId, mode, fundingDepth, walletCentricRecoveryLimit]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {connectionState === 'streaming' && <IconLoader2 className="size-5 animate-spin text-primary" />}
        <div className="flex-1">
          <p className="text-sm font-medium">{phase}</p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>
        <span className="text-sm font-mono tabular-nums text-muted-foreground">{Math.round(percent)}%</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            connectionState === 'error' ? 'bg-destructive' : connectionState === 'complete' ? 'bg-green-500' : 'bg-primary'
          )}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>

      {connectionState === 'streaming' && eta && (
        <p className="text-xs text-muted-foreground tabular-nums">
          Temps restant estimé : {eta}
        </p>
      )}

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowLogs((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconTerminal2 className="size-3.5" />
          <span>Logs</span>
          {showLogs ? <IconChevronUp className="size-3" /> : <IconChevronDown className="size-3" />}
          {logs.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{logs.length}</span>
          )}
        </button>

        {showLogs && (
          <div className="max-h-48 w-full overflow-y-auto rounded-lg border bg-muted/30 p-2">
            {logs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Aucun log.</p>
            ) : (
              <div className="space-y-0.5">
                {logs.map((entry, i) => (
                  <p key={i} className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                    <span className="text-muted-foreground/60">{formatLogTime(entry.time)}</span>{' '}
                    {entry.message}
                  </p>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      {connectionState === 'error' && errorMessage && (
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{errorMessage}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              hasStartedRef.current = false;
              analysisIdRef.current = null;
              startedAtRef.current = null;
              setErrorMessage(null);
              setConnectionState('connecting');
              setPercent(0);
              setPhase('Reconnexion…');
              setLogs([]);
              setEta(null);
              void startAnalysis();
            }}
          >
            Réessayer
          </Button>
        </div>
      )}

      {connectionState === 'connecting' && (
        <p className="text-xs text-muted-foreground">Connexion au serveur…</p>
      )}
    </div>
  );
}
