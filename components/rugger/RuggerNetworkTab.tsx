'use client';

import { useCallback, useRef, useState } from 'react';
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
import { ChevronRight, History, Plus, Trash2 } from 'lucide-react';
import { useAnalyses, useDeleteAnalysis, useDeleteAllAnalyses } from '@/features/analysis/hooks/use-analyses';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : '';
}

type TabView = 'idle' | 'running' | 'results';
type ResultSection = 'leaderboard' | 'mothers' | 'combinations';

interface RuggerNetworkTabProps {
  ruggerId: string;
  tokenCount: number;
}

const MODE_LABELS: Record<AnalysisMode, string> = {
  token: 'Tokens',
  token_hunting: 'Token Hunting',
  funding: 'Funding',
  combined: 'Combiné',
};

// Achromatique : statut lu au label + intensité du fill (completed = ink plein,
// failed = destructive carbon), jamais à la teinte.
const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-foreground text-background',
  running: 'bg-muted text-foreground',
  pending: 'border border-border text-muted-foreground',
  failed: 'bg-destructive text-background',
};

export default function RuggerNetworkTab({ ruggerId, tokenCount }: RuggerNetworkTabProps) {
  const [view, setView] = useState<TabView>('idle');
  const { data: analyses = [], isLoading: isLoadingHistory, refetch } = useAnalyses(ruggerId);
  const deleteAnalysis = useDeleteAnalysis(ruggerId);
  const deleteAllAnalyses = useDeleteAllAnalyses(ruggerId);
  const refreshHistory = useCallback(() => {
    void refetch();
  }, [refetch]);

  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [runningMode, setRunningMode] = useState<AnalysisMode>('combined');
  const [runningDepth, setRunningDepth] = useState(5);
  const [runningWalletCentricRecovery, setRunningWalletCentricRecovery] = useState(15);
  const [runningExcludeInactiveOver24h, setRunningExcludeInactiveOver24h] = useState(false);
  const [runningMcapMin, setRunningMcapMin] = useState<number | undefined>(undefined);
  const [runningMcapMax, setRunningMcapMax] = useState<number | undefined>(undefined);
  const [runningResumeAnalysisId, setRunningResumeAnalysisId] = useState<string | null>(null);
  const [launchNonce, setLaunchNonce] = useState(0);

  const [resultSection, setResultSection] = useState<ResultSection>('leaderboard');
  const [walletDetailAddress, setWalletDetailAddress] = useState<string | null>(null);
  const [deletingAnalysisId, setDeletingAnalysisId] = useState<string | null>(null);
  const [cancellingAnalysisId, setCancellingAnalysisId] = useState<string | null>(null);

  const activeAnalysisIdRef = useRef<string | null>(null);
  const userCancelledRef = useRef(false);

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
      mcapMin,
      mcapMax,
    }: {
      mode: AnalysisMode;
      fundingDepth: number;
      walletCentricRecoveryLimit: number;
      excludeInactiveOver24h: boolean;
      mcapMin?: number;
      mcapMax?: number;
    }) => {
      userCancelledRef.current = false;
      setRunningMode(mode);
      setRunningDepth(fundingDepth);
      setRunningWalletCentricRecovery(walletCentricRecoveryLimit);
      setRunningExcludeInactiveOver24h(excludeInactiveOver24h);
      setRunningMcapMin(mcapMin);
      setRunningMcapMax(mcapMax);
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
    refreshHistory();
  }, [refreshHistory]);

  const handleAnalysisError = useCallback(() => {
    refreshHistory();
  }, [refreshHistory]);

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
    setRunningMcapMin(undefined);
    setRunningMcapMax(undefined);
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
    refreshHistory();
  }, [refreshHistory]);

  const handleCancelRunningAnalysis = useCallback(async () => {
    userCancelledRef.current = true;

    if (!window.confirm('Annuler cette analyse en cours ? Les résultats partiels seront supprimés.')) {
      userCancelledRef.current = false;
      return;
    }

    const runningId = activeAnalysisIdRef.current;
    setCancellingAnalysisId(runningId);
    try {
      if (runningId) {
        try {
          await deleteAnalysis.mutateAsync(runningId);
        } catch (e) {
          window.alert(errorMessage(e) || "Impossible d'annuler l'analyse.");
        }
      }
      setView('idle');
      setActiveAnalysisId(null);
      activeAnalysisIdRef.current = null;
      setWalletDetailAddress(null);
    } finally {
      setCancellingAnalysisId(null);
    }
  }, [deleteAnalysis]);

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
        await deleteAnalysis.mutateAsync(analysisId);
        if (activeAnalysisId === analysisId) {
          setView('idle');
          setActiveAnalysisId(null);
          setWalletDetailAddress(null);
        }
      } catch (e) {
        window.alert(errorMessage(e) || 'Impossible de supprimer l’analyse.');
      } finally {
        setDeletingAnalysisId(null);
      }
    },
    [deleteAnalysis, activeAnalysisId]
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
      await deleteAllAnalyses.mutateAsync();
      userCancelledRef.current = true;
      setView('idle');
      setActiveAnalysisId(null);
      activeAnalysisIdRef.current = null;
      setWalletDetailAddress(null);
    } catch (e) {
      window.alert(errorMessage(e) || 'Impossible de supprimer les analyses.');
    } finally {
      setIsDeletingAll(false);
    }
  }, [analyses.length, deleteAllAnalyses]);

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
              mcapMin={runningMcapMin}
              mcapMax={runningMcapMax}
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
              <History className="size-4" />Historique
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
              <Trash2 className="size-4" />
              Supprimer
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleBackToIdle} className="gap-1">
              <Plus className="size-4" />Nouvelle analyse
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
            <History className="size-4 text-muted-foreground" />
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
              <Trash2 className="size-3.5" />
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
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
                    <Trash2 className="size-4" />
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
