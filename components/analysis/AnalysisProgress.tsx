'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AnalysisMode } from '@/types/analysis';
import { IconLoader2 } from '@tabler/icons-react';

interface SSEProgressEvent {
  percent: number;
  phase: string;
  detail?: string;
}

interface AnalysisProgressProps {
  ruggerId: string;
  mode: AnalysisMode;
  fundingDepth: number;
  onComplete: (analysisId: string) => void;
  onError: (message: string) => void;
}

type ConnectionState = 'connecting' | 'streaming' | 'complete' | 'error';

export default function AnalysisProgress({ ruggerId, mode, fundingDepth, onComplete, onError }: AnalysisProgressProps) {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState('Initialisation…');
  const [detail, setDetail] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);

  const startAnalysis = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, fundingDepth }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Erreur serveur' }));
        const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
        setErrorMessage(msg);
        setConnectionState('error');
        onError(msg);
        return;
      }

      setConnectionState('streaming');
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
              const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
              handleSSEEvent(currentEvent, data);
            } catch { /* skip malformed */ }
            currentEvent = '';
          }
        }
      }

      if (connectionState !== 'complete' && connectionState !== 'error') {
        setConnectionState('complete');
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Connexion perdue';
      setErrorMessage(msg);
      setConnectionState('error');
      onError(msg);
    }
  }, [ruggerId, mode, fundingDepth, onComplete, onError]);

  const handleSSEEvent = (event: string, data: Record<string, unknown>) => {
    switch (event) {
      case 'started':
        setPhase('Analyse démarrée');
        setPercent(0);
        break;
      case 'progress': {
        const p = data as unknown as SSEProgressEvent;
        setPercent(p.percent ?? 0);
        setPhase(p.phase ?? '');
        setDetail((p.detail as string) ?? null);
        break;
      }
      case 'buyers_found':
        setPhase(`${data.count ?? 0} wallets acheteurs découverts`);
        break;
      case 'siblings_found':
        setPhase(`${data.count ?? 0} wallets siblings découverts`);
        break;
      case 'merging':
        setPhase('Fusion des résultats…');
        break;
      case 'complete':
        setPercent(100);
        setPhase('Analyse terminée');
        setConnectionState('complete');
        if (data.analysisId) onComplete(data.analysisId as string);
        break;
      case 'error':
        setErrorMessage((data.message as string) ?? 'Erreur inconnue');
        setConnectionState('error');
        onError((data.message as string) ?? 'Erreur inconnue');
        break;
    }
  };

  useEffect(() => {
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
