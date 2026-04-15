'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface BestWalletLeaderboardProps {
  ruggerId: string;
  analysisId: string;
}

interface BestWalletItem {
  walletAddress: string;
  coveragePercent: number;
  matchedTokenCount: number;
  tpHitCount: number;
  tpHitRate: number;
  entryQualityScore: number;
  entryQualityNormalized: number;
  compositeScore: number;
}

interface BestWalletResponse {
  topWallets: BestWalletItem[];
  meta: {
    tpMinPercent: number;
    selectedTokenCount: number;
    scopedWalletCount: number;
    walletsAnalyzed: number;
    walletsSucceeded: number;
    walletsFailed: number;
    walletsRemaining: number;
    candidateLimit: number;
    candidateLimitApplied: boolean;
    cacheHit: boolean;
    cacheHitResponse: boolean;
    cacheHitWalletPreviews: number;
    partialMode: boolean;
    retries: number;
    timingsMs: {
      total: number;
      topTokensQuery: number;
      candidateQuery: number;
      gmgnPhase: number;
      ranking: number;
    };
    benchmark: {
      walletCount: number;
      tokenCount: number;
    };
    partialFailures: Array<{ walletAddress: string; error: string }>;
    insufficientDataWallets: string[];
    rankingPolicy: string;
  };
}

interface ProgressState {
  totalWallets: number;
  walletsAnalyzed: number;
  walletsRemaining: number;
  walletsSucceeded: number;
  walletsFailed: number;
  currentWallet: string | null;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function shortenAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function BestWalletLeaderboard({ ruggerId, analysisId }: BestWalletLeaderboardProps) {
  const [tpMinPercent, setTpMinPercent] = useState('80');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BestWalletResponse | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [dynamicLogs, setDynamicLogs] = useState<string[]>([]);
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);

  const tpValue = Number(tpMinPercent);
  const isTpValid = Number.isFinite(tpValue) && tpValue >= 0;

