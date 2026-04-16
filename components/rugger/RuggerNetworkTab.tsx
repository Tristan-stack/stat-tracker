'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AnalysisMode, WalletAnalysis } from '@/types/analysis';
import AnalysisLauncher from '@/components/analysis/AnalysisLauncher';
import AnalysisProgress from '@/components/analysis/AnalysisProgress';
import LeaderboardTable from '@/components/analysis/LeaderboardTable';
import BestWalletLeaderboard from '@/components/analysis/BestWalletLeaderboard';
import MotherAddressCard from '@/components/analysis/MotherAddressCard';
import CombinationOptimizer from '@/components/analysis/CombinationOptimizer';
import WalletDetail from '@/components/analysis/WalletDetail';
import { IconHistory, IconChevronRight, IconPlus, IconTrash } from '@tabler/icons-react';

type TabView = 'idle' | 'running' | 'results';
type ResultSection = 'leaderboard' | 'mothers' | 'combinations';

interface RuggerNetworkTabProps {
  ruggerId: string;
  tokenCount: number;
}

const MODE_LABELS: Record<AnalysisMode, string> = {
  token: 'Tokens',
  funding: 'Funding',
  combined: 'Combiné',
};

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function RuggerNetworkTab({ ruggerId, tokenCount }: RuggerNetworkTabProps) {
  const [view, setView] = useState<TabView>('idle');
  const [analyses, setAnalyses] = useState<WalletAnalysis[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [runningMode, setRunningMode] = useState<AnalysisMode>('combined');
  const [runningDepth, setRunningDepth] = useState(5);
  const [runningWalletCentricRecovery, setRunningWalletCentricRecovery] = useState(15);
  const [runningExcludeInactiveOver24h, setRunningExcludeInactiveOver24h] = useState(false);
  const [runningResumeAnalysisId, setRunningResumeAnalysisId] = useState<string | null>(null);
  const [launchNonce, setLaunchNonce] = useState(0);

  const [resultSection, setResultSection] = useState<ResultSection>('leaderboard');
  const [walletDetailAddress, setWalletDetailAddress] = useState<string | null>(null);
  const [deletingAnalysisId, setDeletingAnalysisId] = useState<string | null>(null);
  const [cancellingAnalysisId, setCancellingAnalysisId] = useState<string | null>(null);

  const activeAnalysisIdRef = useRef<string | null>(null);
  const userCancelledRef = useRef(false);

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis`);
      if (!res.ok) return;
      const data = (await res.json()) as { analyses: WalletAnalysis[] };
      setAnalyses(data.analyses);
    } finally { setIsLoadingHistory(false); }
  }, [ruggerId]);

  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  // NOTE:
  // We intentionally avoid auto-resuming "running/pending" analyses from history.
  // In unstable network conditions this can reopen a stale running state and
  // trigger confusing retries. Starting an analysis should only happen on user action.

  const handleLaunch = useCallback(
    ({
      mode,
      fundingDepth,
      walletCentricRecoveryLimit,
      excludeInactiveOver24h,
    }: {
      mode: AnalysisMode;
      fundingDepth: number;
      walletCentricRecoveryLimit: number;
      excludeInactiveOver24h: boolean;
    }) => {
      userCancelledRef.current = false;
      setRunningMode(mode);
      setRunningDepth(fundingDepth);
      setRunningWalletCentricRecovery(walletCentricRecoveryLimit);
      setRunningExcludeInactiveOver24h(excludeInactiveOver24h);
      setRunningResumeAnalysisId(null);
      setLaunchNonce((n) => n + 1);
      setView('running');
      setActiveAnalysisId(null);
      activeAnalysisIdRef.current = null;
    },
    []
  );

  const handleAnalysisComplete = useCallback((analysisId: string) => {
    setActiveAnalysisId(analysisId);
    activeAnalysisIdRef.current = analysisId;
    setView('results');
    setResultSection('leaderboard');
    setWalletDetailAddress(null);
    void fetchHistory();
  }, [fetchHistory]);

  const handleAnalysisError = useCallback((_message: string) => {
    void fetchHistory();
  }, [fetchHistory]);

  const handleAnalysisStarted = useCallback((analysisId: string) => {
    setActiveAnalysisId(analysisId);
    activeAnalysisIdRef.current = analysisId;
  }, []);

  const handleViewResults = useCallback((analysisId: string) => {
    setActiveAnalysisId(analysisId);
    activeAnalysisIdRef.current = analysisId;
    setView('results');
    setResultSection('leaderboard');
    setWalletDetailAddress(null);
  }, []);

  const handleResumeRunningAnalysis = useCallback((a: WalletAnalysis) => {
    if (a.status !== 'running' && a.status !== 'pending') return;
    userCancelledRef.current = false;
    setRunningMode(a.mode);
    setRunningDepth(a.fundingDepth);
    setRunningWalletCentricRecovery(15);
    setRunningExcludeInactiveOver24h(false);
    setRunningResumeAnalysisId(a.id);
    setLaunchNonce((n) => n + 1);
    setView('running');
    setActiveAnalysisId(a.id);
    activeAnalysisIdRef.current = a.id;
  }, []);

  const handleBackToIdle = useCallback(() => {
    setView('idle');
    setActiveAnalysisId(null);
    activeAnalysisIdRef.current = null;
    setWalletDetailAddress(null);
    void fetchHistory();
  }, [fetchHistory]);

  const handleCancelRunningAnalysis = useCallback(async () => {
    userCancelledRef.current = true;

    const shouldCancel = window.confirm(
      'Annuler cette analyse en cours ? Les résultats partiels seront supprimés.'
    );
    if (!shouldCancel) {
      userCancelledRef.current = false;
      return;
    }

    const runningId = activeAnalysisIdRef.current;

    setCancellingAnalysisId(runningId);
    try {
      if (runningId) {
        const res = await fetch(`/api/ruggers/${ruggerId}/analysis/${runningId}`, {
          method: 'DELETE',
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          window.alert(body.error ?? "Impossible d'annuler l'analyse.");
        }
      }
      setView('idle');
      setActiveAnalysisId(null);
      activeAnalysisIdRef.current = null;
      setWalletDetailAddress(null);
      await fetchHistory();
    } finally {
      setCancellingAnalysisId(null);
    }
  }, [ruggerId, fetchHistory]);

  const handleDeleteAnalysis = useCallback(
    async (analysisId: string) => {
      if (
        !window.confirm(
          'Supprimer cette analyse ? Les résultats (wallets, achats, adresses mères) seront effacés définitivement.'
        )
      ) {
        return;
      }
      setDeletingAnalysisId(analysisId);
      try {
        const res = await fetch(`/api/ruggers/${ruggerId}/analysis/${analysisId}`, {
          method: 'DELETE',
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          window.alert(body.error ?? 'Impossible de supprimer l’analyse.');
          return;
        }
        if (activeAnalysisId === analysisId) {
          setView('idle');
          setActiveAnalysisId(null);
          setWalletDetailAddress(null);
        }
        await fetchHistory();
      } finally {
        setDeletingAnalysisId(null);
      }
    },
    [ruggerId, activeAnalysisId, fetchHistory]
  );

  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const handleDeleteAllAnalyses = useCallback(async () => {
    if (analyses.length === 0) return;
    if (
      !window.confirm(
        `Supprimer les ${analyses.length} analyses ? Toutes les données seront effacées définitivement.`
      )
    ) {
      return;
    }
    setIsDeletingAll(true);
    try {
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis`, { method: 'DELETE' });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(body.error ?? 'Impossible de supprimer les analyses.');
        return;
      }
      userCancelledRef.current = true;
      setView('idle');
      setActiveAnalysisId(null);
      activeAnalysisIdRef.current = null;
      setWalletDetailAddress(null);
      await fetchHistory();
    } finally {
      setIsDeletingAll(false);
    }
  }, [analyses.length, ruggerId, fetchHistory]);

  const handleWalletClick = useCallback((walletAddress: string) => {
    setWalletDetailAddress(walletAddress);
  }, []);

  if (view === 'running') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Analyse en cours</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleCancelRunningAnalysis()}
            disabled={cancellingAnalysisId !== null}
          >
            {cancellingAnalysisId !== null ? 'Annulation…' : 'Annuler'}
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <AnalysisProgress
              key={`${ruggerId}-${runningMode}-${runningDepth}-${runningWalletCentricRecovery}-${runningExcludeInactiveOver24h ? '1' : '0'}-${runningResumeAnalysisId ?? 'new'}-${launchNonce}`}
              ruggerId={ruggerId}
              mode={runningMode}
              fundingDepth={runningDepth}
              walletCentricRecoveryLimit={runningWalletCentricRecovery}
              excludeInactiveOver24h={runningExcludeInactiveOver24h}
              resumeAnalysisId={runningResumeAnalysisId}
              onStarted={handleAnalysisStarted}
              onComplete={handleAnalysisComplete}
              onError={handleAnalysisError}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === 'results' && activeAnalysisId) {
    const activeAnalysis = analyses.find((a) => a.id === activeAnalysisId);

    if (walletDetailAddress) {
      return (
        <div className="space-y-4">
          <WalletDetail
            ruggerId={ruggerId}
            analysisId={activeAnalysisId}
            walletAddress={walletDetailAddress}
            onBack={() => setWalletDetailAddress(null)}
          />
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={handleBackToIdle} className="gap-1">
              <IconHistory className="size-4" />Historique
            </Button>
            {activeAnalysis && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium uppercase', STATUS_STYLES[activeAnalysis.status])}>
                  {activeAnalysis.mode}
                </span>
                <span>{activeAnalysis.buyerCount} wallets</span>
                <span>·</span>
                <span>{new Date(activeAnalysis.createdAt).toLocaleDateString('fr-FR')}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive hover:text-destructive"
              disabled={deletingAnalysisId === activeAnalysisId}
              onClick={() => void handleDeleteAnalysis(activeAnalysisId)}
            >
              <IconTrash className="size-4" />
              Supprimer
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleBackToIdle} className="gap-1">
              <IconPlus className="size-4" />Nouvelle analyse
            </Button>
          </div>
        </div>

        <nav className="flex gap-1 border-b border-border">
          {([
            { key: 'leaderboard' as const, label: 'Leaderboard' },
            { key: 'mothers' as const, label: 'Adresses mères' },
            { key: 'combinations' as const, label: 'Combinaisons' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setResultSection(key)}
              className={cn(
                'relative px-3 py-2 text-sm font-medium transition-colors',
                resultSection === key
                  ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        {resultSection === 'leaderboard' && (
          <div className="space-y-3">
            <BestWalletLeaderboard
              ruggerId={ruggerId}
              analysisId={activeAnalysisId}
              onWalletClick={handleWalletClick}
            />
            <LeaderboardTable
              ruggerId={ruggerId}
              analysisId={activeAnalysisId}
              onWalletClick={handleWalletClick}
            />
          </div>
        )}
        {resultSection === 'mothers' && (
          <MotherAddressCard ruggerId={ruggerId} analysisId={activeAnalysisId} />
        )}
        {resultSection === 'combinations' && (
          <CombinationOptimizer ruggerId={ruggerId} analysisId={activeAnalysisId} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <AnalysisLauncher tokenCount={tokenCount} onLaunch={handleLaunch} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconHistory className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Analyses précédentes</h3>
          </div>
          {analyses.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={isDeletingAll}
              onClick={() => void handleDeleteAllAnalyses()}
            >
              <IconTrash className="size-3.5" />
              {isDeletingAll ? 'Suppression…' : 'Tout supprimer'}
            </Button>
          )}
        </div>

        {isLoadingHistory ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : analyses.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune analyse précédente pour ce rugger.</p>
        ) : (
          <div className="space-y-2">
            {analyses.map((a) => {
              const canOpenResults = a.status === 'completed';
              const canResumeProgress = a.status === 'running' || a.status === 'pending';
              const rowClickable = canOpenResults || canResumeProgress;
              return (
              <div
                key={a.id}
                className={cn(
                  'flex w-full items-center gap-0 rounded-lg border transition-colors',
                  rowClickable ? 'hover:bg-muted/50' : 'opacity-90'
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (canOpenResults) handleViewResults(a.id);
                    else if (canResumeProgress) handleResumeRunningAnalysis(a);
                  }}
                  disabled={!rowClickable}
                  className={cn(
                    'flex min-w-0 flex-1 items-center justify-between gap-3 p-3 text-left',
                    rowClickable ? 'cursor-pointer' : 'cursor-default'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                        STATUS_STYLES[a.status]
                      )}
                    >
                      {a.status}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{MODE_LABELS[a.mode]}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.buyerCount} wallets · {a.tokenCount} tokens ·{' '}
                        {new Date(a.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        {canResumeProgress && (
                          <span className="text-primary"> · cliquer pour suivre la progression</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {rowClickable && (
                    <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  {a.status === 'failed' && a.errorMessage && (
                    <span className="shrink-0 text-xs text-destructive max-w-[200px] truncate">{a.errorMessage}</span>
                  )}
                </button>
                <div className="flex shrink-0 items-center justify-center self-stretch border-l border-border px-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={deletingAnalysisId === a.id}
                    aria-label="Supprimer cette analyse"
                    onClick={() => void handleDeleteAnalysis(a.id)}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
