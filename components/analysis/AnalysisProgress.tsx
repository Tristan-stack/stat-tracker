'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AnalysisMode } from '@/types/analysis';
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
  onComplete: (analysisId: string) => void;
  onError: (message: string) => void;
}

type ConnectionState = 'connecting' | 'streaming' | 'complete' | 'error';

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

export default function AnalysisProgress({ ruggerId, mode, fundingDepth, onComplete, onError }: AnalysisProgressProps) {
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

    const handleEvent = (event: string, data: Record<string, unknown>) => {
      switch (event) {
        case 'started':
          analysisIdRef.current = (data.analysisId as string) ?? null;
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
          if (id) onComplete(id);
          break;
        }
        case 'error': {
          const errMsg = (data.message as string) ?? 'Erreur inconnue';
          setErrorMessage(errMsg);
          setConnectionState('error');
          setEta(null);
          appendLog(`ERREUR: ${errMsg}`);
          onError(errMsg);
          break;
        }
      }
    };

    try {
      appendLog('Connexion au serveur…');
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, fundingDepth }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur serveur' }));
        const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
        setErrorMessage(msg);
        setConnectionState('error');
        appendLog(`ERREUR: ${msg}`);
        onError(msg);
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
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
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Connexion perdue';
      setErrorMessage(msg);
      setConnectionState('error');
      appendLog(`ERREUR: ${msg}`);
      onError(msg);
    }
  }, [ruggerId, mode, fundingDepth, onComplete, onError, appendLog, updateEta]);

  useEffect(() => {
    hasStartedRef.current = false;
    analysisIdRef.current = null;
    startedAtRef.current = null;
    void startAnalysis();
    return () => { abortRef.current?.abort(); };
  }, [startAnalysis]);

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