  const handleFind = async () => {
    if (!isTpValid || isLoading) return;
    setIsLoading(true);
    setError(null);
    setData(null);
    setProgress(null);
    setDynamicLogs([]);
    try {
      const params = new URLSearchParams({
        tpMinPercent: String(tpValue),
        tokenLimit: '20',
        candidateLimit: '12',
        stream: '1',
      });
      const res = await fetch(
        `/api/ruggers/${ruggerId}/analysis/${analysisId}/best-wallet?${params.toString()}`
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Impossible de calculer le best wallet leaderboard.');
        return;
      }
      if (!res.body) {
        setError('Impossible de lire le flux de progression.');
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
            | {
                type: 'started';
                totalWallets: number;
                selectedTokenCount: number;
                message: string;
              }
            | {
                type: 'progress';
                message: string;
                totalWallets: number;
                walletsAnalyzed: number;
                walletsRemaining: number;
                walletsSucceeded: number;
                walletsFailed: number;
                currentWallet: string;
              }
            | { type: 'done'; payload: BestWalletResponse }
            | { type: 'error'; error: string };

          if (event.type === 'started') {
            setProgress({
              totalWallets: event.totalWallets,
              walletsAnalyzed: 0,
              walletsRemaining: event.totalWallets,
              walletsSucceeded: 0,
              walletsFailed: 0,
              currentWallet: null,
            });
            setDynamicLogs((prev) => [...prev.slice(-5), event.message]);
          } else if (event.type === 'progress') {
            setProgress({
              totalWallets: event.totalWallets,
              walletsAnalyzed: event.walletsAnalyzed,
              walletsRemaining: event.walletsRemaining,
              walletsSucceeded: event.walletsSucceeded,
              walletsFailed: event.walletsFailed,
              currentWallet: event.currentWallet,
            });
            setDynamicLogs((prev) => [...prev.slice(-5), event.message]);
          } else if (event.type === 'done') {
            setData(event.payload);
            setDynamicLogs((prev) => [...prev.slice(-5), 'Analyse terminée.']);
          } else if (event.type === 'error') {
            setError(event.error);
          }
        }
      }
    } catch {
      setError('Erreur réseau pendant le calcul.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasRows = (data?.topWallets.length ?? 0) > 0;
  const partialFailuresText = useMemo(() => {
    const failures = data?.meta.partialFailures ?? [];
    if (failures.length === 0) return null;
    return `${failures.length} wallet(s) ignoré(s) suite à une erreur GMGN.`;
  }, [data]);
  const partialFailureDetails = useMemo(() => {
    const failures = data?.meta.partialFailures ?? [];
    return failures.slice(0, 2).map((failure) => {
      const shortWallet =
        failure.walletAddress.length > 12
          ? `${failure.walletAddress.slice(0, 6)}...${failure.walletAddress.slice(-4)}`
          : failure.walletAddress;
      const normalizedError = failure.error
        .replace(/\s+/g, ' ')
        .replace(/^GMGN\s+/i, '')
        .slice(0, 80);
      return `${shortWallet}: ${normalizedError}`;
    });
  }, [data]);

  const handleCopyWallet = async (walletAddress: string) => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopiedWallet(walletAddress);
      window.setTimeout(() => {
        setCopiedWallet((prev) => (prev === walletAddress ? null : prev));
      }, 1400);
    } catch {
      setError('Impossible de copier l’adresse du wallet.');
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[140px] space-y-1">
          <p className="text-xs text-muted-foreground">TP minimum (%)</p>
          <Input
            value={tpMinPercent}
            onChange={(event) => setTpMinPercent(event.target.value)}
            placeholder="80"
            inputMode="decimal"
          />
        </div>
        <Button type="button" onClick={() => void handleFind()} disabled={!isTpValid || isLoading}>
          {isLoading ? 'Calcul...' : 'Find best wallet'}
        </Button>
      </div>

      {!isTpValid && (
        <p className="text-xs text-destructive">Le TP minimum doit être un nombre supérieur ou égal à 0.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {progress && (
        <div className="rounded-md border border-border bg-muted/20 p-2 text-xs">
          <p className="text-muted-foreground">
            Wallets à analyser: <span className="font-medium text-foreground">{progress.totalWallets}</span>
          </p>
          <p className="text-muted-foreground">
            Wallets analysés: <span className="font-medium text-foreground">{progress.walletsAnalyzed}</span>
          </p>
          <p className="text-muted-foreground">
            Wallets restants: <span className="font-medium text-foreground">{progress.walletsRemaining}</span>
          </p>
          <p className="text-muted-foreground">
            Succès/erreurs: <span className="font-medium text-foreground">{progress.walletsSucceeded}/{progress.walletsFailed}</span>
          </p>
          {progress.currentWallet && (
            <p className="truncate text-muted-foreground">
              En cours: <span className="font-medium text-foreground">{progress.currentWallet}</span>
            </p>
          )}
        </div>
      )}
      {dynamicLogs.length > 0 && (
        <div className="rounded-md border border-border p-2">
          <p className="mb-1 text-xs font-medium">Logs dynamiques</p>
          <div className="max-h-28 space-y-1 overflow-y-auto pr-1 text-xs text-muted-foreground">
            {dynamicLogs.map((log, index) => (
              <p key={`${log}-${index}`}>- {log}</p>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Classement: score final sur 100 (65% couverture, 25% hit TP, 10% qualité d’entrée).
          </p>
          <p className="text-xs text-muted-foreground">
            {data.meta.selectedTokenCount} token(s) top couverture analysés avec TP min {formatPercent(data.meta.tpMinPercent)}.
          </p>
          <p className="text-xs text-muted-foreground">
            Wallets: {data.meta.walletsAnalyzed}/{data.meta.scopedWalletCount} analysés, {data.meta.walletsRemaining} restant(s).
          </p>
          <p className="text-xs text-muted-foreground">
            Candidate-first: {data.meta.candidateLimit} wallet(s)
            {data.meta.candidateLimitApplied ? ' (limité)' : ' (non limité)'}.
          </p>
          <p className="text-xs text-muted-foreground">
            Cache: {data.meta.cacheHitResponse ? 'response hit' : data.meta.cacheHit ? 'wallet cache hit' : 'miss'} · wallet previews hit {data.meta.cacheHitWalletPreviews}.
          </p>
          <p className="text-xs text-muted-foreground">
            Durées ms — total {data.meta.timingsMs.total}, SQL tokens {data.meta.timingsMs.topTokensQuery}, SQL candidats {data.meta.timingsMs.candidateQuery}, GMGN {data.meta.timingsMs.gmgnPhase}, ranking {data.meta.timingsMs.ranking}.
          </p>
          <p className="text-xs text-muted-foreground">
            Baseline dataset: {data.meta.benchmark.walletCount} wallets / {data.meta.benchmark.tokenCount} tokens · retries {data.meta.retries}.
          </p>
          {partialFailuresText && <p className="text-xs text-amber-500">{partialFailuresText}</p>}
          {partialFailureDetails.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <p className="text-xs font-medium text-amber-600">Exemples d’erreurs GMGN</p>
              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                {partialFailureDetails.map((line, index) => (
                  <p key={`${line}-${index}`}>- {line}</p>
                ))}
              </div>
            </div>
          )}
          {(data.meta.insufficientDataWallets?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              Données insuffisantes: {data.meta.insufficientDataWallets.length} wallet(s).
            </p>
          )}
          {!hasRows ? (
            <p className="text-sm text-muted-foreground">Aucun wallet classable pour ce seuil.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Rang</th>
                    <th className="px-3 py-2 text-left">Wallet</th>
                    <th className="px-3 py-2 text-right">Coverage</th>
                    <th className="px-3 py-2 text-right">TP hit</th>
                    <th className="px-3 py-2 text-right">Entry quality</th>
                    <th className="px-3 py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topWallets.map((wallet, index) => (
                    <tr key={wallet.walletAddress} className="border-t border-border">
                      <td className="px-3 py-2">{index + 1}</td>
                      <td className="px-3 py-2 font-medium" title={wallet.walletAddress}>
                        <button
                          type="button"
                          onClick={() => void handleCopyWallet(wallet.walletAddress)}
                          className="inline-flex items-center gap-2 text-left hover:underline"
                        >
                          <span>{shortenAddress(wallet.walletAddress)}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {copiedWallet === wallet.walletAddress ? 'copié' : 'copier'}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">{formatPercent(wallet.coveragePercent)}</td>
                      <td className="px-3 py-2 text-right">
                        {wallet.tpHitCount}/{wallet.matchedTokenCount} ({formatPercent(wallet.tpHitRate)})
                      </td>
                      <td className="px-3 py-2 text-right">{formatPercent(wallet.entryQualityScore)}</td>
                      <td className="px-3 py-2 text-right">{wallet.compositeScore.toFixed(1)}/100</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
